import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const state = vi.hoisted(() => ({ user: { id: 1, role: 'provider' }, currentAgency: { id: 2 } }));
vi.mock('../auth', () => ({ useAuthStore: () => ({ user: state.user }) }));
vi.mock('../agency', () => ({ useAgencyStore: () => state }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
import api from '../../services/api';
import { useCommunicationsCountsStore } from '../communicationsCounts';
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); state.currentAgency = { id: 2 }; });
describe('message navigation unread count', () => {
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
});
