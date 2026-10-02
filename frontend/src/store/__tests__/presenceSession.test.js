import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: mocks }));
vi.mock('../auth', () => ({ useAuthStore: () => ({ user: { id: 555 } }) }));
import { usePresenceSessionStore } from '../presenceSession';
const away = () => ({ data: { session_extend_active: true, presence_session_extend_until: new Date(Date.now() + 3600000).toISOString(), presence_reason: 'meal' } });
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.resetAllMocks(); mocks.post.mockResolvedValue({ data: {} }); });
describe('Away state recovery', () => {
  it('does not restore an old Away timer when a refresh finishes after returning', async () => {
    const store = usePresenceSessionStore();
    store.setLocalExtend(away().data.presence_session_extend_until);
    let finish;
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const refresh = store.refreshFromServer();
    await store.clearAway();
    finish(away()); await refresh;
    expect(store.sessionExtendUntil).toBeNull();
    expect(localStorage.getItem('presence:sessionExtendUntil')).toBeNull();
  });
  it('clears a cached timer after reopening when the server reports Active', async () => {
    localStorage.setItem('presence:sessionExtendUntil', away().data.presence_session_extend_until);
    const store = usePresenceSessionStore();
    expect(store.isExtended).toBe(true);
    mocks.get.mockResolvedValue({ data: { session_extend_active: false } });
    await store.refreshFromServer();
    expect(store.sessionExtendUntil).toBeNull();
  });
  it('keeps a failed clear retryable and waits for server confirmation', async () => {
    const store = usePresenceSessionStore();
    store.setLocalExtend(away().data.presence_session_extend_until);
    mocks.post.mockRejectedValueOnce(new Error('Offline'));
    await expect(store.clearAway()).rejects.toThrow('Offline');
    expect(store.promptBusy).toBe(false);
    expect(store.isExtended).toBe(true);
    await store.clearAway();
    expect(store.sessionExtendUntil).toBeNull();
    expect(mocks.post).toHaveBeenLastCalledWith('/presence/status/clear', {}, expect.objectContaining({ timeout: 10000 }));
  });
  it('keeps the newest refresh when requests complete out of order', async () => {
    const store = usePresenceSessionStore();
    let finish;
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ data: {} });
    const old = store.refreshFromServer();
    await store.refreshFromServer();
    finish(away()); await old;
    expect(store.sessionExtendUntil).toBeNull();
  });
});
