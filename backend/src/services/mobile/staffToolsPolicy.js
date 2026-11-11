// Live Chat uses public websites and rejects demo identities in its canonical
// actor policy. It stays closed to QA until a dedicated synthetic website exists.
export function qaStaffToolsRouteAllowed(method, path) {
  if (method === 'GET' && path === '/staff-tools/support/feed') return true;
  if (method === 'GET' && /^\/staff-tools\/support\/(ticket|sms|communication)\/[1-9]\d*$/.test(path)) return true;
  return method === 'POST' && /^\/staff-tools\/support\/(ticket|sms)\/[1-9]\d*\/(reply|claim|unclaim|close)$/.test(path);
}
