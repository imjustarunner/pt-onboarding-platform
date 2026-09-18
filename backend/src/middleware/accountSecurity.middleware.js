import { accountSecurityState } from '../services/accountSecurity.service.js';
import { enforceActivityProtection } from './activityProtection.middleware.js';
import { limitedRoster } from '../utils/accountSecurity.js';

export function accountSecurityRouteKind(req) {
  const path = String(req.originalUrl || req.path || '').split('?')[0].replace(/\/$/, '');
  const method = req.method;
  if (/^\/api\/account-security(?:\/|$)/.test(path)) return 'account';
  if (/^\/api\/auth\/(logout|session-lock-config|session-activity|verify-session-pin|platform-session\/heartbeat)$/.test(path)) return 'account';
  if (/^\/api\/presence\/(heartbeat|offline|me)$/.test(path)) return 'account';
  if (method === 'GET' && ['/api/users/me', '/api/users/me/agencies', '/api/agencies', '/api/platform-branding', '/api/app-version'].includes(path)) return 'account';
  if (method === 'POST' && path === '/api/users/change-password') return 'account';
  if (method === 'GET' && new RegExp(`^/api/users/${Number(req.user?.id)}/(preferences|agencies)$`).test(path)) return 'account';
  if (method === 'GET' && /^\/api\/school-portal\/\d+\/(clients|my-roster)$/.test(path)) return 'limited_roster';
  if (method === 'GET' && /^\/api\/school-portal\/\d+\/(affiliation|roster-school-years)$/.test(path)) return 'account';
  return 'protected';
}

export async function enforceAccountSecurity(req, res, next) {
  try {
    // Repeated authenticate middleware on mounted routers must not wrap twice.
    if (req.accountSecurityApplied) return next();
    const kind = accountSecurityRouteKind(req);
    if (kind === 'account') return next();
    const state = await accountSecurityState(req);
    if ((!state.required && !state.enabled) || state.verified) return enforceActivityProtection(req, res, next);
    if (kind === 'limited_roster') {
      const json = res.json;
      res.json = function(body) { return json.call(this, limitedRoster(body)); };
      req.accountSecurityApplied = true;
      res.setHeader('Cache-Control', 'no-store');
      return next();
    }
    return res.status(403).json({ error: { code: 'MFA_REQUIRED', message: state.enabled
      ? 'Verify your sign-in to view full client names and open protected information.'
      : 'To protect client privacy, set up two-step verification to view full names and open client documents. You can keep using client codes and initials.' }, security: { enabled: state.enabled, setupPath: '/account-security' } });
  } catch (error) { next(error); }
}
