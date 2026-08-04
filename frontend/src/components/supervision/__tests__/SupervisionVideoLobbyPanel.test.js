import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupervisionVideoLobbyPanel from '../SupervisionVideoLobbyPanel.vue';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock('../../../services/api', () => ({ default: apiMock }));

describe('SupervisionVideoLobbyPanel admit-all behavior', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.get.mockResolvedValue({
      data: {
        waitingRoomEnabled: true,
        participants: [
          { userId: 11, joinIdentity: 'user-11', displayName: 'One' },
          { userId: 12, joinIdentity: 'user-12', displayName: 'Two' }
        ]
      }
    });
    apiMock.post.mockResolvedValue({
      data: { ok: true, waitingRoomEnabled: false, admittedCount: 2 }
    });
  });

  it('admits the lobby and disables the waiting room in one operation', async () => {
    const wrapper = mount(SupervisionVideoLobbyPanel, {
      props: {
        sessionId: 42,
        isSupervisor: true,
        meetingKind: 'team-meeting'
      }
    });
    await flushPromises();

    const admitAll = wrapper.find('.lobby-panel-admit-all');
    expect(admitAll.text()).toContain('Admit all & open room (2)');
    await admitAll.trigger('click');
    await flushPromises();

    expect(apiMock.post).toHaveBeenCalledWith(
      '/team-meetings/42/waiting-room',
      { enabled: false, admitWaiting: true },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
    expect(wrapper.emitted('update:waitingCount')?.at(-1)).toEqual([0]);
    expect(wrapper.find('.lobby-panel').exists()).toBe(false);

    wrapper.unmount();
  });
});
