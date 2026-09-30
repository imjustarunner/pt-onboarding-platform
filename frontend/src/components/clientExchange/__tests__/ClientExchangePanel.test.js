import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ store: null, get: vi.fn(), route: { params: {}, query: {} } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.store }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'provider' } }) }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get } }));
vi.mock('../../../composables/useClientDisplayMode', () => ({ useClientDisplayMode: () => ({ getClientLabel: () => 'Referral' }) }));
import Panel from '../ClientExchangePanel.vue';
const makeWrapper = () => mount(Panel, { global: { stubs: { ListingCard: true, ClientDisplayModeToggle: true, PostListingModal: true } } });
describe('exchange agency loading', () => {
  beforeEach(() => {
    mocks.store = reactive({ currentAgency: null, userAgencies: [], agencies: [], fetchUserAgencies: vi.fn().mockResolvedValue([]) });
    mocks.get.mockReset().mockResolvedValue({ data: { listings: [], requests: [] } });
    mocks.route.params = {}; mocks.route.query = {};
  });
  it('loads when agency hydration finishes after mount', async () => {
    const wrapper = makeWrapper();
    await flushPromises();
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.store.currentAgency = { id: 2, name: 'ITSCO' };
    await flushPromises();
    expect(mocks.get).toHaveBeenCalledWith('/client-exchange/listings', { params: { agencyId: 2 } });
    wrapper.unmount();
  });
  it('uses the route agency and reloads when the user changes agency', async () => {
    mocks.store.userAgencies = [{ id: 2, slug: 'itsco' }, { id: 3, slug: 'other' }];
    mocks.store.currentAgency = { id: 3 };
    mocks.route.params = { organizationSlug: 'itsco' };
    const wrapper = makeWrapper(); await flushPromises();
    expect(mocks.get).toHaveBeenCalledWith('/client-exchange/listings', { params: { agencyId: 2 } });
    await wrapper.find('select').setValue('3'); await flushPromises();
    expect(mocks.get).toHaveBeenCalledWith('/client-exchange/listings', { params: { agencyId: 3 } });
    wrapper.unmount();
  });
});
