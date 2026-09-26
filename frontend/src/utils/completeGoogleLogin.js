import { shouldRememberSso, clearRememberedGoogleLogin, clearRememberedLogin } from './loginRemember';
import { rememberVerifiedGoogleAccount } from './googleAccountMemory';

/** Fetch identity from the new HttpOnly cookie, never the previous user's bearer token. */
export async function completeGoogleLogin({ api, authStore, agencyStore, orgSlug, startActivityTracking }) {
  const { data } = await api.get('/users/me', {
    params: { loginBootstrap: '1' }, cookieAuthOnly: true,
    skipGlobalLoading: true, skipAuthRedirect: true, timeout: 20000
  });
  const { loginBootstrap, ...user } = data || {};
  if (!user.id || loginBootstrap?.authMethod !== 'google' || !loginBootstrap?.sessionId) {
    throw new Error('Please sign in with Google again.');
  }
  const agencies = Array.isArray(loginBootstrap.agencies) ? loginBootstrap.agencies : [];
  // Clear context only after the new cookie has been verified successfully.
  authStore.clearAuth();
  authStore.setAuth(null, user, loginBootstrap.sessionId);
  agencyStore.setCurrentAgency(null);
  agencyStore.applyLoginAgencies(agencies);
  for (const key of ['username', 'verify', 'remember']) {
    try { sessionStorage.removeItem(`__pt_login_pending_${key}__`); } catch { /* optional */ }
  }
  if (shouldRememberSso(orgSlug)) {
    rememberVerifiedGoogleAccount({ user, authMethod: loginBootstrap.authMethod, orgSlug, agencies });
  } else {
    clearRememberedGoogleLogin(orgSlug);
    clearRememberedLogin(orgSlug);
  }
  await startActivityTracking({
    bootstrap: { ...loginBootstrap.security, userId: user.id, sessionId: loginBootstrap.sessionId }
  });
  return user;
}
