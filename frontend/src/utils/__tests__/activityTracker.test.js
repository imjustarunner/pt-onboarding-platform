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
  it('reuses the authenticated login response without another policy request', async () => {
    await startActivityTracking({ bootstrap: { ...serverData(), userId: 7, sessionId: 'login-one' } });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(useSessionLockStore().isLocked).toBe(false);
    expect(useSessionLockStore().lockConfig).toEqual(policy);
  });
  it('does not accept bootstrap data belonging to another session', async () => {
    await startActivityTracking({ bootstrap: { ...serverData(), userId: 7, sessionId: 'old-login' } });
    expect(mocks.get).toHaveBeenCalledOnce();
  });
  it('keeps a real lock from the bootstrap response', async () => {
    policy.useLockScreen = true;
    serverSession.lockAt = Date.now() - 1000;
    serverSession.phase = 'timedown';
    await startActivityTracking({ bootstrap: { ...serverData(), userId: 7, sessionId: 'login-one' } });
    expect(useSessionLockStore().isLocked).toBe(true);
    expect(useSessionLockStore().warningActive).toBe(true);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('recovers from a failed initial session check without focus changes or renewing activity', async () => {
    localStorage.setItem(sessionStorageKey(7, 'login-one'), JSON.stringify(serverSession));
    mocks.get.mockRejectedValueOnce(new Error('Network error'));
    await startActivityTracking();
    expect(useSessionLockStore().isLocked).toBe(true);
    expect(useSessionLockStore().warningSecondsLeft).toBe(60);
    expect(useSessionLockStore().verificationFailed).toBe(true);
    expect(mocks.post).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(useSessionLockStore().isLocked).toBe(false);
    expect(useSessionLockStore().warningActive).toBe(false);
    expect(useSessionLockStore().verificationFailed).toBe(false);
    expect(mocks.post.mock.calls.some(([url]) => url === '/auth/session-activity')).toBe(false);
    expect(mocks.logout).not.toHaveBeenCalled();
  });
  it('keeps the original recovery deadline when repeated session checks fail', async () => {
    mocks.get.mockRejectedValue(new Error('Service unavailable'));
    await startActivityTracking();
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.get.mock.calls.length).toBeGreaterThan(1);
    expect(useSessionLockStore().isLocked).toBe(true);
    expect(useSessionLockStore().warningSecondsLeft).toBe(30);
    await vi.advanceTimersByTimeAsync(30000);
    await vi.waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
    const requestCount = mocks.get.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.get).toHaveBeenCalledTimes(requestCount);
  });
  it('retries a response missing session state without uncovering the app', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ...policy, session: null } });
    await startActivityTracking();
    expect(useSessionLockStore().isLocked).toBe(true);
    expect(useSessionLockStore().warningActive).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(useSessionLockStore().isLocked).toBe(false);
  });
  it('still requires the PIN when a retry confirms a locked session', async () => {
    policy = { ...policy, useLockScreen: true, pinRequired: true, pinLength: 6 };
    serverSession = { ...serverSession, phase: 'timedown', lockAt: Date.now() - 1000, expiresAt: Date.now() + 20000 };
    mocks.get.mockRejectedValueOnce(new Error('Network error'));
    await startActivityTracking();
    await vi.advanceTimersByTimeAsync(5000);
    expect(useSessionLockStore().isLocked).toBe(true);
    expect(useSessionLockStore().lockConfig.pinRequired).toBe(true);
    expect(useSessionLockStore().warningSecondsLeft).toBe(15);
    expect(mocks.post.mock.calls.some(([url]) => url === '/auth/session-activity')).toBe(false);
  });
  it('ignores a failed request from an earlier tracker start', async () => {
    let rejectOld;
    let resolveCurrent;
    mocks.get.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectOld = reject; }));
    const oldStart = startActivityTracking();
    localStorage.setItem('sessionId', 'new-login');
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { resolveCurrent = resolve; }));
    const currentStart = startActivityTracking({ force: true });
    rejectOld(new Error('Old request failed'));
    await oldStart;
    expect(useSessionLockStore().warningActive).toBe(false);
    resolveCurrent({ data: { ...policy, session: serverData().session } });
    await currentStart;
    expect(useSessionLockStore().isLocked).toBe(false);
  });
  it('keeps a confirmed active session visible while settings refresh and on transient failure', async () => {
    await startActivityTracking();
    const store=useSessionLockStore();const lock=vi.spyOn(store,'lock');
    let rejectRefresh;
    mocks.get.mockImplementationOnce(()=>new Promise((_,reject)=>{rejectRefresh=reject;}));
    const refresh=startActivityTracking({force:true});
    expect(store.isLocked).toBe(false);expect(store.lockConfig).not.toBeNull();
    rejectRefresh(new Error('Temporary network failure'));await refresh;
    expect(lock).not.toHaveBeenCalled();expect(store.warningActive).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(store.warningActive).toBe(true); // The original idle deadline was preserved.
  });
  it('deduplicates settings refreshes and keeps a real PIN lock in place', async () => {
    policy={...policy,useLockScreen:true,pinRequired:true};
    serverSession={...serverSession,phase:'timedown',lockAt:Date.now()-1000};
    await startActivityTracking();
    let resolveRefresh;mocks.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveRefresh=resolve;}));
    const one=startActivityTracking({force:true}),two=startActivityTracking({force:true});
    expect(mocks.get).toHaveBeenCalledTimes(2);expect(useSessionLockStore().isLocked).toBe(true);
    expect(useSessionLockStore().lockConfig.pinRequired).toBe(true);
    resolveRefresh({data:{...policy,session:serverData().session}});await Promise.all([one,two]);
    expect(useSessionLockStore().isLocked).toBe(true);
  });
  it('cancels pending verification retries when tracking stops', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Network error'));
    await startActivityTracking();
    stopActivityTracking();
    await vi.advanceTimersByTimeAsync(70000);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.logout).not.toHaveBeenCalled();
  });
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
