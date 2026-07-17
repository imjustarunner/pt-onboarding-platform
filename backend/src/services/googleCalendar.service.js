import { google } from 'googleapis';
import { randomUUID } from 'crypto';
import pool from '../config/database.js';
import {
  GOOGLE_WORKSPACE_SCOPES,
  parseGoogleWorkspaceServiceAccountFromEnv,
  getWorkspaceClientsForEmployee,
  logGoogleUnauthorizedHint
} from './googleWorkspaceAuth.service.js';
import { ensureMeetAutoTranscriptionEnabled } from './googleMeetTranscript.service.js';

function parseServiceAccountJson() {
  const raw = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON;
  const b64 = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64;

  const jsonText = raw ? raw : (b64 ? Buffer.from(b64, 'base64').toString('utf8') : null);
  if (!jsonText) return null;
  try {
    return typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
  } catch {
    return null;
  }
}

function toRfc3339Local(dateTime) {
  // office_events stores DATETIME without TZ. We send it with a timeZone field.
  // Convert "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
  const s = String(dateTime || '').trim();
  if (!s) return null;
  return s.includes('T') ? s : s.replace(' ', 'T');
}

function officeLabelFromRoom(room) {
  const label = String(room?.label || '').trim();
  if (label) return label;
  const num = room?.room_number ?? room?.roomNumber ?? null;
  if (num !== null && num !== undefined && String(num).trim() !== '') return `Office ${num}`;
  const name = String(room?.name || '').trim();
  return name || 'Office';
}

export class GoogleCalendarService {
  static isConfigured() {
    const sa = parseServiceAccountJson();
    return !!(sa?.client_email && sa?.private_key);
  }

  static buildCalendarClientForSubject(subjectEmail) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    if (!subject) throw new Error('Missing subject (provider email) for calendar impersonation');

    // Keep this synchronous for existing callers (e.g. office-event sync).
    // Prefer base64 env for consistency; fall back to legacy raw JSON if present.
    const sa = parseGoogleWorkspaceServiceAccountFromEnv() || parseServiceAccountJson();
    if (!sa?.client_email || !sa?.private_key) {
      throw new Error('Google Workspace service account JSON is not configured');
    }

    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      // Use the full Workspace scope list (calendar + gmail) so one DWD config covers all.
      scopes: GOOGLE_WORKSPACE_SCOPES,
      subject
    });

    return google.calendar({ version: 'v3', auth });
  }

  static async freeBusy({ subjectEmail, timeMin, timeMax, calendarId = 'primary' }) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    if (!subject) return { ok: false, reason: 'missing_subject_email', busy: [] };
    if (!timeMin || !timeMax) return { ok: false, reason: 'missing_time_window', busy: [] };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured', busy: [] };

    try {
      const { calendar } = await getWorkspaceClientsForEmployee({ subjectEmail: subject });
      const r = await calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          items: [{ id: calendarId }]
        }
      });
      const busy = r?.data?.calendars?.[calendarId]?.busy || r?.data?.calendars?.primary?.busy || [];
      return {
        ok: true,
        busy: (busy || []).map((b) => ({
          startAt: b.start || null,
          endAt: b.end || null
        })).filter((x) => x.startAt && x.endAt)
      };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.freeBusy' });
      return { ok: false, reason: 'freebusy_failed', error: String(e?.message || e), busy: [] };
    }
  }

  static async listEvents({ subjectEmail, timeMin, timeMax, calendarId = 'primary', maxItems = 250 } = {}) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    if (!subject) return { ok: false, reason: 'missing_subject_email', events: [] };
    if (!timeMin || !timeMax) return { ok: false, reason: 'missing_time_window', events: [] };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured', events: [] };

    try {
      const { calendar } = await getWorkspaceClientsForEmployee({ subjectEmail: subject });
      const items = [];
      let pageToken = undefined;
      let guard = 0;
      while (items.length < maxItems && guard < 6) {
        guard += 1;
        const r = await calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: Math.min(250, maxItems - items.length),
          pageToken,
          fields: 'items(id,summary,htmlLink,start,end),nextPageToken'
        });
        const nextItems = r?.data?.items || [];
        for (const ev of nextItems) {
          const startAt = ev?.start?.dateTime || ev?.start?.date || null;
          const endAt = ev?.end?.dateTime || ev?.end?.date || null;
          items.push({
            id: ev?.id || null,
            summary: ev?.summary || null,
            htmlLink: ev?.htmlLink || null,
            startAt,
            endAt
          });
        }
        pageToken = r?.data?.nextPageToken;
        if (!pageToken) break;
      }
      return { ok: true, events: items.filter((x) => x.startAt && x.endAt) };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.listEvents' });
      return { ok: false, reason: 'events_list_failed', error: String(e?.message || e), events: [] };
    }
  }

  static async getEvent({ subjectEmail, calendarId = 'primary', eventId } = {}) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    const eid = String(eventId || '').trim();
    if (!subject) return { ok: false, reason: 'missing_subject_email' };
    if (!eid) return { ok: false, reason: 'missing_event_id' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    try {
      const { calendar } = await getWorkspaceClientsForEmployee({ subjectEmail: subject });
      const r = await calendar.events.get({
        calendarId,
        eventId: eid,
        fields: 'id,summary,description,location,htmlLink,start,end,status,conferenceData,hangoutLink'
      });
      const ev = r?.data;
      if (!ev) return { ok: false, reason: 'event_not_found' };

      const startAt = ev?.start?.dateTime || ev?.start?.date || null;
      const endAt = ev?.end?.dateTime || ev?.end?.date || null;
      const allDay = !!(ev?.start?.date && !ev?.start?.dateTime);
      const meetLink =
        ev?.conferenceData?.entryPoints?.find((e) => e?.entryPointType === 'video')?.uri ||
        ev?.hangoutLink ||
        null;

      return {
        ok: true,
        event: {
          id: ev?.id || null,
          summary: ev?.summary || null,
          description: ev?.description || null,
          location: ev?.location || null,
          htmlLink: ev?.htmlLink || null,
          startAt,
          endAt,
          allDay,
          meetLink,
          status: String(ev?.status || 'confirmed').toLowerCase()
        }
      };
    } catch (e) {
      const code = Number(e?.code || e?.response?.status || 0);
      if (code === 404) return { ok: false, reason: 'event_not_found', error: 'Event not found or deleted' };
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.getEvent' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static async patchEvent({ subjectEmail, calendarId = 'primary', eventId, summary, description, location, startAt, endAt } = {}) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    const eid = String(eventId || '').trim();
    if (!subject) return { ok: false, reason: 'missing_subject_email' };
    if (!eid) return { ok: false, reason: 'missing_event_id' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    const requestBody = {};
    if (summary !== undefined && summary !== null) requestBody.summary = String(summary).trim() || '';
    if (description !== undefined && description !== null) requestBody.description = String(description).trim() || '';
    if (location !== undefined && location !== null) requestBody.location = String(location).trim() || '';

    if (startAt !== undefined && startAt !== null) {
      const s = String(startAt).trim();
      if (s) requestBody.start = { dateTime: s.includes('T') ? s : `${s}T00:00:00`, timeZone: 'America/New_York' };
    }
    if (endAt !== undefined && endAt !== null) {
      const s = String(endAt).trim();
      if (s) requestBody.end = { dateTime: s.includes('T') ? s : `${s}T00:00:00`, timeZone: 'America/New_York' };
    }

    if (Object.keys(requestBody).length === 0) {
      return { ok: false, reason: 'no_updates', error: 'No fields to update' };
    }

    try {
      const cal = this.buildCalendarClientForSubject(subject);
      const upd = await cal.events.patch({
        calendarId,
        eventId: eid,
        requestBody,
        sendUpdates: 'all'
      });
      const ev = upd?.data;
      const startAtOut = ev?.start?.dateTime || ev?.start?.date || null;
      const endAtOut = ev?.end?.dateTime || ev?.end?.date || null;
      const allDay = !!(ev?.start?.date && !ev?.start?.dateTime);
      const meetLink =
        ev?.conferenceData?.entryPoints?.find((e) => e?.entryPointType === 'video')?.uri ||
        ev?.hangoutLink ||
        null;

      return {
        ok: true,
        event: {
          id: ev?.id || null,
          summary: ev?.summary || null,
          description: ev?.description || null,
          location: ev?.location || null,
          htmlLink: ev?.htmlLink || null,
          startAt: startAtOut,
          endAt: endAtOut,
          allDay,
          meetLink,
          status: String(ev?.status || 'confirmed').toLowerCase()
        }
      };
    } catch (e) {
      const code = Number(e?.code || e?.response?.status || 0);
      if (code === 404) return { ok: false, reason: 'event_not_found', error: 'Event not found or deleted' };
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.patchEvent' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static async deleteEvent({ subjectEmail, calendarId = 'primary', eventId } = {}) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    const eid = String(eventId || '').trim();
    if (!subject) return { ok: false, reason: 'missing_subject_email' };
    if (!eid) return { ok: false, reason: 'missing_event_id' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    try {
      const cal = this.buildCalendarClientForSubject(subject);
      await cal.events.delete({ calendarId, eventId: eid, sendUpdates: 'all' });
      return { ok: true };
    } catch (e) {
      const code = Number(e?.code || e?.response?.status || 0);
      if (code === 404) return { ok: true, skipped: true, reason: 'already_deleted' };
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.deleteEvent' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  /**
   * Update only the start/end times of an existing Google Calendar event.
   * Used by the meeting reschedule flow.
   */
  static async patchEventTimes({
    subjectEmail,
    calendarId = 'primary',
    eventId,
    startAtIso,
    endAtIso,
    timeZone = null
  } = {}) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    const eid = String(eventId || '').trim();
    if (!subject) return { ok: false, reason: 'missing_subject_email' };
    if (!eid) return { ok: false, reason: 'missing_event_id' };
    if (!startAtIso || !endAtIso) return { ok: false, reason: 'missing_time' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    try {
      const cal = this.buildCalendarClientForSubject(subject);
      const tz = timeZone || process.env.GOOGLE_CALENDAR_DEFAULT_TZ || 'America/New_York';
      await cal.events.patch({
        calendarId,
        eventId: eid,
        sendUpdates: 'all',
        requestBody: {
          start: { dateTime: startAtIso, timeZone: tz },
          end: { dateTime: endAtIso, timeZone: tz }
        }
      });
      return { ok: true };
    } catch (e) {
      const code = Number(e?.code || e?.response?.status || 0);
      if (code === 404) return { ok: true, skipped: true, reason: 'event_not_found' };
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.patchEventTimes' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static async createProviderScheduleEvent({
    subjectEmail,
    startAt = null,
    endAt = null,
    allDay = false,
    startDate = null,
    endDate = null,
    timeZone = 'America/New_York',
    summary,
    description = null,
    kind = 'PERSONAL_EVENT',
    reasonCode = null,
    isPrivate = false,
    attendeeEmails = [],
    createMeetLink = false
  } = {}) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    if (!subject) return { ok: false, reason: 'missing_subject_email' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    const normalizedSummary = String(summary || '').trim();
    if (!normalizedSummary) return { ok: false, reason: 'missing_summary' };

    const isAllDay = allDay === true;
    if (isAllDay) {
      const sDate = String(startDate || '').slice(0, 10);
      const eDate = String(endDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sDate) || !/^\d{4}-\d{2}-\d{2}$/.test(eDate)) {
        return { ok: false, reason: 'missing_start_end' };
      }
    } else if (!startAt || !endAt) {
      return { ok: false, reason: 'missing_start_end' };
    }

    const cal = this.buildCalendarClientForSubject(subject);
    const calendarId = 'primary';
    const normalizedKind = String(kind || 'PERSONAL_EVENT').trim().toUpperCase();
    const normalizedReason = String(reasonCode || '').trim().toUpperCase() || null;
    const attendees = Array.from(new Set((Array.isArray(attendeeEmails) ? attendeeEmails : [])
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean)))
      .filter((email) => email !== subject);

    const requestBody = {
      summary: normalizedSummary,
      description: description ? String(description) : undefined,
      visibility: isPrivate ? 'private' : undefined,
      ...(isAllDay
        ? {
            start: { date: String(startDate).slice(0, 10) },
            end: { date: String(endDate).slice(0, 10) }
          }
        : {
            start: { dateTime: toRfc3339Local(startAt), timeZone },
            end: { dateTime: toRfc3339Local(endAt), timeZone }
          }),
      extendedProperties: {
        private: {
          pt_kind: 'PROVIDER_SCHEDULE_EVENT',
          pt_schedule_event_kind: normalizedKind,
          ...(normalizedReason ? { pt_schedule_event_reason: normalizedReason } : {})
        }
      },
      ...(attendees.length ? { attendees: attendees.map((email) => ({ email })) } : {})
    };
    if (createMeetLink) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      };
    }

    try {
      const ins = await cal.events.insert({
        calendarId,
        requestBody,
        ...(createMeetLink ? { conferenceDataVersion: 1 } : {})
      });
      const data = ins?.data || {};
      const meetLink = data?.hangoutLink
        || data?.conferenceData?.entryPoints?.find((e) => e?.entryPointType === 'video')?.uri
        || null;
      // Return canonical start/end from Google (RFC3339) so we can store UTC and avoid timezone drift
      const startAt = data?.start?.dateTime || data?.start?.date || null;
      const endAt = data?.end?.dateTime || data?.end?.date || null;
      return {
        ok: true,
        eventId: data?.id || null,
        htmlLink: data?.htmlLink || null,
        meetLink,
        startAt,
        endAt
      };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.createProviderScheduleEvent' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  /**
   * Append text to a calendar event's description (e.g. app join URL for team meetings).
   */
  static async appendToEventDescription({ subjectEmail, googleEventId, appendText }) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    const gid = String(googleEventId || '').trim();
    const append = String(appendText || '').trim();
    if (!subject || !gid || !append) return { ok: false, reason: 'missing_params' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    try {
      const cal = this.buildCalendarClientForSubject(subject);
      const getResp = await cal.events.get({ calendarId: 'primary', eventId: gid });
      const data = getResp?.data || {};
      const currentDesc = String(data?.description || '').trim();
      const newDesc = currentDesc ? `${currentDesc}\n\n${append}` : append;

      await cal.events.patch({
        calendarId: 'primary',
        eventId: gid,
        requestBody: { description: newDesc },
        sendUpdates: 'all'
      });
      return { ok: true };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.appendToEventDescription' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static async dryRunBookedOfficeEvent({ officeEventId }) {
    const eid = parseInt(officeEventId, 10);
    if (!eid) return { ok: false, reason: 'invalid_office_event_id' };

    const [rows] = await pool.execute(
      `SELECT
         e.id,
         e.slot_state,
         e.status,
         e.start_at,
         e.end_at,
         e.office_location_id,
         e.room_id,
         ol.name AS building_name,
         ol.timezone AS building_timezone,
         r.google_resource_email AS room_google_resource_email,
         r.label AS room_label,
         r.room_number AS room_number,
         r.name AS room_name,
         u.email AS provider_email
       FROM office_events e
       JOIN office_locations ol ON ol.id = e.office_location_id
       JOIN office_rooms r ON r.id = e.room_id
       LEFT JOIN users u ON u.id = CASE
         WHEN UPPER(COALESCE(e.slot_state, '')) = 'ASSIGNED_BOOKED' THEN e.booked_provider_id
         ELSE e.assigned_provider_id
       END
       WHERE e.id = ?
       LIMIT 1`,
      [eid]
    );
    const row = rows?.[0] || null;
    if (!row) return { ok: false, reason: 'event_not_found' };

    const slotState = String(row.slot_state || '').toUpperCase();
    const providerEmail = String(row.provider_email || '').trim().toLowerCase();
    const roomResourceEmail = String(row.room_google_resource_email || '').trim().toLowerCase();
    const timeZone = String(row.building_timezone || '').trim() || 'America/New_York';
    const start = toRfc3339Local(row.start_at);
    const end = toRfc3339Local(row.end_at);

    const missing = [];
    if (!this.isConfigured()) missing.push('service_account');
    if (!['ASSIGNED_BOOKED', 'ASSIGNED_AVAILABLE'].includes(slotState)) missing.push('slot_state_not_syncable');
    if (String(row.status || '').toUpperCase() === 'CANCELLED') missing.push('event_cancelled');
    if (!providerEmail) missing.push('provider_email');
    if (slotState === 'ASSIGNED_BOOKED' && !roomResourceEmail) missing.push('room_google_resource_email');
    if (!start) missing.push('start_at');
    if (!end) missing.push('end_at');

    const buildingName = String(row.building_name || '').trim() || 'Building';
    const officeLabel = officeLabelFromRoom({
      label: row.room_label,
      room_number: row.room_number,
      name: row.room_name
    });
    const summarySuffix = slotState === 'ASSIGNED_BOOKED' ? 'Booked' : 'Assigned';

    return {
      ok: missing.length === 0,
      officeEventId: eid,
      missing,
      wouldWrite: missing.length === 0,
      preview: {
        summary: `${buildingName} • ${officeLabel} — ${summarySuffix}`,
        providerEmail: providerEmail || null,
        roomResourceEmail: roomResourceEmail || null,
        timeZone,
        start,
        end
      }
    };
  }

  static async upsertProviderPrimaryCalendarEvent({
    subjectEmail,
    existingGoogleEventId = null,
    summary,
    description = null,
    location = null,
    startAt = null,
    endAt = null,
    timeZone = 'America/New_York',
    allDay = false,
    startDate = null,
    endDate = null,
    attendees = [],
    extendedProperties = {}
  } = {}) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    if (!subject) return { ok: false, reason: 'missing_subject_email' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };
    const normalizedSummary = String(summary || '').trim();
    if (!normalizedSummary) return { ok: false, reason: 'missing_summary' };

    const requestBody = {
      summary: normalizedSummary,
      ...(description ? { description: String(description) } : {}),
      ...(location ? { location: String(location) } : {}),
      ...(Object.keys(extendedProperties || {}).length
        ? { extendedProperties: { private: extendedProperties } }
        : {})
    };

    if (allDay) {
      const sDate = String(startDate || '').slice(0, 10);
      const eDate = String(endDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sDate) || !/^\d{4}-\d{2}-\d{2}$/.test(eDate)) {
        return { ok: false, reason: 'missing_start_end' };
      }
      requestBody.start = { date: sDate };
      requestBody.end = { date: eDate };
    } else {
      const start = toRfc3339Local(startAt);
      const end = toRfc3339Local(endAt);
      if (!start || !end) return { ok: false, reason: 'missing_start_end' };
      requestBody.start = { dateTime: start, timeZone };
      requestBody.end = { dateTime: end, timeZone };
    }

    const attendeeEmails = Array.from(new Set((Array.isArray(attendees) ? attendees : [])
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean)))
      .filter((email) => email !== subject);
    if (attendeeEmails.length) {
      requestBody.attendees = attendeeEmails.map((email) => ({ email }));
    }

    const cal = this.buildCalendarClientForSubject(subject);
    const calendarId = 'primary';
    let googleEventId = String(existingGoogleEventId || '').trim() || null;

    try {
      if (googleEventId) {
        const upd = await cal.events.patch({
          calendarId,
          eventId: googleEventId,
          requestBody,
          sendUpdates: 'all'
        });
        googleEventId = upd.data?.id || googleEventId;
      } else {
        const ins = await cal.events.insert({
          calendarId,
          requestBody,
          sendUpdates: 'all'
        });
        googleEventId = ins.data?.id || null;
      }
      return { ok: true, googleEventId, calendarId: subject, htmlLink: null };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.upsertProviderPrimaryCalendarEvent' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static async cancelProviderPrimaryCalendarEvent({ subjectEmail, googleEventId }) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    const eventId = String(googleEventId || '').trim();
    if (!subject) return { ok: false, reason: 'missing_subject_email' };
    if (!eventId) return { ok: true, skipped: true, reason: 'no_google_event_linked' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    const cal = this.buildCalendarClientForSubject(subject);
    const calendarId = 'primary';
    try {
      await cal.events.delete({ calendarId, eventId, sendUpdates: 'all' });
      return { ok: true };
    } catch (e) {
      const code = Number(e?.code || e?.response?.status || 0);
      if (code === 404) return { ok: true, skipped: true, reason: 'already_deleted_remote' };
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.cancelProviderPrimaryCalendarEvent' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static async upsertBookedOfficeEvent({ officeEventId }) {
    const eid = parseInt(officeEventId, 10);
    if (!eid) return { ok: false, reason: 'invalid_office_event_id' };

    // Load event + building + office(room) + provider
    const [rows] = await pool.execute(
      `SELECT
         e.*,
         ol.name AS building_name,
         ol.timezone AS building_timezone,
         r.name AS room_name,
         r.room_number AS room_number,
         r.label AS room_label,
         r.google_resource_email AS room_google_resource_email,
         u.email AS provider_email,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name
       FROM office_events e
       JOIN office_locations ol ON ol.id = e.office_location_id
       JOIN office_rooms r ON r.id = e.room_id
       LEFT JOIN users u ON u.id = CASE
         WHEN UPPER(COALESCE(e.slot_state, '')) = 'ASSIGNED_BOOKED' THEN e.booked_provider_id
         ELSE e.assigned_provider_id
       END
       WHERE e.id = ?
       LIMIT 1`,
      [eid]
    );
    const row = rows?.[0] || null;
    if (!row) return { ok: false, reason: 'event_not_found' };

    const slotState = String(row.slot_state || '').toUpperCase();
    if (!['ASSIGNED_BOOKED', 'ASSIGNED_AVAILABLE'].includes(slotState)) {
      return { ok: false, reason: 'not_syncable_slot_state' };
    }
    if (String(row.status || '').toUpperCase() === 'CANCELLED') {
      return { ok: false, reason: 'event_cancelled' };
    }

    const providerEmail = String(row.provider_email || '').trim().toLowerCase();
    if (!providerEmail) {
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'FAILED',
             google_sync_error = 'Missing assigned provider email',
             google_synced_at = NULL
         WHERE id = ?`,
        [eid]
      );
      return { ok: false, reason: 'missing_provider_email' };
    }

    const roomResourceEmail = String(row.room_google_resource_email || '').trim().toLowerCase();
    if (slotState === 'ASSIGNED_BOOKED' && !roomResourceEmail) {
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'FAILED',
             google_sync_error = 'Missing room google_resource_email',
             google_synced_at = NULL
         WHERE id = ?`,
        [eid]
      );
      return { ok: false, reason: 'missing_room_resource_email' };
    }

    const buildingName = String(row.building_name || '').trim() || 'Building';
    const officeLabel = officeLabelFromRoom({
      label: row.room_label,
      room_number: row.room_number,
      name: row.room_name
    });
    const summarySuffix = slotState === 'ASSIGNED_BOOKED' ? 'Booked' : 'Assigned';
    const summary = `${buildingName} • ${officeLabel} — ${summarySuffix}`;

    const timeZone = String(row.building_timezone || '').trim() || 'America/New_York';
    const start = toRfc3339Local(row.start_at);
    const end = toRfc3339Local(row.end_at);
    if (!start || !end) {
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'FAILED',
             google_sync_error = 'Missing start_at/end_at',
             google_synced_at = NULL
         WHERE id = ?`,
        [eid]
      );
      return { ok: false, reason: 'missing_start_end' };
    }

    const attendees = roomResourceEmail ? [roomResourceEmail] : [];

    try {
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'PENDING',
             google_sync_error = NULL
         WHERE id = ?`,
        [eid]
      );
    } catch {
      // best-effort status flag
    }

    const syncResult = await this.upsertProviderPrimaryCalendarEvent({
      subjectEmail: providerEmail,
      existingGoogleEventId: row.google_provider_event_id,
      summary,
      startAt: row.start_at,
      endAt: row.end_at,
      timeZone,
      attendees,
      extendedProperties: {
        pt_office_event_id: String(eid),
        pt_building_id: String(row.office_location_id),
        pt_office_id: String(row.room_id),
        pt_slot_state: slotState
      }
    });

    if (!syncResult?.ok) {
      const msg = String(syncResult?.error || syncResult?.reason || 'google_api_error').slice(0, 4000);
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'FAILED',
             google_sync_error = ?,
             google_synced_at = NULL
         WHERE id = ?`,
        [msg, eid]
      );
      return syncResult;
    }

    const googleEventId = syncResult.googleEventId || null;
    try {
      await pool.execute(
        `UPDATE office_events
         SET google_provider_event_id = ?,
             google_provider_calendar_id = ?,
             google_room_resource_email = ?,
             google_sync_status = 'SYNCED',
             google_sync_error = NULL,
             google_synced_at = NOW()
         WHERE id = ?`,
        [googleEventId, providerEmail, roomResourceEmail || null, eid]
      );
      return { ok: true, googleEventId, providerEmail, roomResourceEmail: roomResourceEmail || null };
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 4000);
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'FAILED',
             google_sync_error = ?,
             google_synced_at = NULL
         WHERE id = ?`,
        [msg, eid]
      );
      return { ok: false, reason: 'db_update_failed', error: msg };
    }
  }

  static async upsertSupervisionSession({
    supervisionSessionId,
    hostEmail,
    attendeeEmail,
    additionalAttendeeEmails = [],
    startAt,
    endAt,
    timeZone = 'America/New_York',
    summary,
    description = null,
    createMeetLink = false,
    appJoinUrl = null,
    existingGoogleEventId = null,
    existingMeetLink = null
  }) {
    const subject = String(hostEmail || '').trim().toLowerCase();
    if (!subject) return { ok: false, reason: 'missing_host_email' };
    const attendee = String(attendeeEmail || '').trim().toLowerCase();
    if (!attendee) return { ok: false, reason: 'missing_attendee_email' };
    if (!startAt || !endAt) return { ok: false, reason: 'missing_start_end' };

    const cal = this.buildCalendarClientForSubject(subject);
    const calendarId = 'primary';

    const extraAttendees = Array.from(
      new Set(
        (Array.isArray(additionalAttendeeEmails) ? additionalAttendeeEmails : [])
          .map((raw) => String(raw || '').trim().toLowerCase())
          .filter((email) => email && email !== attendee && email !== subject)
      )
    );
    const attendees = [{ email: attendee }, ...extraAttendees.map((email) => ({ email }))];

    let finalDescription = description ? String(description) : '';
    if (appJoinUrl && String(appJoinUrl).trim()) {
      const joinLine = `\n\nJoin video: ${String(appJoinUrl).trim()}`;
      finalDescription = (finalDescription + joinLine).trim();
    }
    const requestBody = {
      summary: String(summary || 'Supervision').trim() || 'Supervision',
      description: finalDescription || undefined,
      start: { dateTime: toRfc3339Local(startAt), timeZone },
      end: { dateTime: toRfc3339Local(endAt), timeZone },
      attendees,
      extendedProperties: {
        private: {
          pt_supervision_session_id: String(supervisionSessionId || ''),
          pt_kind: 'SUPERVISION_SESSION'
        }
      }
    };

    const hasExistingMeet = !!String(existingMeetLink || '').trim();
    if (createMeetLink && !hasExistingMeet) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: `pt-sup-${supervisionSessionId}-${Date.now()}`
        }
      };
    }

    try {
      let data;
      let googleEventId = String(existingGoogleEventId || '').trim() || null;

      if (googleEventId) {
        const upd = await cal.events.patch({
          calendarId,
          eventId: googleEventId,
          requestBody,
          sendUpdates: 'all',
          ...(createMeetLink ? { conferenceDataVersion: 1 } : {})
        });
        data = upd.data;
      } else {
        const ins = await cal.events.insert({
          calendarId,
          requestBody,
          sendUpdates: 'all',
          ...(createMeetLink ? { conferenceDataVersion: 1 } : {})
        });
        data = ins.data;
        googleEventId = data?.id || null;
      }

      const meetLink =
        data?.conferenceData?.entryPoints?.find((e) => e?.entryPointType === 'video')?.uri ||
        data?.hangoutLink ||
        null;

      // Best-effort: keep Meet spaces defaulted to auto-transcription ON whenever a Meet link exists.
      if (meetLink) {
        await ensureMeetAutoTranscriptionEnabled({
          hostEmail: subject,
          meetLink
        });
      }

      return { ok: true, googleEventId, calendarId, meetLink };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.upsertSupervisionSession' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static async createTimeClaimMeetEvent({
    hostEmail,
    startAt,
    endAt,
    timeZone = 'America/New_York',
    summary = 'Meeting/Training',
    description = null
  } = {}) {
    const subject = String(hostEmail || '').trim().toLowerCase();
    if (!subject) return { ok: false, reason: 'missing_host_email' };
    if (!startAt || !endAt) return { ok: false, reason: 'missing_start_end' };

    const cal = this.buildCalendarClientForSubject(subject);
    const calendarId = 'primary';
    const requestBody = {
      summary: String(summary || 'Meeting/Training').trim() || 'Meeting/Training',
      description: description ? String(description) : undefined,
      start: { dateTime: toRfc3339Local(startAt), timeZone },
      end: { dateTime: toRfc3339Local(endAt), timeZone }
    };
    requestBody.conferenceData = {
      createRequest: {
        requestId: `pt-time-claim-${Date.now()}-${Math.floor(Math.random() * 100000)}`
      }
    };

    try {
      const ins = await cal.events.insert({
        calendarId,
        requestBody,
        sendUpdates: 'all',
        conferenceDataVersion: 1
      });
      const data = ins?.data || {};
      const meetLink =
        data?.conferenceData?.entryPoints?.find((e) => e?.entryPointType === 'video')?.uri ||
        data?.hangoutLink ||
        null;
      const googleEventId = data?.id || null;

      if (meetLink) {
        await ensureMeetAutoTranscriptionEnabled({
          hostEmail: subject,
          meetLink
        });
      }

      return { ok: true, googleEventId, calendarId, meetLink };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.createTimeClaimMeetEvent' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static async cancelSupervisionSessionGoogleEvent({ hostEmail, googleEventId }) {
    const subject = String(hostEmail || '').trim().toLowerCase();
    const eventId = String(googleEventId || '').trim();
    if (!subject) return { ok: false, reason: 'missing_host_email' };
    if (!eventId) return { ok: false, reason: 'missing_event_id' };

    const cal = this.buildCalendarClientForSubject(subject);
    const calendarId = 'primary';
    try {
      await cal.events.delete({ calendarId, eventId, sendUpdates: 'all' });
      return { ok: true };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.cancelSupervisionSessionGoogleEvent' });
      return { ok: false, reason: 'google_api_error', error: String(e?.message || e) };
    }
  }

  static companyEventAssignmentSummary({ eventTitle, assignmentStatus }) {
    const title = String(eventTitle || '').trim() || 'Program event';
    const status = String(assignmentStatus || 'draft').toLowerCase();
    if (status === 'finalized') return title;
    if (status === 'tentative') return `${title} (Tentative)`;
    if (status === 'draft') return `${title} (Draft)`;
    return title;
  }

  static async upsertCompanyEventSessionProviderGoogle({ sessionProviderId }) {
    const id = parseInt(sessionProviderId, 10);
    if (!id) return { ok: false, reason: 'invalid_session_provider_id' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    const [rows] = await pool.execute(
      `SELECT
         cesp.id,
         cesp.assignment_status,
         cesp.google_provider_event_id,
         cesd.starts_at,
         cesd.ends_at,
         cesd.session_date,
         cesd.timezone,
         cesd.location_label,
         ce.title AS event_title,
         ce.event_type,
         sch.name AS school_name,
         u.email AS provider_email
       FROM company_event_session_providers cesp
       INNER JOIN company_event_session_dates cesd ON cesd.id = cesp.session_date_id
       INNER JOIN company_events ce ON ce.id = cesp.company_event_id
       LEFT JOIN agencies sch ON sch.id = ce.organization_id
       INNER JOIN users u ON u.id = cesp.provider_user_id
       WHERE cesp.id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows?.[0] || null;
    if (!row) return { ok: false, reason: 'assignment_not_found' };

    const providerEmail = String(row.provider_email || '').trim().toLowerCase();
    if (!providerEmail) {
      await pool.execute(
        `UPDATE company_event_session_providers
         SET google_sync_status = 'FAILED', google_sync_error = 'Missing provider email', google_synced_at = NULL
         WHERE id = ?`,
        [id]
      );
      return { ok: false, reason: 'missing_provider_email' };
    }

    const schoolName = String(row.school_name || '').trim();
    let eventTitle = String(row.event_title || '').trim();
    const isSchool = String(row.event_type || '').toLowerCase().startsWith('school_');
    if (isSchool && schoolName && eventTitle && !eventTitle.toLowerCase().includes(schoolName.toLowerCase())) {
      eventTitle = `${eventTitle} — ${schoolName}`;
    }
    const summary = this.companyEventAssignmentSummary({
      eventTitle: eventTitle || (isSchool ? 'School event' : 'Program event'),
      assignmentStatus: row.assignment_status
    });
    const timeZone = String(row.timezone || '').trim() || 'America/New_York';
    const location = String(row.location_label || '').trim() || schoolName || null;
    const startRaw = row.starts_at;
    const endRaw = row.ends_at;
    const sessionDate = row.session_date ? String(row.session_date).slice(0, 10) : null;

    let syncPayload;
    if (startRaw && endRaw) {
      syncPayload = {
        subjectEmail: providerEmail,
        existingGoogleEventId: row.google_provider_event_id,
        summary,
        location,
        startAt: startRaw,
        endAt: endRaw,
        timeZone,
        extendedProperties: {
          pt_kind: 'COMPANY_EVENT_SESSION',
          pt_company_event_session_provider_id: String(id)
        }
      };
    } else if (sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      const nextDay = new Date(`${sessionDate}T12:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDate = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
      syncPayload = {
        subjectEmail: providerEmail,
        existingGoogleEventId: row.google_provider_event_id,
        summary,
        location,
        allDay: true,
        startDate: sessionDate,
        endDate,
        extendedProperties: {
          pt_kind: 'COMPANY_EVENT_SESSION',
          pt_company_event_session_provider_id: String(id)
        }
      };
    } else {
      await pool.execute(
        `UPDATE company_event_session_providers
         SET google_sync_status = 'FAILED', google_sync_error = 'Missing session start/end', google_synced_at = NULL
         WHERE id = ?`,
        [id]
      );
      return { ok: false, reason: 'missing_start_end' };
    }

    await pool.execute(
      `UPDATE company_event_session_providers SET google_sync_status = 'PENDING', google_sync_error = NULL WHERE id = ?`,
      [id]
    );

    const syncResult = await this.upsertProviderPrimaryCalendarEvent(syncPayload);
    if (!syncResult?.ok) {
      const msg = String(syncResult?.error || syncResult?.reason || 'google_api_error').slice(0, 4000);
      await pool.execute(
        `UPDATE company_event_session_providers
         SET google_sync_status = 'FAILED', google_sync_error = ?, google_synced_at = NULL
         WHERE id = ?`,
        [msg, id]
      );
      return syncResult;
    }

    await pool.execute(
      `UPDATE company_event_session_providers
       SET google_provider_event_id = ?,
           google_provider_calendar_id = ?,
           google_sync_status = 'SYNCED',
           google_sync_error = NULL,
           google_synced_at = NOW()
       WHERE id = ?`,
      [syncResult.googleEventId, providerEmail, id]
    );
    return { ok: true, googleEventId: syncResult.googleEventId, providerEmail };
  }

  static async cancelCompanyEventSessionProviderGoogle({ sessionProviderId }) {
    const id = parseInt(sessionProviderId, 10);
    if (!id) return { ok: false, reason: 'invalid_session_provider_id' };

    const [rows] = await pool.execute(
      `SELECT google_provider_event_id, google_provider_calendar_id
       FROM company_event_session_providers
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows?.[0] || null;
    if (!row) return { ok: false, reason: 'assignment_not_found' };

    const googleEventId = String(row.google_provider_event_id || '').trim();
    const providerEmail = String(row.google_provider_calendar_id || '').trim().toLowerCase();
    if (!googleEventId || !providerEmail) {
      await pool.execute(
        `UPDATE company_event_session_providers
         SET google_sync_status = 'SYNCED', google_sync_error = NULL, google_synced_at = NOW(), google_provider_event_id = NULL
         WHERE id = ?`,
        [id]
      );
      return { ok: true, skipped: true, reason: 'no_google_event_linked' };
    }

    const cancelResult = await this.cancelProviderPrimaryCalendarEvent({ subjectEmail: providerEmail, googleEventId });
    if (!cancelResult?.ok) {
      const msg = String(cancelResult?.error || cancelResult?.reason || 'google_api_error').slice(0, 4000);
      await pool.execute(
        `UPDATE company_event_session_providers
         SET google_sync_status = 'FAILED', google_sync_error = ?, google_synced_at = NULL
         WHERE id = ?`,
        [msg, id]
      );
      return cancelResult;
    }

    await pool.execute(
      `UPDATE company_event_session_providers
       SET google_provider_event_id = NULL,
           google_provider_calendar_id = NULL,
           google_sync_status = 'SYNCED',
           google_sync_error = NULL,
           google_synced_at = NOW()
       WHERE id = ?`,
      [id]
    );
    return { ok: true };
  }

  static async upsertSkillBuildersSessionProviderGoogle({ sessionProviderId }) {
    const id = parseInt(sessionProviderId, 10);
    if (!id) return { ok: false, reason: 'invalid_session_provider_id' };
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    const [rows] = await pool.execute(
      `SELECT
         sbesp.id,
         sbesp.google_provider_event_id,
         s.starts_at,
         s.ends_at,
         ce.title AS event_title,
         sg.name AS skills_group_name,
         u.email AS provider_email
       FROM skill_builders_event_session_providers sbesp
       INNER JOIN skill_builders_event_sessions s ON s.id = sbesp.session_id
       INNER JOIN skills_groups sg ON sg.id = s.skills_group_id
       INNER JOIN company_events ce ON ce.id = s.company_event_id
       INNER JOIN users u ON u.id = sbesp.provider_user_id
       WHERE sbesp.id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows?.[0] || null;
    if (!row) return { ok: false, reason: 'assignment_not_found' };

    const providerEmail = String(row.provider_email || '').trim().toLowerCase();
    if (!providerEmail) {
      await pool.execute(
        `UPDATE skill_builders_event_session_providers
         SET google_sync_status = 'FAILED', google_sync_error = 'Missing provider email', google_synced_at = NULL
         WHERE id = ?`,
        [id]
      );
      return { ok: false, reason: 'missing_provider_email' };
    }

    const sgName = String(row.skills_group_name || '').trim();
    const evTitle = String(row.event_title || '').trim();
    const summary = [sgName, evTitle].filter(Boolean).join(' · ') || 'Skill Builders program';

    if (!row.starts_at || !row.ends_at) {
      await pool.execute(
        `UPDATE skill_builders_event_session_providers
         SET google_sync_status = 'FAILED', google_sync_error = 'Missing session start/end', google_synced_at = NULL
         WHERE id = ?`,
        [id]
      );
      return { ok: false, reason: 'missing_start_end' };
    }

    await pool.execute(
      `UPDATE skill_builders_event_session_providers SET google_sync_status = 'PENDING', google_sync_error = NULL WHERE id = ?`,
      [id]
    );

    const syncResult = await this.upsertProviderPrimaryCalendarEvent({
      subjectEmail: providerEmail,
      existingGoogleEventId: row.google_provider_event_id,
      summary,
      startAt: row.starts_at,
      endAt: row.ends_at,
      timeZone: 'America/New_York',
      extendedProperties: {
        pt_kind: 'SKILL_BUILDERS_SESSION',
        pt_skill_builders_session_provider_id: String(id)
      }
    });

    if (!syncResult?.ok) {
      const msg = String(syncResult?.error || syncResult?.reason || 'google_api_error').slice(0, 4000);
      await pool.execute(
        `UPDATE skill_builders_event_session_providers
         SET google_sync_status = 'FAILED', google_sync_error = ?, google_synced_at = NULL
         WHERE id = ?`,
        [msg, id]
      );
      return syncResult;
    }

    await pool.execute(
      `UPDATE skill_builders_event_session_providers
       SET google_provider_event_id = ?,
           google_provider_calendar_id = ?,
           google_sync_status = 'SYNCED',
           google_sync_error = NULL,
           google_synced_at = NOW()
       WHERE id = ?`,
      [syncResult.googleEventId, providerEmail, id]
    );
    return { ok: true, googleEventId: syncResult.googleEventId, providerEmail };
  }

  static async cancelSkillBuildersSessionProviderGoogle({ sessionProviderId }) {
    const id = parseInt(sessionProviderId, 10);
    if (!id) return { ok: false, reason: 'invalid_session_provider_id' };

    const [rows] = await pool.execute(
      `SELECT google_provider_event_id, google_provider_calendar_id
       FROM skill_builders_event_session_providers
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows?.[0] || null;
    if (!row) return { ok: false, reason: 'assignment_not_found' };

    const googleEventId = String(row.google_provider_event_id || '').trim();
    const providerEmail = String(row.google_provider_calendar_id || '').trim().toLowerCase();
    if (!googleEventId || !providerEmail) {
      await pool.execute(
        `UPDATE skill_builders_event_session_providers
         SET google_sync_status = 'SYNCED', google_sync_error = NULL, google_synced_at = NOW(), google_provider_event_id = NULL
         WHERE id = ?`,
        [id]
      );
      return { ok: true, skipped: true, reason: 'no_google_event_linked' };
    }

    const cancelResult = await this.cancelProviderPrimaryCalendarEvent({ subjectEmail: providerEmail, googleEventId });
    if (!cancelResult?.ok) {
      const msg = String(cancelResult?.error || cancelResult?.reason || 'google_api_error').slice(0, 4000);
      await pool.execute(
        `UPDATE skill_builders_event_session_providers
         SET google_sync_status = 'FAILED', google_sync_error = ?, google_synced_at = NULL
         WHERE id = ?`,
        [msg, id]
      );
      return cancelResult;
    }

    await pool.execute(
      `UPDATE skill_builders_event_session_providers
       SET google_provider_event_id = NULL,
           google_provider_calendar_id = NULL,
           google_sync_status = 'SYNCED',
           google_sync_error = NULL,
           google_synced_at = NOW()
       WHERE id = ?`,
      [id]
    );
    return { ok: true };
  }

  static async cancelBookedOfficeEvent({ officeEventId }) {
    const eid = parseInt(officeEventId, 10);
    if (!eid) return { ok: false, reason: 'invalid_office_event_id' };

    const [rows] = await pool.execute(
      `SELECT
         id,
         booked_provider_id,
         google_provider_event_id,
         google_provider_calendar_id,
         google_room_resource_email
       FROM office_events
       WHERE id = ?
       LIMIT 1`,
      [eid]
    );
    const row = rows?.[0] || null;
    if (!row) return { ok: false, reason: 'event_not_found' };

    const googleEventId = String(row.google_provider_event_id || '').trim();
    const providerEmail = String(row.google_provider_calendar_id || '').trim().toLowerCase();
    if (!googleEventId || !providerEmail) {
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'SYNCED',
             google_sync_error = NULL,
             google_synced_at = NOW(),
             google_provider_event_id = NULL
         WHERE id = ?`,
        [eid]
      );
      return { ok: true, skipped: true, reason: 'no_google_event_linked' };
    }

    const cal = this.buildCalendarClientForSubject(providerEmail);
    const calendarId = 'primary';
    try {
      await cal.events.delete({ calendarId, eventId: googleEventId, sendUpdates: 'all' });
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'SYNCED',
             google_sync_error = NULL,
             google_synced_at = NOW(),
             google_provider_event_id = NULL
         WHERE id = ?`,
        [eid]
      );
      return { ok: true };
    } catch (e) {
      const code = Number(e?.code || e?.response?.status || 0);
      if (code === 404) {
        await pool.execute(
          `UPDATE office_events
           SET google_sync_status = 'SYNCED',
               google_sync_error = NULL,
               google_synced_at = NOW(),
               google_provider_event_id = NULL
           WHERE id = ?`,
          [eid]
        );
        return { ok: true, skipped: true, reason: 'already_deleted_remote' };
      }
      const msg = String(e?.message || e).slice(0, 4000);
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'FAILED',
             google_sync_error = ?,
             google_synced_at = NULL
         WHERE id = ?`,
        [msg, eid]
      );
      logGoogleUnauthorizedHint(e, { context: 'GoogleCalendarService.cancelBookedOfficeEvent' });
      return { ok: false, reason: 'google_api_error', error: msg };
    }
  }
}

export default GoogleCalendarService;

