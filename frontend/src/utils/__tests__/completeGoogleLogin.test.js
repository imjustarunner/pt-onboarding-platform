import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeGoogleLogin } from '../completeGoogleLogin';
import { getRememberedGoogleLogin, setSsoRememberChoice } from '../loginRemember';
let api, authStore, agencyStore, startActivityTracking, data;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('authToken', 'previous-user-token');
  localStorage.setItem('user', JSON.stringify({ id: 1 }));
  data = {
    id: 7, username: 'alias', email: 'work@example.test', firstName: 'Example', lastName: 'Member', title: 'Coordinator',
    loginBootstrap: {
      sessionId: 'new-session', authMethod: 'google', agencies: [{ id: 2, slug: 'itsco', name: 'ITSCO' }],
      security: { policy: { useLockScreen: true }, session: { phase: 'active' } }
    }
  };
  api = { get: vi.fn(async () => ({ data })) };
  authStore = { clearAuth: vi.fn(() => localStorage.removeItem('authToken')), setAuth: vi.fn() };
  agencyStore = { setCurrentAgency: vi.fn(), applyLoginAgencies: vi.fn() };
  startActivityTracking = vi.fn();
});
const complete = () => completeGoogleLogin({ api, authStore, agencyStore, startActivityTracking, orgSlug: 'itsco' });
describe('Google cookie handoff', () => {
  it('replaces a stale user using only the verified cookie and remembers the full account', async () => {
    sessionStorage.setItem('__pt_login_pending_username__', 'previous@example.test');
    await complete();
    expect(sessionStorage.getItem('__pt_login_pending_username__')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/users/me', expect.objectContaining({ cookieAuthOnly: true, params: { loginBootstrap: '1' } }));
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(authStore.setAuth).toHaveBeenCalledWith(null, expect.objectContaining({ id: 7 }), 'new-session');
    expect(authStore.setAuth.mock.calls[0][1]).not.toHaveProperty('loginBootstrap');
    expect(startActivityTracking).toHaveBeenCalledWith({ bootstrap: { ...data.loginBootstrap.security, userId: 7, sessionId: 'new-session' } });
    expect(getRememberedGoogleLogin()).toMatchObject({ username: 'alias', loginHint: 'work@example.test', displayName: 'Example Member', title: 'Coordinator', organizationName: 'ITSCO' });
  });
  it('honors unchecking remember me across the OAuth round trip', async () => {
    setSsoRememberChoice(false, 'itsco');
    await complete();
    expect(getRememberedGoogleLogin()).toBeNull();
    expect(authStore.setAuth).toHaveBeenCalledOnce();
  });
  it('does not let a choice on another portal suppress this saved account', async () => {
    setSsoRememberChoice(false, 'nlu');
    await complete();
    expect(getRememberedGoogleLogin()?.orgSlug).toBe('itsco');
  });
  it('does not trust an sso query parameter without a Google-authenticated session', async () => {
    data.loginBootstrap.authMethod = 'password';
    await expect(complete()).rejects.toThrow('sign in with Google');
    expect(authStore.setAuth).not.toHaveBeenCalled();
    expect(startActivityTracking).not.toHaveBeenCalled();
    expect(getRememberedGoogleLogin()).toBeNull();
  });
  it('retains the previous state on a failed request and permits a retry', async () => {
    api.get.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(complete()).rejects.toThrow('Connection lost');
    expect(authStore.clearAuth).not.toHaveBeenCalled();
    expect(getRememberedGoogleLogin()).toBeNull();
    await complete();
    expect(getRememberedGoogleLogin()?.username).toBe('alias');
  });
});
