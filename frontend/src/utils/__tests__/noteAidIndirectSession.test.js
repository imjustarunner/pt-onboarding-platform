import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ auth: null, get: vi.fn() }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 7 } }) }));
vi.mock('../../services/api', () => ({ default: { get: mocks.get } }));
vi.mock('../activityTracker', () => ({ applyClockedInTimeoutOverride: vi.fn(), clearClockedInTimeoutOverride: vi.fn() }));
import { useIndirectTimeSessionStore } from '../../store/indirectTimeSession';
import { ensureHourlySessionForNoteAid, getNoteAidClockInPromptState, resolveNoteAidClockInPrompt } from '../noteAidIndirectSession';

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.auth = reactive({ isAuthenticated: true, user: { role: 'provider' } });
  mocks.get.mockReset().mockResolvedValue({ data: { session: null } });
  sessionStorage.clear();
});
afterEach(() => resolveNoteAidClockInPrompt({ clockIn: false }));

it.each([false, 0, '0', 'false', undefined])('does not prompt a non-hourly user with flag %s', async (flag) => {
  mocks.auth.user.is_hourly_worker = flag;
  const store = useIndirectTimeSessionStore();
  expect(store.canUseLogTime).toBe(true);
  expect(store.isHourlyWorker).toBe(false);
  expect(await ensureHourlySessionForNoteAid()).toEqual({ fromIndirectSession: false, started: false });
  expect(getNoteAidClockInPromptState().open).toBe(false);
  expect(mocks.get).not.toHaveBeenCalled();
});

it.each(['is_hourly_worker', 'isHourlyWorker'])('prompts workers explicitly marked hourly through %s', async (key) => {
  for (const flag of [true, 1, '1']) {
    mocks.auth.user[key] = flag;
    sessionStorage.clear();
    const result = ensureHourlySessionForNoteAid();
    await flushPromises();
    expect(getNoteAidClockInPromptState().open).toBe(true);
    resolveNoteAidClockInPrompt({ clockIn: false });
    expect(await result).toEqual({ fromIndirectSession: false, started: false });
  }
});

it('keeps manual Log Time access separate and reacts to the hourly worker setting', async () => {
  const store = useIndirectTimeSessionStore();
  await store.refresh({ force: true });
  expect(mocks.get).toHaveBeenCalledWith('/payroll/me/indirect-time-session', expect.any(Object));
  mocks.auth.user.isHourlyWorker = true;
  expect(store.isHourlyWorker).toBe(true);
  mocks.auth.user.isHourlyWorker = false;
  mocks.auth.user.is_hourly_worker = true;
  expect(store.isHourlyWorker).toBe(false);
  expect(store.canUseLogTime).toBe(true);
});

it('links an already-clocked-in hourly session without prompting again', async () => {
  mocks.auth.user.isHourlyWorker = true;
  const store = useIndirectTimeSessionStore();
  store.session = { status: 'open' };
  expect(await ensureHourlySessionForNoteAid()).toEqual({ fromIndirectSession: true, started: false });
  expect(getNoteAidClockInPromptState().open).toBe(false);
  expect(store.noteAidUsedDuringSession).toBe(true);
});

it('does not prompt unauthenticated users or roles without Log Time access', async () => {
  mocks.auth.user.isHourlyWorker = true;
  mocks.auth.user.role = 'client_guardian';
  expect(await ensureHourlySessionForNoteAid()).toEqual({ fromIndirectSession: false, started: false });
  mocks.auth.user.role = 'provider';
  mocks.auth.isAuthenticated = false;
  expect(await ensureHourlySessionForNoteAid()).toEqual({ fromIndirectSession: false, started: false });
  expect(getNoteAidClockInPromptState().open).toBe(false);
});
