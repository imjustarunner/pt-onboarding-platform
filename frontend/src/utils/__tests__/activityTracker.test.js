import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), logout: vi.fn(), auth: { user: { id: 7, role: 'super_admin' }, isAuthenticated: true }, close: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: mocks.get, post: mocks.post }, isApiRateLimited: () => false }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ ...mocks.auth, logout: mocks.logout }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 } }) }));
vi.mock('../../store/presenceSession', () => ({ usePresenceSessionStore: () => ({ closePrompt: mocks.close }) }));
vi.mock('../statusPromptBridge', () => ({ closeStatusPrompt: mocks.close }));
vi.mock('../loginRedirect', () => ({ getLoginUrlForRedirect: () => '/login', getCurrentPortalSlugFromHostCache: () => '', getCurrentPortalSlugFromPath: () => '' }));
vi.mock('../sessionTimeoutBranding', () => ({ resolveSessionTimeoutTenantKey: () => 'test', rememberSessionEndedContext: vi.fn(), markSessionEndedRedirecting: vi.fn() }));
import { startActivityTracking, stopActivityTracking, resumeSession, pauseIdleForSessionExtend, applyClockedInTimeoutOverride } from '../activityTracker';
import { sessionStorageKey } from '../sessionDeadline';
import { useSessionLockStore } from '../../store/sessionLock';

let serverSession;
let policy;
const serverData = () => ({ policy, session: { ...serverSession, serverNow: Date.now() } });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  vi.clearAllMocks(); setActivePinia(createPinia()); localStorage.clear();
  localStorage.setItem('sessionId', 'login-one'); localStorage.setItem('user', '{"id":7}');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  policy = { idleBeforeTimedownSeconds: 30, timedownSeconds: 90, useLockScreen: false };
  serverSession = { phase: 'active', lastActivityAt: Date.now(), lockAt: Date.now() + 30000, expiresAt: Date.now() + 120000, serverNow: Date.now() };
  mocks.get.mockImplementation(async () => ({ data: { ...policy, session: serverData().session } }));
  mocks.post.mockImplementation(async (url, body) => {
    if (url === '/auth/session-activity') {
      serverSession = { phase: 'active', lastActivityAt: Date.now(), lockAt: Date.now() + 30000, expiresAt: Date.now() + 120000, serverNow: Date.now() };
      return { data: serverData() };
    }
    return { data: {} };
  });
});
afterEach(() => { stopActivityTracking(); vi.useRealTimers(); });
describe('shared activity tracking', () => {
  it('moves admin and superadmin ledger/presence to timedown as soon as the warning opens', async () => {
    await startActivityTracking(); mocks.post.mockClear();
    await vi.advanceTimersByTimeAsync(30000);
    expect(useSessionLockStore().warningActive).toBe(true);
    expect(mocks.post.mock.calls.some(([url, body]) => url === '/presence/heartbeat' && body.sessionPhase === 'timedown')).toBe(true);
    expect(mocks.post.mock.calls.some(([url, body]) => url === '/auth/platform-session/heartbeat' && body.phase === 'timedown')).toBe(true);
  });
  it('resolves an open warning when another tab successfully resumes', async () => {
    await startActivityTracking(); await vi.advanceTimersByTimeAsync(30000);
    expect(useSessionLockStore().warningActive).toBe(true);
    serverSession = { phase: 'active', lastActivityAt: Date.now(), lockAt: Date.now() + 30000, expiresAt: Date.now() + 120000, serverNow: Date.now() };
    const key = sessionStorageKey(7, 'login-one');
    localStorage.setItem(key, JSON.stringify(serverSession));
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(serverSession) }));
    expect(useSessionLockStore().warningActive).toBe(false);
    expect(useSessionLockStore().isLocked).toBe(false);
  });
  it('synchronizes a PIN unlock without sharing the code', async () => {
    policy = { ...policy, useLockScreen: true, pinRequired: true, pinLength: 6 };
    await startActivityTracking(); await vi.advanceTimersByTimeAsync(30000);
    expect(useSessionLockStore().isLocked).toBe(true);
    expect(await resumeSession('012345')).toBe(true);
    expect(useSessionLockStore().isLocked).toBe(false);
    expect(localStorage.getItem(sessionStorageKey(7, 'login-one'))).not.toContain('012345');
  });
  it('ignores a delayed expiry response after another tab has renewed the session', async () => {
    const oldActivity = serverSession.lastActivityAt;
    await startActivityTracking(); await vi.advanceTimersByTimeAsync(30000);
    await resumeSession();
    window.dispatchEvent(new CustomEvent('pt:session-security', { detail: {
      error: { code: 'SESSION_EXPIRED' },
      session: { phase: 'expired', lastActivityAt: oldActivity, activityVersion: oldActivity, lockAt: oldActivity + 30000, expiresAt: Date.now() - 1, serverNow: Date.now() + 1000 }
    } }));
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(useSessionLockStore().warningActive).toBe(false);
  });
  it('verifies a fresh login before acting on a stale cached expiry', async () => {
    localStorage.setItem(sessionStorageKey(7, 'login-one'), JSON.stringify({ ...serverSession, phase: 'expired', expiresAt: Date.now() - 1 }));
    await startActivityTracking();
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(useSessionLockStore().isLocked).toBe(false);
  });
  it('does not start a fresh idle period when reloading an existing locked session', async () => {
    serverSession.lockAt = Date.now() - 10000; serverSession.expiresAt = Date.now() + 20000; serverSession.phase = 'timedown';
    await startActivityTracking();
    expect(useSessionLockStore().warningSecondsLeft).toBe(20);
    expect(mocks.post.mock.calls.some(([url]) => url === '/auth/session-activity')).toBe(false);
  });
  it('refuses the first still-here click after a day of sleeping', async () => {
    await startActivityTracking();
    vi.setSystemTime(Date.now() + 86400000);
    expect(await resumeSession()).toBe(false);
    expect(mocks.post.mock.calls.some(([url, body]) => url === '/auth/session-activity' && body.action === 'resume')).toBe(false);
    expect(useSessionLockStore().isLocked).toBe(true);
    await vi.waitFor(() => expect(mocks.logout).toHaveBeenCalled());
  });
  it('does not accept incidental movement or hidden-tab activity', async () => {
    await startActivityTracking(); mocks.post.mockClear();
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.post.mock.calls.some(([url]) => url === '/auth/session-activity')).toBe(false);
  });
  it('Away and clocked-in overrides cannot bypass security expiry', async () => {
    await startActivityTracking();
    pauseIdleForSessionExtend(new Date(Date.now() + 7200000).toISOString());
    applyClockedInTimeoutOverride();
    await vi.advanceTimersByTimeAsync(120000);
    expect(mocks.logout).toHaveBeenCalled();
  });
});
