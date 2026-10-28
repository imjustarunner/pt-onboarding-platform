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
  const listing = { viewerFit: { status: 'match', canRequest: true }, id: 4, agencyId: 2, status: 'requested', currentProviderUserId: 99, presentingProblems: ['Current treatment concern'], diagnoses: ['F41.1 — Anxiety'], pendingRequestCount: 1 };
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
it('shows the saved referral reference and opens its details after posting', async () => {
  const listing = { id: 12, status: 'open', notes: 'Synthetic referral notes' };
  mocks.user = { id: 7, role: 'provider' };
  mocks.store = reactive({ currentAgency: { id: 450 }, userAgencies: [], agencies: [], fetchUserAgencies: vi.fn().mockResolvedValue([]) });
  mocks.route.query = {};
  mocks.get.mockImplementation(async url => ({ data: url.endsWith('/12') ? { listing, requests: [] } : { listings: [listing], requests: [] } }));
  const wrapper = makeWrapper(); await flushPromises();
  await wrapper.findAll('button').find(button => button.text() === 'Internal referral').trigger('click');
  wrapper.findComponent({ name: 'PostListingModal' }).vm.$emit('posted', listing);
  await flushPromises();
  expect(wrapper.find('[role="status"]').text()).toContain('Referral #12 posted');
  expect(wrapper.text()).toContain('Synthetic referral notes');
  expect(wrapper.find('.cep-detail-posted').text()).toContain('Referral #12');
});


it.each([
  { status: 'not_match', canRequest: false, blockers: [{ code: 'insurance', message: 'You are not verified to accept Tricare.' }], adjustments: [], label: 'Request blocked' },
  { status: 'not_match', canRequest: true, blockers: [], adjustments: [{ code: 'schedule', message: 'Open availability before care begins.' }], label: 'Can request' }
])('explains fit and enforces the request state ($label)', async fit => {
  const listing = { id: 4, agencyId: 2, status: 'open', clientType: 'clinical', currentProviderUserId: 99,
    viewerFit: fit, preferences: { modality: 'in_person', serviceLocation: 'Denver', insurance: 'Tricare' } };
  mocks.user = { id: 7, role: 'provider' };
  mocks.store = reactive({ currentAgency: { id: 2 }, userAgencies: [], agencies: [], fetchUserAgencies: vi.fn().mockResolvedValue([]) });
  mocks.route.query = { listingId: '4' };
  mocks.get.mockImplementation(async url => ({ data: url.endsWith('/4') ? { listing, requests: [] } : { listings: [listing], requests: [] } }));
  const wrapper = makeWrapper(); await flushPromises();
  expect(wrapper.text()).toContain(fit.label);
  expect(wrapper.text()).toContain('In-person location: Denver');
  expect(wrapper.text()).toContain('Clinical / Therapy');
  expect(wrapper.text()).toContain([...fit.blockers, ...fit.adjustments][0].message);
  expect(wrapper.findAll('button').some(button => button.text() === 'Request this client')).toBe(fit.canRequest);
  wrapper.unmount();
});

it.each(['staff','support','admin','super_admin','provider'])('shows the server-authorized audit to %s even when the local role is stale',async role=>{
  const listing={id:4,agencyId:2,status:'open',canViewAudit:true,canManageClaims:true};mocks.user={id:7,role};
  mocks.store=reactive({currentAgency:{id:2},userAgencies:[],agencies:[],fetchUserAgencies:vi.fn().mockResolvedValue([])});mocks.route.query={listingId:'4'};
  mocks.get.mockImplementation(async url=>({data:url.endsWith('/audit')?{providers:[],canReview:true}:url.endsWith('/4')?{listing,requests:[]}:{listings:[listing],requests:[]}}));
  const wrapper=makeWrapper();await flushPromises();expect(wrapper.text()).toContain('Matching and delivery audit');wrapper.unmount();
});
it('requires acknowledgement of the specific age/format warnings before submitting a request',async()=>{
  const listing={id:4,agencyId:2,status:'open',viewerFit:{status:'not_match',canRequest:true,canAssign:false,adjustments:[{code:'age',message:'Client age 8 is outside your listed ages.',fingerprint:'age-v1'},{code:'format_availability',message:'Client wants in person; you offer virtual only.',fingerprint:'format-v1'}]}};
  mocks.user={id:7,role:'provider'};mocks.store=reactive({currentAgency:{id:2},userAgencies:[],agencies:[],fetchUserAgencies:vi.fn().mockResolvedValue([])});mocks.route.query={listingId:'4'};
  mocks.get.mockImplementation(async url=>({data:url.endsWith('/4')?{listing,requests:[]}:{listings:[listing],requests:[]}}));mocks.post.mockReset().mockResolvedValue({data:{}});
  const wrapper=makeWrapper();await flushPromises();const request=wrapper.findAll('button').find(b=>b.text()==='Request this client');
  expect(request.attributes('disabled')).toBeDefined();expect(wrapper.text()).toContain('Client wants in person; you offer virtual only.');
  await wrapper.find('input[type="checkbox"]').setValue(true);expect(request.attributes('disabled')).toBeUndefined();await request.trigger('click');await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings/4/requests',{message:'',acknowledgedWarnings:['age-v1','format-v1']});wrapper.unmount();
});
