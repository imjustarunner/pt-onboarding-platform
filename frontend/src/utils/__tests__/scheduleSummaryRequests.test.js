import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/api', () => ({ default: m }));
import { getScheduleSummaryResponse, invalidateScheduleSummaryRequests } from '../scheduleSummaryRequests';
const url = '/users/7/schedule-summary';
const config = { params: { weekStart: '2026-10-12', includeAllAgencies: true, skipOfficeMaterialize: true } };
beforeEach(() => {
  invalidateScheduleSummaryRequests(7);
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
});
it('shares equivalent calendar reads across widgets and refreshes after they finish', async () => {
  let resolve;
  m.get.mockImplementation(() => new Promise(r => { resolve = r; }));
  const a = getScheduleSummaryResponse(url, config);
  const b = getScheduleSummaryResponse(url, { params: { ...config.params, agencyId: 2, includeAllAgencies: '1', skipOfficeMaterialize: 'true', includeGoogleBusy: false, weekStartsOn: 'monday' } });
  expect(a).toBe(b); expect(m.get).toHaveBeenCalledTimes(1);
  resolve({ data: { providerId: 7 } }); await a;
  const next = getScheduleSummaryResponse(url, config);
  expect(m.get).toHaveBeenCalledTimes(2); resolve({ data: {} }); await next;
});
it('keeps scoped agencies, weeks, overlays, and logins separate', async () => {
  m.get.mockImplementation(() => new Promise(() => {}));
  getScheduleSummaryResponse(url, config);
  for (const changes of [{ agencyId: 2, includeAllAgencies: false }, { weekStart: '2026-10-19' }, { includeGoogleEvents: true }]) {
    getScheduleSummaryResponse(url, { params: { ...config.params, ...changes } });
  }
  localStorage.setItem('sessionId', 'another-login');
  getScheduleSummaryResponse(url, config);
  expect(m.get).toHaveBeenCalledTimes(5);
});
it('does not reuse an in-flight response after a booking mutation or explicit refresh', () => {
  m.get.mockImplementation(() => new Promise(() => {}));
  const first = getScheduleSummaryResponse(url, config);
  invalidateScheduleSummaryRequests(7);
  expect(getScheduleSummaryResponse(url, config)).not.toBe(first);
  getScheduleSummaryResponse(url, config, { fresh: true });
  expect(m.get).toHaveBeenCalledTimes(3);
});
it('releases failed requests so retry can recover', async () => {
  m.get.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ data: {} });
  await expect(getScheduleSummaryResponse(url, config)).rejects.toThrow('Offline');
  await expect(getScheduleSummaryResponse(url, config)).resolves.toEqual({ data: {} });
});
