import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ request: null }));
vi.mock('axios', () => ({ default: { create: () => ({
  interceptors: { request: { use: handler => { m.request = handler; } }, response: { use: vi.fn() } }
}) } }));
vi.mock('../../utils/sessionTimeoutBranding', () => ({ isSessionEndedRedirecting: () => false, isSessionEndedPath: () => false }));
vi.mock('../../utils/loginRedirect', () => ({ getLoginUrlForRedirect: () => '/login' }));
import '../api.js';
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal('window', { location: { hostname: 'app.example.test', pathname: '/partner/chart', href: '/partner/chart' }, dispatchEvent: vi.fn() });
  localStorage.setItem('currentAgency', JSON.stringify({ id: 99 }));
});
afterEach(() => vi.unstubAllGlobals());

it('sends chart-selected agency on plan parsing even when the shell still selects another agency', async () => {
  const result = await m.request({ url: '/medical-billing/treatment-plans/parse', method: 'post', headers: {}, data: { agencyId: 7, text: 'Synthetic plan' } });
  expect(result.headers['X-Agency-Id']).toBe('7');
});
it('keeps explicit clinical agency headers and FormData agency context during generation', async () => {
  const data = new FormData(); data.append('agencyId', '7');
  const generated = await m.request({ url: '/clinical-notes/generate', method: 'post', headers: {}, data });
  expect(generated.headers['X-Agency-Id']).toBe('7');
  const explicit = await m.request({ url: '/medical-billing/treatment-plans', method: 'post', headers: { 'X-Agency-Id': '7' }, data: { clientId: 12 } });
  expect(explicit.headers['X-Agency-Id']).toBe('7');
});
