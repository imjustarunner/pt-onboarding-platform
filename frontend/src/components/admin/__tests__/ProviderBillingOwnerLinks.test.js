import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import Panel from '../ProviderBillingSettings.vue';
import api from '../../../services/api';

const state = vi.hoisted(() => ({ auth: null, agency: null }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'sample-coach' } }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => state.agency }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  state.auth = reactive({ user: { id: 4001, role: 'provider' } });
  state.agency = reactive({ currentAgency: { id: 7001, slug: 'sample-coach', organization_type: 'life_coach', account_owner_user_id: 4001 } });
  api.get.mockResolvedValue({ data: { services: [] } });
});
const mountPanel = () => mount(Panel, { props: { providerId: 4001, agencyId: 7001 },
  global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });

describe('independent practice owner billing links', () => {
  it('shows the owner package and business-account links without a global admin role', async () => {
    const wrapper = mountPanel(); await flushPromises();
    expect(wrapper.find('a[href="/sample-coach/admin/package-catalog"]').text()).toContain('session units');
    expect(wrapper.find('a[href="/sample-coach/admin/business-account"]').text()).toContain('bank setup');
    wrapper.unmount();
  });
  it('does not expose management links to another provider or another selected agency', async () => {
    state.agency.currentAgency.account_owner_user_id = 99;
    const wrapper = mountPanel(); await flushPromises();
    expect(wrapper.find('a[href="/sample-coach/admin/package-catalog"]').exists()).toBe(false);
    expect(wrapper.find('a[href="/sample-coach/admin/business-account"]').exists()).toBe(false);
    state.agency.currentAgency.account_owner_user_id = 4001;
    state.agency.currentAgency.id = 999;
    await flushPromises();
    expect(wrapper.find('a[href="/sample-coach/admin/business-account"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
