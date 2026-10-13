import api from '../services/api';

// Share only concurrent reads, never a later refresh or a different login/scope.
const inFlight = new Map();
const flag = value => ['true', '1'].includes(String(value ?? '').trim().toLowerCase());

export function invalidateScheduleSummaryRequests(userId) {
  const prefix = `/users/${Number(userId)}/schedule-summary|`;
  for (const key of inFlight.keys()) if (key.startsWith(prefix)) inFlight.delete(key);
}

export function getScheduleSummaryResponse(url, config = {}, { fresh = false } = {}) {
  if (config.signal || config.cancelToken || config.headers) return api.get(url, config);
  const params = { ...(config.params || {}) };
  params.includeAllAgencies = flag(params.includeAllAgencies) || String(params.agencyId).trim().toLowerCase() === 'all';
  if (params.includeAllAgencies) delete params.agencyId;
  for (const key of ['includeGoogleEvents', 'includeGoogleBusy']) params[key] = String(params[key]).toLowerCase() === 'true';
  params.skipOfficeMaterialize = flag(params.skipOfficeMaterialize) || String(params.skipOfficeMaterialize).trim().toLowerCase() === 'yes';
  params.weekStartsOn = String(params.weekStartsOn || params.week_starts_on).trim().toLowerCase() === 'sunday' ? 'sunday' : 'monday';
  delete params.week_starts_on;
  let identity = '';
  try {
    identity = [localStorage.getItem('sessionId'), JSON.parse(localStorage.getItem('user') || 'null')?.id,
      JSON.parse(localStorage.getItem('currentAgency') || 'null')?.id, sessionStorage.getItem('__pt_demo_window_user__')].join('|');
  } catch { return api.get(url, config); }
  const key = `${url}|${identity}|${config.timeout ?? api.defaults?.timeout ?? 0}|${JSON.stringify(Object.keys(params).sort().map(name => [name, params[name]]))}`;
  if (fresh) inFlight.delete(key);
  if (inFlight.has(key)) return inFlight.get(key);
  const request = api.get(url, config).finally(() => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}
