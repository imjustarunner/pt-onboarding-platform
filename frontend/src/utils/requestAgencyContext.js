// A clinical request can belong to a different tenant than the navigation shell.
// An explicit request context must never be overwritten by persisted shell state.
export function requestAgencyId(config, fallback) {
  const headers = config?.headers || {};
  const explicit = typeof headers.get === 'function' ? headers.get('X-Agency-Id') : headers['X-Agency-Id'] ?? headers['x-agency-id'];
  const body = config?.data;
  const bodyId = typeof body?.get === 'function' ? body.get('agencyId') || body.get('agency_id') : body?.agencyId ?? body?.agency_id;
  const queryId = config?.params?.agencyId ?? config?.params?.agency_id;
  const value = explicit ?? queryId ?? bodyId ?? fallback;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
