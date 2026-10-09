import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Widget from '../PresenceStatusWidget.vue';
const state = vi.hoisted(() => ({ role: 'admin', open: vi.fn() }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: state.role } }) }));
vi.mock('../../../store/presenceSession', () => ({ usePresenceSessionStore: () => ({ openManualTimeoutPrompt: state.open, shouldUseStatusPrompt: () => false }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }) } }));
beforeEach(() => vi.clearAllMocks());
describe('Team Board status controls', () => {
  it.each(['admin', 'support', 'super_admin'])('keeps the board and status prompt available to %s without tenant flags', async role => {
    state.role = role;
    const wrapper = mount(Widget, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
    await flushPromises();
    expect(wrapper.find('a[href="/admin/presence"]').exists()).toBe(true);
    await wrapper.find('button').trigger('click');
    expect(state.open).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('does not show a privileged board link to providers', async () => {
    state.role = 'provider';
    const wrapper = mount(Widget, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
    expect(wrapper.find('.presence-team-link').exists()).toBe(false);
    wrapper.unmount();
  });
});
