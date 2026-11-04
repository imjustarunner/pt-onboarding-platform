// Assistant identities never inherit employee or administrator capabilities.
export function isAssistantIdentity(user) {
  return String(user?.role || '').toLowerCase() === 'assistant'
    || [true, 1, '1'].includes(user?.is_assistant_account)
    || user?.isAssistant === true || !!user?.assistantAccount;
}

export function minimalAssistantCapabilities() {
  return {
    canAccessPlatform: true,
    canUseAssistantWorkspace: true,
    canViewTraining: false,
    canSignDocuments: false,
    canJoinProgramEvents: false,
    canUseChat: false,
    canManageHiring: false,
    canAccessOutreach: false,
    canManagePlatformGear: false,
    canManageChallenges: false,
    canViewLibrary: false,
    canManageLibrary: false,
    canAccessRecordsManager: false,
    hasClinicalSupervision: false,
    canManagePayroll: false,
    canViewMyPayroll: false,
    canAccessBudgetManagement: false,
    canManageCredentialing: false,
    canManageMedicalBilling: false,
    canAccessFinanceOperations: false
  };
}

const SESSION_ROUTES = new Set([
  'GET /api/app-version',
  'GET /api/auth/session-lock-config',
  'POST /api/auth/session-activity',
  'POST /api/auth/verify-session-pin',
  'POST /api/auth/platform-session/heartbeat',
  'POST /api/auth/logout'
]);
const OWN_ROUTES = new Set(['GET /api/users/me', 'GET /api/users/me/agencies']);

export function assistantRouteKind(method, rawPath) {
  const path = String(rawPath || '').split('?')[0].replace(/\/+$/, '') || '/';
  // Express decodes path parameters later. Never let alternate encodings make
  // the global boundary and router disagree about a route's identity.
  if (/%|\\|\/\//.test(path)) return 'denied';
  const route = `${String(method).toUpperCase()} ${path}`;
  if (route === 'POST /api/auth/login' || route === 'POST /api/auth/identify') return 'login';
  if (SESSION_ROUTES.has(route)) return 'session';
  if (OWN_ROUTES.has(route)) return 'identity';
  if (/^\/api\/assistant-work(?:\/|$)/.test(path)) return 'workspace';
  return 'denied';
}

const SCOPE_KEYS = new Set(['agencyId', 'agency_id', 'agencyIds', 'agency_ids']);
export function assistantAgencyScopeMatches(req, expectedAgencyId) {
  const expected = Number(expectedAgencyId);
  if (!Number.isSafeInteger(expected) || expected < 1) return false;
  const matches = value => {
    if (Array.isArray(value)) return value.length > 0 && value.every(matches);
    return (typeof value === 'number' || typeof value === 'string')
      && /^\d+$/.test(String(value)) && Number(value) === expected;
  };
  const header = req.headers?.['x-agency-id'];
  if (header !== undefined && !matches(header)) return false;
  let visited = 0;
  const inspect = (value, depth = 0) => {
    if (++visited > 2000 || depth > 20) return false;
    if (!value || typeof value !== 'object') return true;
    return Object.entries(value).every(([key, child]) =>
      SCOPE_KEYS.has(key) ? matches(child) : inspect(child, depth + 1));
  };
  return [req.query, req.body, req.params].every(value => inspect(value));
}

export function assistantTargetIds(req) {
  const path = String(req.originalUrl || req.path || '').split('?')[0];
  const isUserRoute = /^\/api\/users(?:\/|$)/.test(path);
  const isAgencyStaffRoute = /^\/api\/agencies\/\d+\/school-staff(?:\/|$)/.test(path);
  const ids = new Set();
  const add = value => {
    if (Array.isArray(value)) return value.forEach(add);
    if (/^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0) {
      ids.add(Number(value));
      if (ids.size > 1000) throw new RangeError('Account mutation target limit exceeded');
    }
  };
  const match = path.match(/^\/api\/users\/(\d+)(?:\/|$)/)
    || path.match(/^\/api\/payroll\/users\/(\d+)(?:\/|$)/)
    || path.match(/^\/api\/agencies\/\d+\/school-staff\/users\/(\d+)(?:\/|$)/);
  if (match) add(match[1]);
  const keys = new Set(['userId', 'user_id', 'userIds', 'user_ids', 'targetUserId', 'target_user_id', 'primaryUserId', 'sourceUserId', 'staffUserId', 'providerUserId', 'provider_user_id', 'assignedToUserId', 'assigned_to_user_id']);
  let visited = 0;
  function inspect(value, depth = 0) {
    if (!value || typeof value !== 'object') return;
    if (++visited > 2000 || depth > 20) throw new RangeError('Account mutation target limit exceeded');
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key) || ((isUserRoute || isAgencyStaffRoute) && key === 'ids')) add(child);
      else inspect(child, depth + 1);
    }
  }
  inspect(req.body); inspect(req.query); inspect(req.params);
  return [...ids];
}
