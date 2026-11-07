import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../../store/auth.js';
import { verifyStartupSession } from '../startupSession.js';

vi.mock('../biometricAuth', () => ({ saveBiometricToken: vi.fn(), clearBiometricToken: vi.fn() }));
let authStore, api;
const route = { name: 'OrganizationDashboard', query: {}, meta: { requiresAuth: true } };
const failure = (status, code) => ({ response: { status, data: { error: { code } } } });
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); setActivePinia(createPinia());
  authStore = useAuthStore();
  authStore.setAuth('old-token', { id: 7, role: 'admin' }, 'old-session');
  localStorage.setItem('clinical-note-draft', 'Synthetic unsaved note');
  api = { get: vi.fn() };
});
const check = options => verifyStartupSession({ api, authStore, route, ...options });

it.each([failure(401, 'SESSION_EXPIRED'), failure(401, undefined), failure(403, 'ACCOUNT_DISABLED')])('removes rejected saved authentication before workspace navigation', async error => {
  api.get.mockRejectedValue(error);
  expect(await check()).toBe('expired');
  expect(authStore.isAuthenticated).toBe(false);
  expect(localStorage.getItem('user')).toBeNull();
  expect(localStorage.getItem('authToken')).toBeNull();
  expect(localStorage.getItem('clinical-note-draft')).toBe('Synthetic unsaved note');
  expect(localStorage.getItem('sessionId')).toBe('old-session');
  expect(api.get).toHaveBeenCalledOnce();
});
it('keeps a verified active session and its bearer intact', async () => {
  api.get.mockResolvedValue({ data: { id: 7, role: 'admin' } });
  expect(await check()).toBe('verified');
  expect(authStore.isAuthenticated).toBe(true);
  expect(localStorage.getItem('authToken')).toBe('old-token');
  expect(api.get).toHaveBeenCalledWith('/users/me', { skipAuthRedirect: true, skipGlobalLoading: true, timeout: 10000 });
});
it.each([failure(423, 'SESSION_LOCKED'), failure(403, 'MFA_REQUIRED'), failure(403, 'FORBIDDEN'), failure(503), new Error('offline')])('does not discard a valid session for locks or transient verification failures', async error => {
  api.get.mockRejectedValue(error);
  expect(await check()).toBe('unverified');
  expect(authStore.isAuthenticated).toBe(true);
  expect(localStorage.getItem('authToken')).toBe('old-token');
});
it.each([
  { demo: true },
  { route: { query: { sso: '1' } } },
  { route: { query: { bs: 'fresh-handoff' } } },
  { route: { name: 'PasswordlessTokenLogin' } },
  { route: { name: 'OrganizationResetPassword' } },
  { route: { name: 'OfficeKiosk' } },
  { route: { meta: { publicQuickView: true } } },
  { route: { meta: { familyCommandCenter: true } } }
])('leaves independent credentials and fresh login handoffs to their own validation', async options => {
  expect(await check(options)).toBe('skipped');
  expect(api.get).not.toHaveBeenCalled();
  expect(authStore.isAuthenticated).toBe(true);
});
it('does not add a session request for an anonymous sign-in', async () => {
  authStore.clearAuth();
  expect(await check({ route: { name: 'Login' } })).toBe('skipped');
  expect(api.get).not.toHaveBeenCalled();
});
it('does not let a delayed old rejection clear a newly established login', async () => {
  let reject;
  api.get.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const pending = check();
  authStore.setAuth('new-token', { id: 8, role: 'provider' }, 'new-session');
  reject(failure(401, 'SESSION_EXPIRED'));
  expect(await pending).toBe('superseded');
  expect(authStore.user.id).toBe(8);
  expect(localStorage.getItem('authToken')).toBe('new-token');
});
it('does not erase credentials replaced by a login in another tab', async () => {
  let reject;
  api.get.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const pending = check();
  localStorage.setItem('sessionId', 'other-tab-session');
  localStorage.setItem('authToken', 'other-tab-token');
  reject(failure(401, 'SESSION_EXPIRED'));
  expect(await pending).toBe('superseded');
  expect(localStorage.getItem('authToken')).toBe('other-tab-token');
});
