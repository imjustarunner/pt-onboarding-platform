import { createHash, createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import pool from '../config/database.js';
import { invitationEvents } from './meetingInvitations.service.js';
import { canJoinSupervision, roomUnavailable } from './meetingJoinPolicy.service.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { joinUrlForSupervision } from '../utils/joinToken.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

const audience = 'supervision-session';
const issuer = 'personal-supervision-invitation';
// Domain-separated signing key: these grants can never be used as app login JWTs.
const signingKey = () => createHmac('sha256', config.jwt.secret).update(issuer).digest();
const tokenHash = token => createHash('sha256').update(String(token)).digest('hex');
const unavailable = () => Object.assign(new Error('This supervision invitation is no longer available.'), { status: 410 });

export async function resolveSupervisionInvitationAccess(token, now = new Date()) {
  if (!/^[\w-]{32}$/.test(String(token || ''))) throw Object.assign(new Error('Invitation not found.'), { status: 404 });
  const [rows] = await pool.execute('SELECT * FROM meeting_email_invitations WHERE join_token=?', [token]);
  const invitation = rows[0];
  if (!invitation || invitation.meeting_type !== 'supervision') return null;
  const events = await invitationEvents(invitation);
  const session = events.find(e => !e.live_ended_at && (parseUtcDate(e.end_at) > now || e.status === 'IN_PROGRESS' || Number(e.has_live_presence) === 1));
  if (!session || !await canJoinSupervision(session, invitation.user_id)) throw unavailable();
  if (['IN_PERSON','IN-PERSON'].includes(String(session.modality || '').toUpperCase())) {
    return { joinUrl: null, meeting: { title: session.title || 'Supervision', location: session.location_text || '', when: String(session.start_at || '') } };
  }
  const blocked = roomUnavailable(session, 'supervision');
  if (blocked) throw Object.assign(new Error(blocked.error.message), { status: blocked.status });
  const expiresIn = 12 * 60 * 60;
  const accessToken = jwt.sign({
    invitationId: Number(invitation.id), invitationHash: tokenHash(token),
    sessionId: Number(session.id), agencyId: Number(session.agency_id)
  }, signingKey(), { algorithm: 'HS256', audience, issuer, subject: String(invitation.user_id), expiresIn });
  return {
    joinUrl: joinUrlForSupervision(await tenantMeetingBase(session.agency_id), session.id),
    supervisionAccess: { token: accessToken, sessionId: Number(session.id), expiresAt: now.getTime() + expiresIn * 1000 }
  };
}

export function supervisionSessionRequest(method, path) {
  const match = /^\/sessions\/(\d+)\/(.+?)\/?$/.exec(String(path || '').split('?')[0]);
  if (!match) return null;
  const action = match[2];
  const allowed = {
    GET: /^(video-token|admission-status|lobby-participants|live-attendance|attendees|presenters|presentations|presentations\/mine|presentation-state|artifacts|personal-note|activity|transcription)$/,
    POST: /^(join-presence|end-live|admit\/\d+|waiting-room|client-transcript|transcript-control|activity|artifacts|transcription\/(control|audio))$/,
    PUT: /^(presentation-state|personal-note)$/
  };
  return allowed[String(method).toUpperCase()]?.test(action) ? { sessionId: Number(match[1]), action } : null;
}

export async function validateSupervisionAccess(token, request, body = {}, now = new Date()) {
  let grant;
  try { grant = jwt.verify(token, signingKey(), { algorithms: ['HS256'], audience, issuer }); }
  catch { throw Object.assign(new Error('Your session link has expired. Open your personal invitation again.'), { status: 401 }); }
  if (!request || Number(grant.sessionId) !== request.sessionId) throw Object.assign(new Error('This link only grants access to its supervision session.'), { status: 403 });
  const [invitations] = await pool.execute('SELECT * FROM meeting_email_invitations WHERE id=? AND user_id=?', [grant.invitationId, Number(grant.sub)]);
  const invitation = invitations[0];
  if (!invitation || invitation.meeting_type !== 'supervision' || tokenHash(invitation.join_token) !== grant.invitationHash) throw unavailable();
  const [sessions] = await pool.execute(`SELECT s.* FROM supervision_sessions s
    JOIN supervision_sessions anchor ON anchor.id=?
    WHERE s.id=? AND s.agency_id=? AND s.supervisor_user_id=?
      AND (s.id=anchor.id OR (anchor.recurrence_series_id IS NOT NULL AND s.recurrence_series_id=anchor.recurrence_series_id))`,
  [invitation.event_id, request.sessionId, invitation.agency_id, invitation.provider_id]);
  const session = sessions[0];
  if (!session || Number(session.agency_id) !== Number(grant.agencyId) || !await canJoinSupervision(session, Number(grant.sub))) throw unavailable();
  const blocked = roomUnavailable(session, 'supervision');
  // Let an already-issued grant close its attendance ledger after the host ends.
  const endedAt = parseUtcDate(session.live_ended_at);
  const closing = endedAt && now - endedAt >= 0 && now - endedAt < 5 * 60 * 1000
    && !['CANCELLED','RESCHEDULED','MISSED'].includes(String(session.status).toUpperCase())
    && request.action === 'join-presence' && body.action === 'leave';
  if (blocked && !closing) throw Object.assign(new Error(blocked.error.message), { status: blocked.status });
  const [users] = await pool.execute('SELECT id,first_name,last_name,email FROM users WHERE id=?', [Number(grant.sub)]);
  if (!users[0]) throw unavailable();
  return { user: { ...users[0], role: 'provider' }, sessionId: request.sessionId, invitationId: invitation.id };
}
