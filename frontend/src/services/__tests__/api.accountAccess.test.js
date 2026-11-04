import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ errorHandler: null, request: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => ({
  request: m.request,
  interceptors: { request: { use: vi.fn() }, response: { use: (_ok, error) => { m.errorHandler = error; } } }
}) } }));
vi.mock('../../utils/sessionTimeoutBranding', () => ({ isSessionEndedRedirecting: () => false, isSessionEndedPath: () => false }));
vi.mock('../../utils/loginRedirect', () => ({ getLoginUrlForRedirect: () => '/school/login' }));
import '../api.js';
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal('window', { location: { hostname: 'portal.example.test', pathname: '/school/dashboard', href: '/school/dashboard' }, dispatchEvent: vi.fn() });
  localStorage.setItem('user', JSON.stringify({ id: 42, role: 'school_staff' }));
  localStorage.setItem('authToken', 'old-token');
  sessionStorage.setItem('justLoggedIn', 'true');
  sessionStorage.setItem('justLoggedInAt', String(Date.now()));
});
afterEach(() => vi.unstubAllGlobals());
it('clears a disabled session and redirects immediately without retrying a fresh login', async () => {
  const error = { config: { url: '/school-portal/20/clients' }, response: { status: 403, data: { error: { code: 'ACCOUNT_DISABLED' } } } };
  await expect(m.errorHandler(error)).rejects.toBe(error);
  expect(localStorage.getItem('user')).toBeNull();
  expect(localStorage.getItem('authToken')).toBeNull();
  expect(window.location.href).toBe('/school/login');
  expect(m.request).not.toHaveBeenCalled();
});
it('does not log out an enabled user for an ordinary permission denial', async () => {
  const error = { config: { url: '/school-portal/20/clients' }, response: { status: 403, data: { error: { message: 'Permission denied' } } } };
  await expect(m.errorHandler(error)).rejects.toBe(error);
  expect(localStorage.getItem('authToken')).toBe('old-token');
  expect(window.location.href).toBe('/school/dashboard');
});
