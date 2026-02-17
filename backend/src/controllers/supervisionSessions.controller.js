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

async function getUsersInAgencyMap({ agencyId, userIds = [] }) {
  const aId = Number(agencyId);
  const ids = Array.from(new Set((userIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)));
  const out = {};
  if (!ids.length) return out;
  await Promise.all(ids.map(async (uid) => {
    const agencies = await User.getAgencies(uid);
    out[uid] = (agencies || []).some((a) => Number(a?.id) === aId);
  }));
  return out;
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
  body('sessionType').optional().isIn(['individual', 'triadic', 'group']).withMessage('sessionType must be individual, triadic, or group'),
  body('additionalAttendeeUserIds').optional().isArray().withMessage('additionalAttendeeUserIds must be an array'),
  body('additionalAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('additionalAttendeeUserIds must contain valid user ids'),
  body('requiredAttendeeUserIds').optional().isArray().withMessage('requiredAttendeeUserIds must be an array'),
  body('requiredAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('requiredAttendeeUserIds must contain valid user ids'),
  body('optionalAttendeeUserIds').optional().isArray().withMessage('optionalAttendeeUserIds must be an array'),
  body('optionalAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('optionalAttendeeUserIds must contain valid user ids'),
  body('presenterUserIds').optional().isArray().withMessage('presenterUserIds must be an array'),
  body('presenterUserIds.*').optional().isInt({ min: 1 }).withMessage('presenterUserIds must contain valid user ids'),
  body('startAt').not().isEmpty().withMessage('startAt is required'),
  body('endAt').not().isEmpty().withMessage('endAt is required'),
  body('createMeetLink').optional().isBoolean().withMessage('createMeetLink must be boolean')
];

export const patchSupervisionSessionValidators = [
  body('startAt').optional(),
  body('endAt').optional(),
  body('sessionType').optional().isIn(['individual', 'triadic', 'group']).withMessage('sessionType must be individual, triadic, or group'),
  body('presenterUserIds').optional().isArray().withMessage('presenterUserIds must be an array'),
  body('presenterUserIds.*').optional().isInt({ min: 1 }).withMessage('presenterUserIds must contain valid user ids'),
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
    const sessionType = String(req.body?.sessionType || 'individual').trim().toLowerCase();
    const modality = req.body?.modality ?? null;
    const locationText = req.body?.locationText ?? null;
    const notes = req.body?.notes ?? null;
    const createMeetLink = req.body?.createMeetLink === true;
    const additionalAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.additionalAttendeeUserIds) ? req.body.additionalAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId && n !== superviseeUserId)
      )
    );
    const requiredAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.requiredAttendeeUserIds) ? req.body.requiredAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId && n !== superviseeUserId)
      )
    );
    const optionalAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.optionalAttendeeUserIds) ? req.body.optionalAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId && n !== superviseeUserId)
      )
    );
    const presenterUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.presenterUserIds) ? req.body.presenterUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId)
      )
    ).slice(0, 2);

    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    if (endAt <= startAt) return res.status(400).json({ error: { message: 'endAt must be after startAt' } });

    const ok = await canScheduleSession(req, { agencyId, supervisorUserId, superviseeUserId });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const { supOk, svOk } = await requireUsersInAgency({ agencyId, supervisorUserId, superviseeUserId });
    if (!supOk) return res.status(400).json({ error: { message: 'Supervisor does not belong to this agency' } });
    if (!svOk) return res.status(400).json({ error: { message: 'Supervisee does not belong to this agency' } });
    const allExtraAttendees = Array.from(new Set([
      ...additionalAttendeeUserIds,
      ...requiredAttendeeUserIds,
      ...optionalAttendeeUserIds
    ]));
    if (allExtraAttendees.length) {
      const agencyMap = await getUsersInAgencyMap({ agencyId, userIds: allExtraAttendees });
      const missing = allExtraAttendees.filter((uid) => !agencyMap[uid]);
      if (missing.length) {
        return res.status(400).json({ error: { message: 'One or more additional attendees do not belong to this agency', userIds: missing } });
      }
    }

    const supervisor = await User.findById(supervisorUserId);
    const supervisee = await User.findById(superviseeUserId);
    if (!supervisor || !supervisee) return res.status(404).json({ error: { message: 'User not found' } });

    const created = await SupervisionSession.create({
      agencyId,
      supervisorUserId,
      superviseeUserId,
      sessionType,
      startAt,
      endAt,
      modality: modality ? String(modality) : null,
      locationText: locationText ? String(locationText) : null,
      notes: notes ? String(notes) : null,
      createdByUserId: req.user.id
    });

    const requiredSet = new Set([superviseeUserId, ...additionalAttendeeUserIds, ...requiredAttendeeUserIds]);
    const optionalSet = new Set(optionalAttendeeUserIds.filter((uid) => !requiredSet.has(uid)));
    const superviseeIds = Array.from(new Set([...requiredSet, ...optionalSet]));
    const compensableMap = await User.getAgencySupervisionCompensableMap(agencyId, superviseeIds);
    await SupervisionSession.upsertAttendees(created.id, [
      {
        userId: supervisorUserId,
        participantRole: 'supervisor',
        isRequired: true,
        isCompensableSnapshot: false,
        status: 'INVITED'
      },
      ...superviseeIds.map((uid) => ({
        userId: uid,
        participantRole: 'supervisee',
        isRequired: !optionalSet.has(uid),
        isCompensableSnapshot: !!compensableMap[uid],
        status: 'INVITED'
      }))
    ]);
    const validPresenterIds = presenterUserIds.filter((uid) => superviseeIds.includes(uid) || uid === superviseeUserId);
    await SupervisionSession.setPresenters({
      sessionId: created.id,
      presenterUserIds: validPresenterIds,
      assignedByUserId: req.user.id
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
    const sessionType = req.body?.sessionType !== undefined ? String(req.body?.sessionType || '').trim().toLowerCase() : undefined;
    const notes = req.body?.notes !== undefined ? (req.body?.notes ? String(req.body.notes) : '') : undefined;
    const modality = req.body?.modality !== undefined ? (req.body?.modality ? String(req.body.modality) : null) : undefined;
    const locationText = req.body?.locationText !== undefined ? (req.body?.locationText ? String(req.body.locationText) : null) : undefined;
    const createMeetLink = req.body?.createMeetLink === true;
    const presenterUserIds = req.body?.presenterUserIds !== undefined
      ? Array.from(
        new Set(
          (Array.isArray(req.body?.presenterUserIds) ? req.body.presenterUserIds : [])
            .map((n) => parseInt(n, 10))
            .filter((n) => Number.isFinite(n) && n > 0 && n !== Number(row.supervisor_user_id))
        )
      ).slice(0, 2)
      : undefined;

    const nextStart = startAt !== undefined ? startAt : row.start_at;
    const nextEnd = endAt !== undefined ? endAt : row.end_at;
    if (!nextStart || !nextEnd) return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    if (String(nextEnd) <= String(nextStart)) return res.status(400).json({ error: { message: 'endAt must be after startAt' } });

    const updated = await SupervisionSession.updateById(id, {
      startAt: startAt !== undefined ? startAt : undefined,
      endAt: endAt !== undefined ? endAt : undefined,
      sessionType,
      notes,
      modality,
      locationText
    });
    if (presenterUserIds !== undefined) {
      const attendees = await SupervisionSession.listAttendees(id);
      const allowed = new Set((attendees || []).filter((a) => String(a?.participant_role || '') === 'supervisee').map((a) => Number(a.user_id)));
      if (Number(row.supervisee_user_id || 0)) allowed.add(Number(row.supervisee_user_id));
      const validPresenterIds = presenterUserIds.filter((uid) => allowed.has(uid));
      await SupervisionSession.setPresenters({
        sessionId: id,
        presenterUserIds: validPresenterIds,
        assignedByUserId: req.user.id
      });
    }

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

/**
 * Get supervision hours summary for a supervisee. Supervisor or admin/support only.
 * GET /supervision/supervisee/:superviseeId/hours-summary?agencyId=...
 */
export const getSuperviseeHoursSummary = async (req, res, next) => {
  try {
    const requesterId = Number(req.user?.id || 0);
    const superviseeId = req.params.superviseeId ? parseInt(req.params.superviseeId, 10) : null;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!requesterId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!superviseeId) return res.status(400).json({ error: { message: 'superviseeId is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    if (requesterId !== superviseeId) {
      const role = String(req.user?.role || '').toLowerCase();
      const isAdminOrSupport = role === 'admin' || role === 'super_admin' || role === 'support';
      if (!isAdminOrSupport) {
        const hasAccess = await User.supervisorHasAccess(requesterId, superviseeId, agencyId);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied. You can only view hours for your assigned supervisees.' } });
        }
      }
    }

    const summary = await SupervisionSession.getHoursSummaryForSupervisee(agencyId, superviseeId);
    res.json({
      ok: true,
      agencyId,
      superviseeId,
      totalHours: summary.totalHours,
      totalSeconds: summary.totalSeconds,
      sessionCount: summary.sessionCount
    });
  } catch (e) {
    next(e);
  }
};

export const getMySupervisionPrompts = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const agencyId = req.query?.agencyId ? Number(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const now = new Date();
    const rows = await SupervisionSession.listPromptSessionsForUser({
      userId,
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
      now
    });

    const prompts = (rows || []).map((row) => {
      const start = new Date(row.startAt || 0);
      const end = new Date(row.endAt || 0);
      const startsInMinutes = Number.isFinite(start.getTime())
        ? Math.round((start.getTime() - now.getTime()) / 60000)
        : null;
      const inPromptWindow = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
        ? now >= new Date(start.getTime() - 5 * 60 * 1000) && now <= end
        : false;
      return {
        ...row,
        startsInMinutes,
        isLive: Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? now >= start && now <= end : false,
        inPromptWindow,
        promptStyle: row.isRequired ? 'required_splash' : 'optional_card'
      };
    }).filter((row) => row.inPromptWindow);

    res.json({ ok: true, prompts, now: now.toISOString() });
  } catch (e) {
    next(e);
  }
};

export const getMyPresenterAssignments = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const agencyId = req.query?.agencyId ? Number(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const now = new Date();
    const rows = await SupervisionSession.listPresenterAssignmentsForUser({
      userId,
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
      now
    });

    const out = [];
    for (const row of rows || []) {
      await SupervisionSession.ensurePresenterReminders({
        presenterAssignmentId: row.presenter_assignment_id,
        userId,
        agencyId: row.agency_id,
        sessionId: row.session_id,
        sessionType: row.session_type,
        supervisorName: row.supervisor_name,
        startAt: row.start_at,
        now
      });
      const start = new Date(row.start_at || 0);
      const startsInMinutes = Number.isFinite(start.getTime())
        ? Math.round((start.getTime() - now.getTime()) / 60000)
        : null;
      out.push({
        presenterAssignmentId: Number(row.presenter_assignment_id),
        sessionId: Number(row.session_id),
        agencyId: Number(row.agency_id),
        sessionType: String(row.session_type || 'group'),
        presenterRole: String(row.presenter_role || 'primary'),
        presenterStatus: String(row.presenter_status || 'assigned'),
        topicSummary: row.topic_summary || null,
        startAt: row.start_at,
        endAt: row.end_at,
        sessionStatus: row.session_status,
        googleMeetLink: row.google_meet_link || null,
        supervisorName: String(row.supervisor_name || '').trim() || null,
        startsInMinutes,
        reminderStage: startsInMinutes !== null
          ? (startsInMinutes <= 60 ? 'h1' : (startsInMinutes <= (24 * 60) ? 'h24' : (startsInMinutes <= (7 * 24 * 60) ? 'd7' : null)))
          : null
      });
    }

    res.json({ ok: true, assignments: out, now: now.toISOString() });
  } catch (e) {
    next(e);
  }
};

export const getSessionPresenters = async (req, res, next) => {
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

    const presenters = await SupervisionSession.listPresentersForSession(id);
    res.json({ ok: true, presenters });
  } catch (e) {
    next(e);
  }
};

export const markSessionPresenterPresented = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const presenterUserId = parseInt(req.params.userId, 10);
    const presented = req.body?.presented !== false;
    if (!id || !presenterUserId) return res.status(400).json({ error: { message: 'Invalid session/presenter id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    const actorUserId = Number(req.user?.id || 0);
    const isSupervisorActor = actorUserId === Number(row.supervisor_user_id);
    const isPrivileged = ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(role);
    if (!isSupervisorActor && !isPrivileged) {
      return res.status(403).json({ error: { message: 'Only supervisors or authorized staff can mark presenters as presented.' } });
    }

    const okAccess = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!okAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const status = presented ? 'presented' : 'assigned';
    const ok = await SupervisionSession.setPresenterStatus({
      sessionId: id,
      userId: presenterUserId,
      status
    });
    if (!ok) return res.status(404).json({ error: { message: 'Presenter assignment not found for this session' } });

    const presenters = await SupervisionSession.listPresentersForSession(id);
    res.json({ ok: true, presenters, status });
  } catch (e) {
    next(e);
  }
};

