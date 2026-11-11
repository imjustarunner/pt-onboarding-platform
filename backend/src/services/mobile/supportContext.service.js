import { mobileSessions } from './session.service.js';
import { listMobileAgencies } from './agencyScope.service.js';
import { readAgencyAccess } from '../agencyAccessProfiles.service.js';
import { applyAgencyAccess } from '../../utils/agencyAccessPolicy.js';
import { runWithAgencyAccess } from '../../utils/agencyAccessContext.js';

export const supportFailure = (status, message) => Object.assign(new Error(message), { status });
export const supportId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const roles = new Set(['admin', 'support', 'super_admin']);

/** An explicit device grant and fresh agency role are required even for direct IDs. */
export function createMobileSupportContext({ access = (...args) => mobileSessions.access(...args),
  agencies = listMobileAgencies, agencyAccess = readAgencyAccess, applyAccess = applyAgencyAccess,
  scope = runWithAgencyAccess } = {}) {
  return async function context(req) {
    const grant = req.quickView;
    if (!grant?.mobileDeviceSessionId) throw supportFailure(403, 'Sign in with your account to open support tools.');
    const session = await access(grant.mobileDeviceSessionId, grant.userId, grant.agencyId, grant.credentialVersion ?? null);
    if (session.surface !== 'staff') throw supportFailure(403, 'Support tools require a staff account.');
    const available = await agencies(session.user);
    const allowed = [];
    for (const agency of available.agencies) {
      if (grant.qaAgencyIds && !grant.qaAgencyIds.map(Number).includes(Number(agency.id))) continue;
      const profile = await agencyAccess(session.user.id, Number(agency.id));
      if (!profile) continue;
      const user = { ...applyAccess(session.user, profile), mobileDevice: true };
      if (roles.has(String(user.role).toLowerCase())) allowed.push({ agency, profile, user });
    }
    if (!allowed.length) throw supportFailure(403, 'Your account does not have support access in an active agency.');
    return {
      user: session.user, allowed, qaAgencyIds: grant.qaAgencyIds || available.qaAgencyIds || null,
      require(agencyId) {
        const entry = allowed.find(a => Number(a.agency.id) === Number(agencyId));
        if (!entry) throw supportFailure(403, 'This agency is outside your support access.');
        return entry;
      },
      async run(agencyId, fn) {
        const entry = this.require(agencyId);
        return scope(Number(agencyId), () => fn(entry), { userId: session.user.id, access: entry.profile });
      }
    };
  };
}

export const mobileSupportContext = createMobileSupportContext();
export {qaStaffToolsRouteAllowed} from './staffToolsPolicy.js';
export const supportAgencies = context => context.allowed.map(({ agency }) => ({
  id: Number(agency.id), name: agency.name, logoUrl: agency.logo_url || agency.logoUrl || null
}));

/** A fixed handler is selected by our adapter, never by the caller. */
export function invokeSupportHandler(handler, request, overrides = {}) {
  const req = Object.assign(Object.create(request), overrides);
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = { locals: {}, set() { return this; }, header() { return this; },
      status(value) { status = value; return this; },
      json(body) { resolve({ status, body }); return this; },
      send(body) { resolve({ status, body }); return this; },
      end() { resolve({ status, body: null }); return this; } };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

export function requireSupportResult(result) {
  if (result.status >= 400) {
    const error = supportFailure(result.status, result.body?.error?.message || 'This support action could not be completed.');
    error.details = result.body?.error;
    throw error;
  }
  return result.body;
}
