import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const state = vi.hoisted(() => ({ user: { id: 1, role: 'provider' }, currentAgency: { id: 2 } }));
vi.mock('../auth', () => ({ useAuthStore: () => ({ user: state.user }) }));
vi.mock('../agency', () => ({ useAgencyStore: () => state }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
import api from '../../services/api';
import { useCommunicationsCountsStore } from '../communicationsCounts';
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear(); state.currentAgency = { id: 2 }; state.user = { id: 1, role: 'provider' }; });
describe('message navigation unread count', () => {
  it.each(['client_guardian', 'client'])('does not request staff communications for %s', async role => {
    state.user.role = role;
    const store = useCommunicationsCountsStore();
    store.unreadMessagesCount = 12;
    await store.fetchCounts();
    expect(api.get).not.toHaveBeenCalled();
    expect(store.unreadMessagesCount).toBe(0);
  });
  it('includes email and chat using the same personal agency scope as the hub', async () => {
    api.get.mockResolvedValue({ data: { summary: { unread: 45, emailUnread: 40, chatUnread: 5 } } });
    const store = useCommunicationsCountsStore();
    await store.fetchCounts();
    expect(store.unreadMessagesCount).toBe(45);
    expect(api.get).toHaveBeenCalledWith('/communications/attention-summary', expect.objectContaining({ params: { agencyId: 2, hubScope: 1 } }));
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it('clears the badge when no agency is selected', async () => {
    const store = useCommunicationsCountsStore(); store.unreadMessagesCount = 45;
    state.currentAgency = null;
    await store.fetchCounts();
    expect(store.unreadMessagesCount).toBe(0);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('coalesces startup watchers and uses delivery counts already present in the summary', async () => {
    state.user.role = 'admin';
    const pending = [];
    api.get.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const store = useCommunicationsCountsStore();
    const calls = [store.fetchCounts(), store.fetchCounts(), store.fetchCounts()];
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.get.mock.calls.some(([url]) => url === '/communications/pending-count')).toBe(false);
    pending.forEach(resolve => resolve({ data: {
      tickets: { open: 2, in_progress: 3 }, engagement: { pendingCount: 8, qualityIssuesCount: 4 },
      summary: { unread: 6 }, count: 5
    } }));
    await Promise.all(calls);
    expect(store.pendingDeliveryCount).toBe(8);
    expect(store.supportAttentionCount).toBe(5);
    expect(store.unreadMessagesCount).toBe(6);
  });

  it('falls back to delivery counts if the shared summary fails', async () => {
    state.user.role = 'admin';
    api.get.mockImplementation(url => url === '/communications/center-summary'
      ? Promise.reject(new Error('unavailable'))
      : Promise.resolve({ data: { count: 7, qualityIssuesCount: 2 } }));
    const store = useCommunicationsCountsStore();
    await store.fetchCounts();
    expect(store.pendingDeliveryCount).toBe(7);
    expect(store.qualityIssuesCount).toBe(2);
  });

  it('does not request an unauthorized center summary for staff', async () => {
    state.user.role = 'staff';
    api.get.mockResolvedValue({ data: {} });
    await useCommunicationsCountsStore().fetchCounts();
    expect(api.get.mock.calls.map(([url]) => url)).toEqual([
      '/communications/pending-count', '/communications/attention-summary', '/support-tickets/count'
    ]);
  });

  it.each(['agency', 'account'])('ignores old responses after changing %s', async change => {
    let finishOld;
    api.get.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValue({ data: { summary: { unread: 3 } } });
    const store = useCommunicationsCountsStore();
    const old = store.fetchCounts();
    if (change === 'agency') state.currentAgency = { id: 7 };
    else state.user = { id: 9, role: 'provider' };
    await store.fetchCounts();
    finishOld({ data: { summary: { unread: 99 } } });
    await old;
    expect(store.unreadMessagesCount).toBe(3);
  });
  it('does not ask the agency communications counter for a school staff account',async()=>{state.user.role='school_staff';api.get.mockResolvedValue({data:{}});await useCommunicationsCountsStore().fetchCounts();expect(api.get.mock.calls.some(([path])=>path==='/communications/attention-summary')).toBe(false);});
});
