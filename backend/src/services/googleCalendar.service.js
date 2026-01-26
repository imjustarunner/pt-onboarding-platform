import { google } from 'googleapis';
import pool from '../config/database.js';

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
    const sa = parseServiceAccountJson();
    if (!sa?.client_email || !sa?.private_key) {
      throw new Error('Google Workspace service account JSON is not configured');
    }
    const subject = String(subjectEmail || '').trim().toLowerCase();
    if (!subject) throw new Error('Missing subject (provider email) for calendar impersonation');

    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
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
      const cal = this.buildCalendarClientForSubject(subject);
      const r = await cal.freebusy.query({
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
      return { ok: false, reason: 'freebusy_failed', error: String(e?.message || e), busy: [] };
    }
  }

  static async dryRunBookedOfficeEvent({ officeEventId }) {
    const eid = parseInt(officeEventId, 10);
    if (!eid) return { ok: false, reason: 'invalid_office_event_id' };

    const [rows] = await pool.execute(
      `SELECT
         e.id,
         e.slot_state,
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
       LEFT JOIN users u ON u.id = e.booked_provider_id
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
    if (slotState !== 'ASSIGNED_BOOKED') missing.push('slot_state_not_assigned_booked');
    if (!providerEmail) missing.push('provider_email');
    if (!roomResourceEmail) missing.push('room_google_resource_email');
    if (!start) missing.push('start_at');
    if (!end) missing.push('end_at');

    const buildingName = String(row.building_name || '').trim() || 'Building';
    const officeLabel = officeLabelFromRoom({
      label: row.room_label,
      room_number: row.room_number,
      name: row.room_name
    });

    return {
      ok: missing.length === 0,
      officeEventId: eid,
      missing,
      wouldWrite: missing.length === 0,
      preview: {
        summary: `${buildingName} • ${officeLabel} — Booked`,
        providerEmail: providerEmail || null,
        roomResourceEmail: roomResourceEmail || null,
        timeZone,
        start,
        end
      }
    };
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
       LEFT JOIN users u ON u.id = e.booked_provider_id
       WHERE e.id = ?
       LIMIT 1`,
      [eid]
    );
    const row = rows?.[0] || null;
    if (!row) return { ok: false, reason: 'event_not_found' };

    const slotState = String(row.slot_state || '').toUpperCase();
    if (slotState !== 'ASSIGNED_BOOKED') {
      return { ok: false, reason: 'not_assigned_booked' };
    }

    const providerEmail = String(row.provider_email || '').trim().toLowerCase();
    if (!providerEmail) {
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'FAILED',
             google_sync_error = 'Missing booked provider email',
             google_synced_at = NULL
         WHERE id = ?`,
        [eid]
      );
      return { ok: false, reason: 'missing_provider_email' };
    }

    const roomResourceEmail = String(row.room_google_resource_email || '').trim().toLowerCase();
    if (!roomResourceEmail) {
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
    const summary = `${buildingName} • ${officeLabel} — Booked`;

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

    const cal = this.buildCalendarClientForSubject(providerEmail);
    const calendarId = 'primary';

    const requestBody = {
      summary,
      start: { dateTime: start, timeZone },
      end: { dateTime: end, timeZone },
      attendees: [{ email: roomResourceEmail }],
      extendedProperties: {
        private: {
          pt_office_event_id: String(eid),
          pt_building_id: String(row.office_location_id),
          pt_office_id: String(row.room_id),
          pt_slot_state: 'ASSIGNED_BOOKED'
        }
      }
    };

    const existingGoogleEventId = String(row.google_provider_event_id || '').trim();
    let googleEventId = existingGoogleEventId || null;

    try {
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'PENDING',
             google_sync_error = NULL
         WHERE id = ?`,
        [eid]
      );

      if (googleEventId) {
        const upd = await cal.events.patch({
          calendarId,
          eventId: googleEventId,
          requestBody
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

      await pool.execute(
        `UPDATE office_events
         SET google_provider_event_id = ?,
             google_provider_calendar_id = ?,
             google_room_resource_email = ?,
             google_sync_status = 'SYNCED',
             google_sync_error = NULL,
             google_synced_at = NOW()
         WHERE id = ?`,
        [googleEventId, providerEmail, roomResourceEmail, eid]
      );

      return { ok: true, googleEventId, providerEmail, roomResourceEmail };
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
      return { ok: false, reason: 'google_api_error', error: msg };
    }
  }
}

export default GoogleCalendarService;

