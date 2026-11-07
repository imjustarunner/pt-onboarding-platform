import { isTokenAuthenticationRoute } from './loginHandoff.js';

// Cached identity is a display hint. Verify it before Vue Router can redirect
// a returning visitor past sign-in and import the private workspace. The
// workspace's activity tracker may never mount if one of its files fails.
export async function verifyStartupSession({ api, authStore, route, demo = false, storage = localStorage } = {}) {
  if (!authStore.isAuthenticated || demo || isTokenAuthenticationRoute(route) ||
      String(route?.query?.sso || '') === '1' || route?.query?.bs ||
      route?.meta?.publicQuickView || route?.meta?.familyCommandCenter ||
      ['OfficeKiosk', 'KioskWelcome'].includes(route?.name)) return 'skipped';

  const read = key => { try { return storage.getItem(key); } catch { return null; } };
  const user = authStore.user;
  const sessionId = read('sessionId');
  const bearer = read('authToken');
  const stillCurrent = () => authStore.user === user &&
    read('sessionId') === sessionId && read('authToken') === bearer;
  try {
    await api.get('/users/me', {
      skipAuthRedirect: true, skipGlobalLoading: true, timeout: 10000
    });
    return stillCurrent() ? 'verified' : 'superseded';
  } catch (error) {
    if (!stillCurrent()) return 'superseded';
    const code = error.response?.data?.error?.code;
    const rejected = error.response?.status === 401 ||
      ['ACCOUNT_DISABLED', 'ACCOUNT_UNAVAILABLE'].includes(code);
    if (!rejected) {
      // A real lock, MFA requirement, network outage, or server error is not a
      // revoked login. Keep the existing tracker/security recovery behavior.
      return 'unverified';
    }
    // Clear only this expired authentication context. Drafts, remembered login
    // preferences and other saved work are retained by clearAuth(). No logout
    // request is needed to invalidate an already rejected credential.
    try { authStore.clearAuth(); } catch { /* In-memory auth clears even if storage is denied. */ }
    return 'expired';
  }
}
