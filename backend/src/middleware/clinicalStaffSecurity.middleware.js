import { accountSecurityState } from '../services/accountSecurity.service.js';
import { MFA_STAFF_ROLES } from '../utils/accountSecurity.js';

async function checkClinicalStaffSecurity(req, res, next, requireVerified) {
  try {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    // A scoped client invitation never grants staff permissions.
    if (req.counselingInvitationAccess) return next();
    if (!MFA_STAFF_ROLES.has(String(req.user?.role || '').toLowerCase())) return next();
    if (req.user?.demoMode || req.user?.switchedFromUserId) {
      return res.status(403).json({ error: { message: 'Sign in to your own account to access clinical sessions.' } });
    }
    const state = await accountSecurityState(req);
    // Session access follows the platform's server-owned MFA rollout policy.
    // Retention administration still requires a verified second factor.
    if ((requireVerified || state.required) && !state.verified) return res.status(403).json({ error: { code: 'MFA_REQUIRED',
      message: requireVerified
        ? 'Verify your sign-in in Account security before managing clinical retention.'
        : 'Verify your sign-in in Account security before opening clinical sessions.' },
      security: { enabled: state.enabled, setupPath: '/account-security' } });
    next();
  } catch (error) { next(error); }
}

export function requireClinicalStaffSecurity(req, res, next) {
  return checkClinicalStaffSecurity(req, res, next, false);
}

export function requireClinicalRetentionSecurity(req, res, next) {
  return checkClinicalStaffSecurity(req, res, next, true);
}
