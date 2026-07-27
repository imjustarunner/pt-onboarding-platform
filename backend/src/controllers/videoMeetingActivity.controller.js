/**
 * Video meeting activity: chat, polls, Q&A.
 * Persists messages for meeting owners to access later.
 */

import pool from '../config/database.js';
import User from '../models/User.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import VideoMeetingActivity from '../models/VideoMeetingActivity.model.js';

async function canAccessSupervisionActivity(req, session) {
  const actorId = Number(req.user?.id || 0);
  if (!actorId) return false;
  const sid = Number(session?.id || 0);
  const supervisorId = Number(session?.supervisor_user_id || 0);
  const superviseeId = Number(session?.supervisee_user_id || 0);
  const coFacilitatorId = Number(session?.co_facilitator_user_id || 0);
  if (actorId === supervisorId || actorId === superviseeId || actorId === coFacilitatorId) return true;
  const [attendee] = await pool.execute(
    `SELECT 1 FROM supervision_session_attendees WHERE session_id = ? AND user_id = ? LIMIT 1`,
    [sid, actorId]
  );
  if (attendee?.length) return true;
  try {
    const [presenter] = await pool.execute(
      `SELECT 1 FROM supervision_session_presenters WHERE session_id = ? AND user_id = ? LIMIT 1`,
      [sid, actorId]
    );
    if (presenter?.length) return true;
  } catch {
    /* optional table */
  }
  const actorAgencies = await User.getAgencies(actorId);
  const inAgency = (actorAgencies || []).some((a) => Number(a?.id) === Number(session?.agency_id || 0));
  if (!inAgency) return false;
  const role = String(req.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role);
}

async function canAccessTeamMeetingActivity(req, event) {
  const actorId = Number(req.user?.id || 0);
  if (!actorId) return false;
  const providerId = Number(event?.provider_id || 0);
  if (actorId === providerId) return true;
  const [attendee] = await pool.execute(
    `SELECT 1 FROM provider_schedule_event_attendees WHERE event_id = ? AND user_id = ? LIMIT 1`,
    [event.id, actorId]
  );
  if (attendee?.length) return true;
  const actorAgencies = await User.getAgencies(actorId);
  const inAgency = (actorAgencies || []).some((a) => Number(a?.id) === Number(event?.agency_id || 0));
  if (!inAgency) return false;
  const role = String(req.user?.role || '').toLowerCase();
  return [
    'super_admin',
    'admin',
    'support',
    'staff',
    'clinical_practice_assistant',
    'provider_plus',
    'schedule_manager',
    'assistant_admin'
  ].includes(role);
}

/** Host or non-provider staff can create polls / answer Q&A. Providers vote/chat/ask only. */
const TEAM_MEETING_POLL_CREATE_ROLES = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'support',
  'staff',
  'clinical_practice_assistant',
  'schedule_manager',
  'assistant_admin'
]);

function canCreateTeamMeetingPoll(req, event) {
  const actorId = Number(req.user?.id || 0);
  if (!actorId) return false;
  if (actorId === Number(event?.provider_id || 0)) return true;
  const role = String(req.user?.role || '').toLowerCase().trim();
  if (role === 'provider' || role === 'provider_plus') return false;
  return TEAM_MEETING_POLL_CREATE_ROLES.has(role);
}

async function parseUserIdFromIdentity(identity) {
  const m = String(identity || '').match(/^user-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function displayNameFromUser(user) {
  if (!user) return '';
  const name = `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim();
  return name || user.email || '';
}

/** Enrich activity payloads with authorName when missing (for live chat UI). */
async function withAuthorNames(activityList) {
  const list = Array.isArray(activityList) ? activityList : [];
  const needIds = new Set();
  for (const a of list) {
    if (a?.payload?.authorName) continue;
    const uid = Number(a?.userId || 0) || (await parseUserIdFromIdentity(a?.participantIdentity));
    if (uid) needIds.add(uid);
  }
  const nameById = new Map();
  for (const uid of needIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const u = await User.findById(uid);
      const n = displayNameFromUser(u);
      if (n) nameById.set(uid, n);
    } catch { /* ignore */ }
  }
  return list.map((a) => {
    if (a?.payload?.authorName) return a;
    const uid = Number(a?.userId || 0) || Number(String(a?.participantIdentity || '').match(/^user-(\d+)$/)?.[1] || 0);
    const authorName = uid ? nameById.get(uid) : '';
    if (!authorName) return a;
    return {
      ...a,
      payload: { ...(a.payload || {}), authorName }
    };
  });
}

/**
 * POST /api/supervision/sessions/:id/activity - add chat/poll/Q&A
 */
export const postSupervisionActivity = async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (!sessionId) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const session = await SupervisionSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canAccessSupervisionActivity(req, session);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const { activityType, payload } = req.body || {};
    const identity = String(req.user?.id ? `user-${req.user.id}` : req.body?.participantIdentity || '').trim();
    if (!identity) return res.status(400).json({ error: { message: 'Invalid participant identity' } });

    const id = await VideoMeetingActivity.create({
      sessionId,
      eventId: null,
      userId: await parseUserIdFromIdentity(identity) || req.user?.id,
      participantIdentity: identity,
      activityType: activityType || 'chat',
      payload: payload || {}
    });

    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
};

/**
 * Public guest activity list via opaque join token.
 * GET /api/supervision/guest-activity/:joinToken
 */
export const getSupervisionGuestActivity = async (req, res, next) => {
  try {
    const ref = String(req.params.joinToken || '').trim();
    if (!ref || /^\d+$/.test(ref)) {
      return res.status(400).json({ error: { message: 'A secure join link is required' } });
    }
    const session = await SupervisionSession.resolveByJoinRef(ref);
    if (!session?.id) return res.status(404).json({ error: { message: 'Session not found' } });
    const limit = parseInt(req.query?.limit, 10) || 500;
    let activity = [];
    try {
      activity = await VideoMeetingActivity.list({ sessionId: session.id, limit: Math.min(limit, 1000) });
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, activity: [] });
      throw e;
    }
    res.json({ ok: true, activity });
  } catch (e) {
    next(e);
  }
};

/**
 * Public guest Q&A / activity post via opaque join token.
 * POST /api/supervision/guest-activity/:joinToken
 */
export const postSupervisionGuestActivity = async (req, res, next) => {
  try {
    const ref = String(req.params.joinToken || '').trim();
    if (!ref || /^\d+$/.test(ref)) {
      return res.status(400).json({ error: { message: 'A secure join link is required' } });
    }
    const session = await SupervisionSession.resolveByJoinRef(ref);
    if (!session?.id) return res.status(404).json({ error: { message: 'Session not found' } });

    const { activityType, payload, joinIdentity, displayName } = req.body || {};
    const identity = String(joinIdentity || '').trim();
    if (!identity.startsWith('guest-')) {
      return res.status(400).json({ error: { message: 'guest joinIdentity required' } });
    }
    const type = String(activityType || 'question').toLowerCase();
    if (!['chat', 'question'].includes(type)) {
      return res.status(400).json({ error: { message: 'Guests may only post chat or questions' } });
    }
    const authorName = String(displayName || payload?.authorName || 'Guest').trim().slice(0, 80) || 'Guest';
    const id = await VideoMeetingActivity.create({
      sessionId: session.id,
      eventId: null,
      userId: null,
      participantIdentity: identity,
      activityType: type,
      payload: { ...(payload || {}), authorName, text: payload?.text || payload?.question || '' }
    });
    if (!id) return res.status(400).json({ error: { message: 'Failed to save activity' } });
    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/supervision/sessions/:id/activity - list activity (for owner)
 */
export const getSupervisionActivity = async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (!sessionId) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const session = await SupervisionSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canAccessSupervisionActivity(req, session);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const limit = parseInt(req.query?.limit, 10) || 500;
    let activity = [];
    try {
      activity = await VideoMeetingActivity.list({ sessionId, limit: Math.min(limit, 1000) });
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, activity: [] });
      console.warn('[getSupervisionActivity] Failed to list activity:', e?.message);
      return res.json({ ok: true, activity: [] });
    }

    res.json({ ok: true, activity: await withAuthorNames(activity) });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/team-meetings/:eventId/activity - add chat/poll/Q&A
 */
export const postTeamMeetingActivity = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    const ok = await canAccessTeamMeetingActivity(req, event);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const { activityType, payload } = req.body || {};
    const type = String(activityType || 'chat').toLowerCase();
    const identity = String(req.user?.id ? `user-${req.user.id}` : req.body?.participantIdentity || '').trim();
    if (!identity) return res.status(400).json({ error: { message: 'Invalid participant identity' } });

    if (type === 'poll' && !canCreateTeamMeetingPoll(req, event)) {
      return res.status(403).json({
        error: { message: 'Only the host or non-provider staff can create polls.' }
      });
    }

    const id = await VideoMeetingActivity.create({
      sessionId: null,
      eventId,
      userId: await parseUserIdFromIdentity(identity) || req.user?.id,
      participantIdentity: identity,
      activityType: type,
      payload: payload || {}
    });

    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/team-meetings/:eventId/activity - list activity (for owner)
 */
export const getTeamMeetingActivity = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    const ok = await canAccessTeamMeetingActivity(req, event);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const limit = parseInt(req.query?.limit, 10) || 500;
    let activity = [];
    try {
      activity = await VideoMeetingActivity.list({ eventId, limit: Math.min(limit, 1000) });
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, activity: [] });
      console.warn('[getTeamMeetingActivity] Failed to list activity:', e?.message);
      return res.json({ ok: true, activity: [] });
    }

    res.json({ ok: true, activity: await withAuthorNames(activity) });
  } catch (e) {
    next(e);
  }
};
