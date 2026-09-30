import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ store: null, get: vi.fn(), post: vi.fn(), user: { id: 7, role: 'provider' }, route: { params: {}, query: {} } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.store }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: mocks.user }) }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get, post: mocks.post } }));
vi.mock('../../../composables/useClientDisplayMode', () => ({ useClientDisplayMode: () => ({ getClientLabel: () => 'Referral' }) }));
import Panel from '../ClientExchangePanel.vue';
const makeWrapper = () => mount(Panel, { global: { stubs: { RouterLink: true, ListingCard: true, ClientDisplayModeToggle: true, PostListingModal: true } } });
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

it('shows the shared client details before allowing a request and prevents duplicate requests', async () => {
  const listing = { id: 4, agencyId: 2, status: 'requested', currentProviderUserId: 99, presentingProblems: ['Current treatment concern'], diagnoses: ['F41.1 — Anxiety'], pendingRequestCount: 1 };
  mocks.user = { id: 7, role: 'provider' };
  mocks.store = reactive({ currentAgency: { id: 2 }, userAgencies: [], agencies: [], fetchUserAgencies: vi.fn().mockResolvedValue([]) });
  mocks.route.query = { listingId: '4' };
  let requested = false;
  mocks.get.mockImplementation(async url => ({ data: url.endsWith('/4') ? { listing, requests: requested ? [{ id: 8, listingId: 4, status: 'pending' }] : [] } : url.endsWith('my-requests') ? { requests: requested ? [{ id: 8, listingId: 4, status: 'pending' }] : [] } : { listings: [listing] } }));
  mocks.post.mockImplementation(async () => { requested = true; return { data: {} }; });
  const wrapper = makeWrapper(); await flushPromises();
  expect(wrapper.text()).toContain('Current treatment concern'); expect(wrapper.text()).toContain('F41.1 — Anxiety');
  const request = wrapper.findAll('button').find(button => button.text() === 'Request this client');
  expect(request).toBeDefined(); await request.trigger('click'); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings/4/requests', { message: '' });
  expect(wrapper.findAll('button').some(button => button.text() === 'Request this client')).toBe(false);
  wrapper.unmount();
});
it('uses initials in the exchange regardless of the chart display mode', async () => {
  mocks.user = { id: 7, role: 'provider' };
  mocks.store = reactive({ currentAgency: { id: 2 }, userAgencies: [], agencies: [], fetchUserAgencies: vi.fn().mockResolvedValue([]) });
  mocks.route.query = {};
  mocks.get.mockResolvedValue({ data: { listings: [{ id: 4, clientId: null, clientInitials: 'AB', full_name: 'Synthetic Name', status: 'open' }], requests: [] } });
  const wrapper = makeWrapper(); await flushPromises();
  expect(wrapper.findComponent({ name: 'ListingCard' }).props('clientLabel')).toBe('AB');
  expect(wrapper.text()).not.toContain('Synthetic Name'); wrapper.unmount();
});
