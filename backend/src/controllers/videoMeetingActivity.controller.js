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
  if (actorId === supervisorId || actorId === superviseeId) return true;
  const [attendee] = await pool.execute(
    `SELECT 1 FROM supervision_session_attendees WHERE session_id = ? AND user_id = ? LIMIT 1`,
    [sid, actorId]
  );
  if (attendee?.length) return true;
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
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role);
}

async function parseUserIdFromIdentity(identity) {
  const m = String(identity || '').match(/^user-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
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

    res.json({ ok: true, activity });
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
    const identity = String(req.user?.id ? `user-${req.user.id}` : req.body?.participantIdentity || '').trim();
    if (!identity) return res.status(400).json({ error: { message: 'Invalid participant identity' } });

    const id = await VideoMeetingActivity.create({
      sessionId: null,
      eventId,
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
    const activity = await VideoMeetingActivity.list({ eventId, limit: Math.min(limit, 1000) });

    res.json({ ok: true, activity });
  } catch (e) {
    next(e);
  }
};
