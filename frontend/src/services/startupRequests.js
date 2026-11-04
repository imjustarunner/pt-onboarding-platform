import api from './api';

// These reads appear in several parts of the same dashboard. Share only requests
// that are still running; subsequent visits/mutations always get a fresh response.
const sharedPaths = new Set([
  '/communications/center-summary',
  '/availability/admin/skill-builders/options'
]);
const pending = new Map();
const supportedOptions = new Set(['params', 'timeout', 'skipGlobalLoading', 'skipAuthRedirect']);

export function startupRequestScope() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return JSON.stringify([
      localStorage.getItem('sessionId'), localStorage.getItem('authToken'), user?.id, user?.role,
      JSON.parse(localStorage.getItem('currentAgency') || 'null')?.id,
      sessionStorage.getItem('__pt_demo_window_token__'), sessionStorage.getItem('__pt_demo_window_agency__')
    ]);
  } catch { return null; }
}

export function getStartupData(url, config = {}) {
  if (!sharedPaths.has(url) || Object.keys(config).some(key => !supportedOptions.has(key))) {
    return api.get(url, config);
  }
  const options = { timeout: 30000, skipGlobalLoading: true, skipAuthRedirect: true, ...config };
  const scope = startupRequestScope();
  if (scope === null) return api.get(url, options);
  const params = Object.entries(options.params || {}).sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([scope, url, params, options.timeout, options.skipGlobalLoading, options.skipAuthRedirect]);
  let request = pending.get(key);
  if (!request) {
    request = api.get(url, options).finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
    pending.set(key, request);
  }
  // Keep each component's mutable JSON separate even when it shares the network read.
  return request.then(response => ({ ...response, data: response.data == null
    ? response.data : JSON.parse(JSON.stringify(response.data)) }));
}
