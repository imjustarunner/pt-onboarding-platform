import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserPresenceStatus from '../models/UserPresenceStatus.model.js';
import { listAgencyPresence, setAwayStatus, clearMyPresenceStatus } from './presence.controller.js';

// Only an authenticated Quick View user's existing presence permissions apply.
// The tenant always comes from the scoped session, never caller input.
async function attachPresenceUser(req) {
  const user = await User.findById(req.quickView.userId);
  if (!user || !UserPresenceStatus.isPrivilegedRole(user.role) || !req.quickView.agencyId) return false;
  req.user = { id: req.quickView.userId, role: user.role, agencyId: req.quickView.agencyId };
  req.headers['x-agency-id'] = String(req.quickView.agencyId);
  return true;
}
export async function getQuickPresence(req, res, next) {
  try {
    if (!(await attachPresenceUser(req))) return res.json({ enabled: false, people: [] });
    req.params = { agencyId: String(req.quickView.agencyId) };
    req.query = {};
    const json = res.json.bind(res);
    res.json = body => {
      if (!Array.isArray(body)) return json(body);
      const people = body.filter(p => UserPresenceStatus.isPrivilegedRole(p.role)).map(p => ({
        id: p.id, first_name: p.first_name, last_name: p.last_name, role: p.role,
        status: p.status, status_label: p.status_label, availability_band: p.availability_band,
        session_phase: p.session_phase, presence_display_label: p.presence_display_label,
        presence_expected_return_at: p.presence_expected_return_at, presence_note: p.presence_note,
        calendar_busy: p.calendar_busy
      }));
      return json({ enabled: true, people });
    };
    return await listAgencyPresence(req, res, next);
  } catch (error) { next(error); }
}
export function quickPresenceAction(handler) {
  return async (req, res, next) => {
    try {
      if (!(await attachPresenceUser(req))) return res.status(403).json({ error: { message: 'Admin presence access required' } });
      // A status change must never extend the full portal's security deadline.
      req.body = { ...req.body, agencyId: req.quickView.agencyId, extendSession: false };
      return await handler(req, res, next);
    } catch (error) { next(error); }
  };
}
export const postQuickAway = quickPresenceAction(setAwayStatus);
export const postQuickPresenceClear = quickPresenceAction(clearMyPresenceStatus);

// Deliberate Quick View interaction counts as live presence, independently of
// the full portal's authentication deadline. Passive polling never calls this.
export async function recordQuickPresenceActivity(session) {
  const user = await User.findById(session.userId);
  if (!user || !UserPresenceStatus.isPrivilegedRole(user.role) || !session.agencyId) return;
  await pool.execute(`INSERT INTO user_presence (user_id,agency_id,last_heartbeat_at,last_activity_at,session_phase)
    VALUES (?,?,NOW(),NOW(),'active') ON DUPLICATE KEY UPDATE agency_id=VALUES(agency_id),
    last_heartbeat_at=NOW(),last_activity_at=NOW(),session_phase='active'`,[session.userId,session.agencyId]);
}
