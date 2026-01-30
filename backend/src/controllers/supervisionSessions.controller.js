import { body, validationResult } from 'express-validator';
import User from '../models/User.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';

function requireValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    return false;
  }
  return true;
}

function parseDateTimeLocalString(s) {
  // Accept "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD HH:MM:SS" or ISO strings.
  const raw = String(s || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    // Convert to MySQL DATETIME "YYYY-MM-DD HH:MM:SS" in local time
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  // Fall back: allow already formatted datetime
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)) return raw.replace('T', ' ');
  return null;
}

async function requireUsersInAgency({ agencyId, supervisorUserId, superviseeUserId }) {
  const supAgencies = await User.getAgencies(supervisorUserId);
  const svAgencies = await User.getAgencies(superviseeUserId);
  const aId = Number(agencyId);
  const supOk = (supAgencies || []).some((a) => Number(a?.id) === aId);
  const svOk = (svAgencies || []).some((a) => Number(a?.id) === aId);
  return { supOk, svOk };
}

async function canScheduleSession(req, { agencyId, supervisorUserId, superviseeUserId }) {
  const role = String(req.user?.role || '').toLowerCase();
  const actorId = Number(req.user?.id || 0);
  const aId = Number(agencyId);

  if (role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff' || role === 'clinical_practice_assistant') {
    // Must share agency with both (best-effort)
    const actorAgencies = await User.getAgencies(actorId);
    const hasAccess = (actorAgencies || []).some((a) => Number(a?.id) === aId);
    return hasAccess;
  }

  // Provider/school staff etc: allow only if actor participates and assignment exists.
  if (actorId === Number(superviseeUserId)) {
    return await SupervisorAssignment.isAssigned(supervisorUserId, superviseeUserId, aId);
  }
  if (actorId === Number(supervisorUserId)) {
    return await SupervisorAssignment.isAssigned(supervisorUserId, superviseeUserId, aId);
  }
  return false;
}

export const createSupervisionSessionValidators = [
  body('agencyId').isInt({ min: 1 }).withMessage('agencyId is required'),
  body('supervisorUserId').isInt({ min: 1 }).withMessage('supervisorUserId is required'),
  body('superviseeUserId').isInt({ min: 1 }).withMessage('superviseeUserId is required'),
  body('startAt').not().isEmpty().withMessage('startAt is required'),
  body('endAt').not().isEmpty().withMessage('endAt is required'),
  body('createMeetLink').optional().isBoolean().withMessage('createMeetLink must be boolean')
];

export const patchSupervisionSessionValidators = [
  body('startAt').optional(),
  body('endAt').optional(),
  body('notes').optional(),
  body('modality').optional(),
  body('locationText').optional(),
  body('createMeetLink').optional().isBoolean().withMessage('createMeetLink must be boolean')
];

export const createSupervisionSession = async (req, res, next) => {
  try {
    if (!requireValid(req, res)) return;
    const agencyId = parseInt(req.body?.agencyId, 10);
    const supervisorUserId = parseInt(req.body?.supervisorUserId, 10);
    const superviseeUserId = parseInt(req.body?.superviseeUserId, 10);
    const startAt = parseDateTimeLocalString(req.body?.startAt);
    const endAt = parseDateTimeLocalString(req.body?.endAt);
    const modality = req.body?.modality ?? null;
    const locationText = req.body?.locationText ?? null;
    const notes = req.body?.notes ?? null;
    const createMeetLink = req.body?.createMeetLink === true;

    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    if (endAt <= startAt) return res.status(400).json({ error: { message: 'endAt must be after startAt' } });

    const ok = await canScheduleSession(req, { agencyId, supervisorUserId, superviseeUserId });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const { supOk, svOk } = await requireUsersInAgency({ agencyId, supervisorUserId, superviseeUserId });
    if (!supOk) return res.status(400).json({ error: { message: 'Supervisor does not belong to this agency' } });
    if (!svOk) return res.status(400).json({ error: { message: 'Supervisee does not belong to this agency' } });

    const supervisor = await User.findById(supervisorUserId);
    const supervisee = await User.findById(superviseeUserId);
    if (!supervisor || !supervisee) return res.status(404).json({ error: { message: 'User not found' } });

    const created = await SupervisionSession.create({
      agencyId,
      supervisorUserId,
      superviseeUserId,
      startAt,
      endAt,
      modality: modality ? String(modality) : null,
      locationText: locationText ? String(locationText) : null,
      notes: notes ? String(notes) : null,
      createdByUserId: req.user.id
    });

    // Best-effort: sync to Google Calendar on supervisor calendar
    const hostEmail = String(supervisor.email || '').trim().toLowerCase();
    const attendeeEmail = String(supervisee.email || '').trim().toLowerCase();
    const summary = `Supervision — ${(supervisee.first_name || '').trim()} ${(supervisee.last_name || '').trim()}`.trim();
    const desc = notes ? String(notes) : null;
    const sync = await GoogleCalendarService.upsertSupervisionSession({
      supervisionSessionId: created.id,
      hostEmail,
      attendeeEmail,
      startAt,
      endAt,
      summary,
      description: desc,
      createMeetLink
    });

    if (sync?.ok) {
      await SupervisionSession.setGoogleSync(created.id, {
        hostEmail,
        calendarId: sync.calendarId,
        eventId: sync.googleEventId,
        meetLink: sync.meetLink,
        status: 'SYNCED',
        errorMessage: null
      });
    } else {
      await SupervisionSession.setGoogleSync(created.id, {
        hostEmail,
        calendarId: 'primary',
        eventId: null,
        meetLink: null,
        status: 'FAILED',
        errorMessage: sync?.error || sync?.reason || 'Google sync failed'
      });
    }

    const out = await SupervisionSession.findById(created.id);
    res.status(201).json({ ok: true, session: out });
  } catch (e) {
    next(e);
  }
};

export const patchSupervisionSession = async (req, res, next) => {
  try {
    if (!requireValid(req, res)) return;

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });
    if (String(row.status || '').toUpperCase() === 'CANCELLED') {
      return res.status(400).json({ error: { message: 'Cannot edit a cancelled session' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const startAt = req.body?.startAt !== undefined ? parseDateTimeLocalString(req.body?.startAt) : undefined;
    const endAt = req.body?.endAt !== undefined ? parseDateTimeLocalString(req.body?.endAt) : undefined;
    const notes = req.body?.notes !== undefined ? (req.body?.notes ? String(req.body.notes) : '') : undefined;
    const modality = req.body?.modality !== undefined ? (req.body?.modality ? String(req.body.modality) : null) : undefined;
    const locationText = req.body?.locationText !== undefined ? (req.body?.locationText ? String(req.body.locationText) : null) : undefined;
    const createMeetLink = req.body?.createMeetLink === true;

    const nextStart = startAt !== undefined ? startAt : row.start_at;
    const nextEnd = endAt !== undefined ? endAt : row.end_at;
    if (!nextStart || !nextEnd) return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    if (String(nextEnd) <= String(nextStart)) return res.status(400).json({ error: { message: 'endAt must be after startAt' } });

    const updated = await SupervisionSession.updateById(id, {
      startAt: startAt !== undefined ? startAt : undefined,
      endAt: endAt !== undefined ? endAt : undefined,
      notes,
      modality,
      locationText
    });

    // Best-effort: patch/insert Google event on supervisor calendar (keep existing meet link unless requested and missing)
    const supervisor = await User.findById(row.supervisor_user_id);
    const supervisee = await User.findById(row.supervisee_user_id);
    const hostEmail = String(row.google_host_email || supervisor?.email || '').trim().toLowerCase();
    const attendeeEmail = String(supervisee?.email || '').trim().toLowerCase();

    const summary = `Supervision — ${(supervisee?.first_name || '').trim()} ${(supervisee?.last_name || '').trim()}`.trim();
    const desc = updated?.notes ? String(updated.notes) : null;

    const sync = await GoogleCalendarService.upsertSupervisionSession({
      supervisionSessionId: id,
      hostEmail,
      attendeeEmail,
      startAt: nextStart,
      endAt: nextEnd,
      summary,
      description: desc,
      createMeetLink: createMeetLink && !String(row.google_meet_link || '').trim(),
      existingGoogleEventId: row.google_event_id || null,
      existingMeetLink: row.google_meet_link || null
    });

    if (sync?.ok) {
      await SupervisionSession.setGoogleSync(id, {
        hostEmail,
        calendarId: sync.calendarId,
        eventId: sync.googleEventId,
        meetLink: sync.meetLink || row.google_meet_link || null,
        status: 'SYNCED',
        errorMessage: null
      });
    } else {
      await SupervisionSession.setGoogleSync(id, {
        hostEmail,
        calendarId: row.google_calendar_id || 'primary',
        eventId: row.google_event_id || null,
        meetLink: row.google_meet_link || null,
        status: 'FAILED',
        errorMessage: sync?.error || sync?.reason || 'Google sync failed'
      });
    }

    const out = await SupervisionSession.findById(id);
    res.json({ ok: true, session: out });
  } catch (e) {
    next(e);
  }
};

export const cancelSupervisionSession = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const cancelled = await SupervisionSession.cancel(id);

    // Best-effort delete in Google
    const hostEmail = String(row.google_host_email || '').trim() || (await User.findById(row.supervisor_user_id))?.email;
    if (hostEmail && row.google_event_id) {
      await GoogleCalendarService.cancelSupervisionSessionGoogleEvent({
        hostEmail,
        googleEventId: row.google_event_id
      });
    }

    res.json({ ok: true, session: cancelled });
  } catch (e) {
    next(e);
  }
};

