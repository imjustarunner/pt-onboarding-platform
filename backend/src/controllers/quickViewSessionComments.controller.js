import pool from '../config/database.js';
import User from '../models/User.model.js';

const unavailable = (status, message) => Object.assign(new Error(message), { status });

// A reusable Quick View PIN cannot open clinical comments. The parent router
// verifies the primary mobile device session and account-security proof first.
export function createQuickSessionCommentPrincipal({ loadUser = id => User.findById(id, { raw: true }), db = pool } = {}) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const session = req.quickView;
      const userId = Number(session?.userId), agencyId = Number(session?.agencyId);
      if (!session?.mobileDeviceSessionId || session.mobileSurface === 'family' || !Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(agencyId) || agencyId < 1) {
        throw unavailable(403, 'Sign into AuricWell mobile with your account to open secure session comments.');
      }
      for (const value of [req.query?.agencyId, req.body?.agencyId, req.params?.agencyId]) {
        if (value != null && value !== '' && Number(value) !== agencyId) throw unavailable(403, 'Open comments in their own workspace.');
      }
      const user = await loadUser(userId);
      if (!user || Number(user.id) !== userId || [false, 0, '0'].includes(user.is_active) || [true, 1, '1'].includes(user.is_archived) || user.terminated_at
          || !['ACTIVE', 'ACTIVE_EMPLOYEE', 'EHR_ONLY'].includes(String(user.status || '').toUpperCase())) {
        throw unavailable(403, 'Your account is not active.');
      }
      const [[membership]] = await db.execute('SELECT 1 AS allowed FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1 LIMIT 1', [userId, agencyId]);
      if (!membership) throw unavailable(403, 'Your workspace access has changed.');
      // No caller-supplied actor, role or client list is trusted. The canonical
      // service still verifies the appointment, selected client and audience.
      req.user = { ...user, id: userId, sessionCommentAgencyId: agencyId };
      next();
    } catch (error) { next(error); }
  };
}

export const requireQuickSessionCommentPrincipal = createQuickSessionCommentPrincipal();
