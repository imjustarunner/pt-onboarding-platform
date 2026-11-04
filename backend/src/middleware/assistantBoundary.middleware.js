import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import { loadAssistantIdentity, assertAssistantMembership, assistantRecoveryTarget, hasAssistantTargets } from '../services/assistantIdentity.service.js';
import { assistantAgencyScopeMatches, assistantRouteKind, assistantTargetIds, minimalAssistantCapabilities } from '../utils/assistantBoundaryPolicy.js';

const denied = (res, code = 'ASSISTANT_SCOPE_REQUIRED', status = 403) => res.status(status).json({
  error: { code, message: code === 'ASSISTANT_UNAVAILABLE'
    ? 'Assistant access is unavailable. Contact the account owner.'
    : 'This action is not available in the assistant workspace.' }
});
const pathOf = req => String(req.originalUrl || req.path || '').split('?')[0].replace(/\/+$/, '') || '/';
const protectedPath = path => /^\/(?:api|uploads)(?:\/|$)/.test(path);
const writeMethod = method => !['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());

export function createAssistantBoundary({ lookup = loadAssistantIdentity, membership = assertAssistantMembership,
  recoveryTarget = assistantRecoveryTarget,
  targetLookup,
  // Expiry is ignored only to classify and restrict an old assistant cookie.
  // Normal authenticate() still checks expiry and revocation before any data.
  verify = token => jwt.verify(token, config.jwt.secret, { ignoreExpiration: true }) } = {}) {
  const find = async (req, id) => {
    if (req.assistantIdentityCheckedFor === Number(id)) return req.assistantIdentity || null;
    const identity = await lookup(id);
    req.assistantIdentityCheckedFor = Number(id);
    req.assistantIdentity = identity;
    return identity;
  };
  const bind = (req, identity) => {
    req.assistantIdentity = identity;
    req.assistantAccount = identity.account;
    if (req.user) {
      req.user.role = 'assistant'; req.user.effectiveRole = 'assistant'; req.user.isAssistant = true;
      req.user.agencyId = identity.account?.agencyId || null;
      req.user.agencyIds = identity.account ? [identity.account.agencyId] : [];
      req.user.assistantAccount = identity.account;
    }
  };
  const agencyProjection = identity => ({ id: identity.account.agencyId, name: identity.account.agencyName,
    slug: identity.account.agencySlug, organization_type: 'agency' });
  const identityProjection = identity => ({ id: identity.userId, role: 'assistant', email: identity.email,
    is_active: true, isAssistant: true, agencyId: identity.account.agencyId,
    assistant: { subrole: identity.account.subrole, status: identity.account.status },
    capabilities: minimalAssistantCapabilities(), agencies: [agencyProjection(identity)] });
  function projectLogin(req, res) {
    if (req.assistantLoginProjection || !/^\/api\/auth\/login$/.test(pathOf(req))) return;
    req.assistantLoginProjection = true;
    const original = res.json;
    res.json = function(body) {
      if (!body?.token || !body?.user?.id) return original.call(this, body);
      const response = this;
      Promise.resolve(find(req, body.user.id)).then(async identity => {
        if (!identity) return original.call(response, body);
        if (!identity.enabled || !identity.account || identity.account.status === 'disabled' || !await membership(identity)) {
          return denied(response, 'ASSISTANT_UNAVAILABLE');
        }
        response.set?.('Cache-Control', 'no-store');
        return original.call(response, { token: body.token, sessionId: body.sessionId,
          isFirstLogin: !!body.isFirstLogin, user: identityProjection(identity), agencies: [agencyProjection(identity)] });
      }).catch(() => denied(response, 'ASSISTANT_UNAVAILABLE', 503));
      return response;
    };
  }
  const enforce = async (req, res, next, identity, { interceptIdentity = true } = {}) => {
    bind(req, identity);
    res.set?.('Cache-Control', 'no-store');
    const kind = assistantRouteKind(req.method, pathOf(req));
    if (kind === 'denied') return denied(res);
    if (kind === 'login') {
      const login = String(req.body?.username || req.body?.email || '').trim().toLowerCase();
      // An expired assistant cookie still restricts public routes, while a
      // normal password challenge can renew that same assistant's session.
      return login && login === String(identity.email).toLowerCase() ? next() : denied(res);
    }
    // Logout always remains possible, including while an account is disabled.
    if (req.method === 'POST' && pathOf(req) === '/api/auth/logout') return next();
    if (!identity.enabled || !identity.account || identity.account.status === 'disabled') {
      return denied(res, 'ASSISTANT_UNAVAILABLE', 403);
    }
    if (!await membership(identity) || !assistantAgencyScopeMatches(req, identity.account.agencyId)) return denied(res);
    // Pending and paused accounts retain their empty shell but cannot execute
    // tasks. The workspace router independently authorizes every specific action.
    if (kind === 'workspace' && writeMethod(req.method) && identity.account.status !== 'active') {
      return denied(res, 'ASSISTANT_UNAVAILABLE');
    }
    if (interceptIdentity && kind === 'identity' && req.method === 'GET') {
      const agency = agencyProjection(identity);
      if (pathOf(req) === '/api/users/me/agencies') return res.json([agency]);
      return res.json(identityProjection(identity));
    }
    return next();
  };

  async function protectTargets(req, res, next) {
    if (/^\/api\/assistant-accounts(?:\/|$)/.test(pathOf(req))) return next();
    const assistantRole = value => typeof value === 'string' && value.trim().toLowerCase() === 'assistant';
    if (writeMethod(req.method) && (assistantRole(req.body?.role) || assistantRole(req.body?.work_role))) return denied(res, 'ASSISTANT_MANAGEMENT_REQUIRED');
    const accountRead = /^\/api\/users\/\d+(?:\/|$)/.test(pathOf(req));
    if (!writeMethod(req.method) && !accountRead) return next();
    const ids = assistantTargetIds(req);
    const protectedTarget = ids.length && (targetLookup ? await targetLookup(ids)
      : lookup === loadAssistantIdentity ? await hasAssistantTargets(ids)
        : (await Promise.all(ids.map(id => lookup(id)))).some(Boolean));
    if (protectedTarget) return denied(res, 'ASSISTANT_MANAGEMENT_REQUIRED');
    return next();
  }

  async function authenticated(req, res, next) {
    try {
      if (!req.user?.id) return next();
      const identity = await find(req, req.user.id);
      if (identity) return await enforce(req, res, next, identity);
      return await protectTargets(req, res, next);
    } catch { return denied(res, 'ASSISTANT_UNAVAILABLE', 503); }
  }

  async function global(req, res, next) {
    if (!protectedPath(pathOf(req))) return next();
    try {
      projectLogin(req, res);
      if (await recoveryTarget(req)) return denied(res, 'ASSISTANT_MANAGEMENT_REQUIRED');
      const raw = [req.headers?.authorization, req.headers?.['x-user-authorization'], req.cookies?.authToken].filter(Boolean);
      const claims = [];
      for (const item of raw) {
        try {
          const decoded = verify(String(item).replace(/^Bearer\s+/i, ''));
          if (decoded?.id) claims.push(decoded);
        } catch { /* Normal authentication handles expired or invalid tokens. */ }
      }
      // An assistant cookie cannot be bypassed by supplying another credential
      // channel. The browser must sign out before changing identity.
      for (const claim of claims) {
        const identity = await find(req, claim.id);
        if (identity) return await enforce(req, res, next, identity, { interceptIdentity: false });
      }
      return claims.length ? await protectTargets(req, res, next) : next();
    } catch { return denied(res, 'ASSISTANT_UNAVAILABLE', 503); }
  }
  return { authenticated, global, protectTargets };
}

const boundary = createAssistantBoundary();
export const assistantBoundary = boundary.authenticated;
export const assistantGlobalBoundary = boundary.global;
export const protectAssistantAccountTargets = boundary.protectTargets;
