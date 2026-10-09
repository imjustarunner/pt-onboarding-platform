import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import Dashboard from '../SuperadminPlatformDashboard.vue';

const state = vi.hoisted(() => ({ query: {}, get: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/admin', query: state.query }),
  useRouter: () => ({ replace: vi.fn().mockResolvedValue(), push: vi.fn() })
}));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1, role: 'super_admin' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: null }) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({ platformBranding: {} }) }));
vi.mock('../../../services/api', () => ({ default: { get: state.get } }));
vi.mock('../../../services/workspaceNavigation', () => ({ openTenantWorkspace: vi.fn() }));
vi.mock('../../../components/admin/SuperadminDemoTestingLab.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/schedule/ScheduleAvailabilityGrid.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/schedule/WorkHoursEditor.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/messages/MessagesWorkspace.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/dashboard/PresenceTeamPreview.vue', () => ({ default: { name: 'PresenceTeamPreview', template: '<div />' } }));

beforeEach(() => { vi.clearAllMocks(); state.query = {}; state.get.mockResolvedValue({ data: [] }); });
describe('HQ team presence', () => {
  it.each(['overview', 'schedule'])('shows presence on %s even when telemetry fails', async panel => {
    state.query = { panel };
    state.get.mockRejectedValue(new Error('Telemetry unavailable'));
    const wrapper = shallowMount(Dashboard, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
    await flushPromises();
    expect(wrapper.findComponent({ name: 'PresenceTeamPreview' }).exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/presence"]').text()).toBe('Team Presence');
    wrapper.unmount();
  });
});
