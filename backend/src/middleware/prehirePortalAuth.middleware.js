/**
 * Pre-hire portal token authentication middleware.
 *
 * Validates the `token` route param (or `x-prehire-token` header) against
 * `users.passwordless_token`. Unlike the login flow this does NOT clear the
 * token on use — the candidate keeps the same token for the entire portal session
 * until they are promoted out of PENDING_SETUP / PREHIRE_OPEN.
 *
 * Attaches `req.portalUser` with the minimal user record needed for portal ops.
 * Attach point is separate from `req.user` to avoid interfering with any staff
 * session that might co-exist (e.g. admin testing a portal link while logged in).
 */
import User from '../models/User.model.js';

const VALID_STATUSES = new Set(['PENDING_SETUP', 'PREHIRE_OPEN']);

export async function authenticatePrehireToken(req, res, next) {
  const token = req.params.token || req.headers['x-prehire-token'] || req.query.prehireToken;

  if (!token) {
    return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'No pre-hire token provided.' } });
  }

  try {
    const user = await User.validatePasswordlessToken(token);

    if (!user) {
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' } });
    }

    if (!VALID_STATUSES.has(user.status)) {
      // Token still exists but the user has already advanced past pre-hire
      return res.status(403).json({
        error: {
          code: 'STATUS_ADVANCED',
          message: 'Your pre-hire process has already been completed. Please log in with your organisation credentials.',
          status: user.status
        }
      });
    }

    // Attach minimal portal user (never full staff session)
    req.portalUser = {
      id: user.id,
      email: user.email,
      personal_email: user.personal_email || null,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      status: user.status,
      role: user.role
    };

    next();
  } catch (err) {
    console.error('[prehirePortalAuth] Error validating token:', err);
    next(err);
  }
}
