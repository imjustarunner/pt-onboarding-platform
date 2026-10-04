import { accountSecurityState } from '../services/accountSecurity.service.js';
import { MFA_STAFF_ROLES } from '../utils/accountSecurity.js';

export async function requireClinicalStaffSecurity(req, res, next) {
  try {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    // A scoped client invitation never grants staff permissions.
    if (req.counselingInvitationAccess) return next();
    if (!MFA_STAFF_ROLES.has(String(req.user?.role || '').toLowerCase())) return next();
    if (req.user?.demoMode || req.user?.switchedFromUserId) {
      return res.status(403).json({ error: { message: 'Sign in to your own account to access clinical sessions.' } });
    }
    const state = await accountSecurityState(req);
    // Google authentication alone supplies no evidence that a second factor was used.
    if (!state.verified) return res.status(403).json({ error: { code: 'MFA_REQUIRED',
      message: 'Verify your sign-in in Account security before opening clinical sessions.' },
      security: { enabled: state.enabled, setupPath: '/account-security' } });
    next();
  } catch (error) { next(error); }
}
