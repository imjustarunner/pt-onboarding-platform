import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import { flushPromises } from '@vue/test-utils';
import api from '../../services/api';
import { useDashboardOverview } from '../useDashboardOverview';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let scope;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => scope?.stop());
const create = opts => {
  scope = effectScope();
  return scope.run(() => useDashboardOverview({ userId: 7, agencyId: 2, includeSubmissionUpdates: false, ...opts }));
};

it('shows the schedule while payroll and recent activity are still pending', async () => {
  const pay = deferred();
  const activity = deferred();
  api.get.mockImplementation(url => url.includes('/payroll/') ? pay.promise
    : url === '/notifications' ? activity.promise : Promise.resolve({ data: {} }));
  const state = create();
  expect(api.get.mock.calls[0][0]).toBe('/users/7/schedule-summary');
  await flushPromises();
  expect(state.sectionState.schedule).toEqual({ loading: false, error: '' });
  expect(state.sectionState.pay.loading).toBe(true);
  expect(state.sectionState.activity.loading).toBe(true);
  expect(state.sectionState.events.loading).toBe(false);
  pay.resolve({ data: {} }); activity.resolve({ data: [] }); await flushPromises();
  expect(state.loading.value).toBe(false);
});

it('reports a schedule failure and retries only the schedule', async () => {
  api.get.mockImplementation(url => url.endsWith('/schedule-summary') ? Promise.reject(new Error('offline')) : Promise.resolve({ data: [] }));
  const state = create(); await flushPromises();
  expect(state.sectionState.schedule.error).toContain('could not be loaded');
  expect(state.sectionState.pay.error).toBe('');
  api.get.mockClear().mockResolvedValue({ data: { scheduleEvents: [] } });
  await state.refresh('schedule');
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get.mock.calls[0][1]).toMatchObject({ timeout: 12000, skipGlobalLoading: true });
  expect(state.sectionState.schedule.error).toBe('');
});

it('discards replies from the previous agency and clears its visible information', async () => {
  const old = deferred();
  const agencyId = ref(2);
  api.get.mockImplementation((url, config) => config?.params?.agencyId === 2 ? old.promise : Promise.resolve({ data: { label: 'new agency' } }));
  const state = create({ agencyId });
  agencyId.value = 3; await nextTick(); await flushPromises();
  expect(state.summary.value).toEqual({ label: 'new agency' });
  old.resolve({ data: { label: 'old agency' } }); await flushPromises();
  expect(state.summary.value).toEqual({ label: 'new agency' });
  expect(state.sectionState.pay.loading).toBe(false);
});

it('does not invent a zero paycheck or comparison when no pay history exists', async () => {
  api.get.mockResolvedValue({ data: {} });
  const state = create(); await flushPromises();
  expect(state.paycheckCompare.value).toEqual({ ratio: null, average: null, sampleSize: 0, last: null });
});
