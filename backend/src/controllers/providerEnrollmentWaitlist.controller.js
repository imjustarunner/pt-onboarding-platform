import pool from '../config/database.js';
import User from '../models/User.model.js';
import { loadEnrollmentWaitlist } from '../services/providerEnrollmentWaitlist.service.js';

export async function getEnrollmentWaitlist(req, res, next) {
  try {
    const agencyId = Number(req.query.agencyId), providerId = req.params.providerId == null ? null : Number(req.params.providerId);
    if (!Number.isSafeInteger(agencyId) || agencyId < 1 || (providerId != null && (!Number.isSafeInteger(providerId) || providerId < 1))) {
      return res.status(400).json({ error: { message: 'Choose a valid agency and provider.' } });
    }
    let canManage = ['super_admin', 'admin', 'support', 'staff'].includes(req.user.role);
    if (!canManage && (providerId !== Number(req.user.id) || req.user.role === 'supervisor' || req.user.has_supervisor_privileges)) {
      canManage = User.isSupervisor(await User.findById(req.user.id));
    }
    if (!canManage && providerId !== Number(req.user.id)) return res.status(403).json({ error: { message: 'You can view only your own provider waitlist.' } });
    if (req.user.role !== 'super_admin') {
      const [memberships] = await pool.execute('SELECT user_id FROM user_agencies WHERE user_id = ? AND agency_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1', [req.user.id, agencyId]);
      if (!memberships.length) return res.status(403).json({ error: { message: 'Access denied for this agency.' } });
    }
    if (providerId != null) {
      const [memberships] = await pool.execute('SELECT user_id FROM user_agencies WHERE user_id = ? AND agency_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1', [providerId, agencyId]);
      if (!memberships.length) return res.status(404).json({ error: { message: 'Provider not found in this agency.' } });
    }
    const rows = await loadEnrollmentWaitlist({ agencyId, providerId });
    // Internal email routing fields stay off this scheduling-only response.
    const requests = rows.map(({ providerEmail, contactEmail, submissionId, ...row }) => row);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ count: requests.length, requests, canManage });
  } catch (error) { next(error); }
}
