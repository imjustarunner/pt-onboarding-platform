import pool from '../config/database.js';
import { exchangeStaffRole } from '../../../frontend/src/navigation/clientExchangePolicy.js';

// Use current staff roles, not a role captured when the browser signed in.
// Explicit demo sessions must retain their restricted, simulated role.
export async function requireExchangeAccess(req, res, next) {
  try {
    if (!req.user?.demoMode) {
      const [[current]] = await pool.execute('SELECT id, role, is_active, is_archived, status FROM users WHERE id = ? LIMIT 1', [req.user?.id]);
      if (!current || [false, 0, '0'].includes(current.is_active) || Number(current.is_archived) === 1
        || ['INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'DELETED', 'PROSPECTIVE', 'TERMINATED_PENDING'].includes(String(current.status || '').toUpperCase())) {
        return res.status(403).json({ error: { message: 'Active agency access is required' } });
      }
      req.user.role = String(current.role || '').trim().toLowerCase();
    }
    if (!exchangeStaffRole(req.user?.role) && !['provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant'].includes(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Provider or agency staff access required' } });
    }
    next();
  } catch (error) { next(error); }
}
