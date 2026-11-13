import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Overview from '../SchoolClientOverviewPanel.vue';
import WorkflowCard from '../SchoolContactWorkflowCard.vue';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../ClientTicketThreadPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../admin/PhiDocumentsPanel.vue', () => ({ default: { template: '<div />' } }));

let wrapper, pinia, auth;
const client = { id: 2561, agency_id: 450, organization_id: 451, full_name: 'Fable QA-ReplyStop-1113',
  client_status_key: 'received', client_status_label: 'Received', school_staff_effective_access_state: 'none',
  roi_status: 'pending', clinical_ready: false };
const workflow = id => ({ id: id === 2561 ? 64831 : 64832, clientId: id, status: 'needs_review',
  initialSentAt: null, canRetryInitial: true, retryInitialQueued: false, note: 'EMAIL_SENDER_UNVERIFIED' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const callsTo = path => api.get.mock.calls.filter(([url]) => url === path);
const retryButton = () => wrapper.findAll('button').find(button => button.text() === 'Retry welcome');

function ordinaryGet(url, config) {
  if (url === '/school-contact-plan') return Promise.resolve({ data: { eligible: true } });
  if (url === '/school-contact-plan/workflows') return Promise.resolve({ data: [workflow(Number(config.params.clientId)), workflow(9999)] });
  if (String(url).endsWith('/comments')) return Promise.resolve({ data: [] });
  if (String(url).endsWith('/school-staff-roi-summary')) return Promise.resolve({ data: { staff: [] } });
  return Promise.resolve({ data: {} });
}
function open(props = {}) {
  wrapper = mount(Overview, { props: { client: { ...client }, schoolOrganizationId: 451, parentAgencyId: 450, ...props },
    global: { plugins: [pinia], stubs: { ParentContactAttempts: true,
      RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' } } } });
  return wrapper;
}

beforeEach(() => {
  localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); auth = useAuthStore();
  auth.user = { id: 1433, role: 'provider' };
  const agency = useAgencyStore(); agency.currentAgency = { id: 450, slug: 'auricwell-qa-demo' };
  vi.resetAllMocks(); api.get.mockImplementation(ordinaryGet);
  api.post.mockResolvedValue({ data: { queued: true, workflowId: 64831, status: 'queued' } });
});
afterEach(() => wrapper?.unmount());

it('opens the exact pending client’s real welcome recovery outside clinical ROI and checklist guards', async () => {
  api.get.mockImplementation((url, config) => url === '/clients/2561'
    ? Promise.reject({ response: { status: 403, data: { error: { message: 'Clinical access restricted' } } } })
    : ordinaryGet(url, config));
  open(); await flushPromises();
  expect(callsTo('/school-contact-plan')).toEqual([['/school-contact-plan', expect.objectContaining({ params: { agencyId: 450 }, skipGlobalLoading: true })]]);
  expect(callsTo('/school-contact-plan/workflows')).toEqual([['/school-contact-plan/workflows', expect.objectContaining({ params: { agencyId: 450, clientId: 2561 } })]]);
  const card = wrapper.findComponent(WorkflowCard);
  expect(card.exists()).toBe(true); expect(card.props()).toMatchObject({ agencyId: 450, clientId: 2561 });
  expect(card.element.closest('.dual')).toBe(null);
  expect(card.findAll('article')).toHaveLength(1);
  expect(retryButton()).toBeDefined();
  await retryButton().trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/school-contact-plan/workflows/64831/retry-initial', {}, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(card.text()).toContain('Welcome retry queued. Delivery will be checked before sending.');
  expect(card.text()).not.toContain('First email');
});

it.each(['provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant'])('uses the normal server eligibility descriptor for care role %s', async role => {
  auth.user = { id: 1433, role }; open(); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(1);
  expect(wrapper.findComponent(WorkflowCard).exists()).toBe(true);
  expect(callsTo('/school-contact-plan/workflows')[0][1].params).toEqual({ agencyId: 450, clientId: 2561 });
});

it.each([true, 1, '1'])('permits a normal server cohort check when provider access is explicitly %s', async has_provider_access => {
  auth.user = { id: 1433, role: 'staff', has_provider_access }; open(); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(1);
  expect(wrapper.findComponent(WorkflowCard).exists()).toBe(true);
});

it.each(['school_staff', 'support', 'staff', 'admin'])('does not request provider workflows for plain %s', async role => {
  auth.user = { id: 1434, role }; open(); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(0);
  expect(callsTo('/school-contact-plan/workflows')).toHaveLength(0);
  expect(wrapper.findComponent(WorkflowCard).exists()).toBe(false);
});

it.each([false, 0, '0', 'true'])('does not treat the provider-access value %s as explicit care access', async has_provider_access => {
  auth.user = { id: 1434, role: 'support', has_provider_access }; open(); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(0);
  expect(callsTo('/school-contact-plan/workflows')).toHaveLength(0);
});

it.each([false, undefined, 'true'])('requires descriptor eligible===true before mounting workflows (%s)', async eligible => {
  api.get.mockImplementation((url, config) => url === '/school-contact-plan' ? Promise.resolve({ data: { eligible } }) : ordinaryGet(url, config));
  open(); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(1);
  expect(callsTo('/school-contact-plan/workflows')).toHaveLength(0);
  expect(wrapper.findComponent(WorkflowCard).exists()).toBe(false);
});

it('keeps the ordinary Overview usable when the eligibility descriptor fails', async () => {
  api.get.mockImplementation((url, config) => url === '/school-contact-plan' ? Promise.reject(new Error('offline')) : ordinaryGet(url, config));
  open(); await flushPromises();
  expect(wrapper.find('h2').text()).toBe(client.full_name);
  expect(callsTo('/school-contact-plan/workflows')).toHaveLength(0);
  expect(wrapper.findComponent(WorkflowCard).exists()).toBe(false);
});

it.each([
  ['conflicting row agency', { parentAgencyId: 450, client: { ...client, agency_id: 2 } }],
  ['excluded tenant', { parentAgencyId: 6, client: { ...client, agency_id: 6 } }],
  ['school ID used as parent agency', { parentAgencyId: 451, client: { ...client, agency_id: 451 } }],
  ['missing parent context', { parentAgencyId: null, client: { ...client, agency_id: undefined } }]
])('does not probe Family Welcome for %s', async (_label, props) => {
  open(props); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(0);
  expect(callsTo('/school-contact-plan/workflows')).toHaveLength(0);
});

it('uses the exact row agency when the parent prop is absent', async () => {
  open({ parentAgencyId: null }); await flushPromises();
  expect(wrapper.findComponent(WorkflowCard).props()).toMatchObject({ agencyId: 450, clientId: 2561 });
  expect(callsTo('/school-contact-plan')[0][1].params).toEqual({ agencyId: 450 });
});

it('reuses an eligible provider descriptor for another client while remounting the real exact-client card', async () => {
  open(); await flushPromises();
  const previous = wrapper.findComponent(WorkflowCard).vm;
  await wrapper.setProps({ client: { ...client, id: 2563 } }); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(1);
  expect(wrapper.findComponent(WorkflowCard).vm).not.toBe(previous);
  expect(wrapper.findComponent(WorkflowCard).props()).toMatchObject({ agencyId: 450, clientId: 2563 });
  expect(callsTo('/school-contact-plan/workflows').map(([, config]) => config.params)).toEqual([
    { agencyId: 450, clientId: 2561 }, { agencyId: 450, clientId: 2563 }
  ]);
});

it('binds a pending descriptor response to the currently selected client in the same provider context', async () => {
  const descriptor = deferred();
  api.get.mockImplementation((url, config) => url === '/school-contact-plan' ? descriptor.promise : ordinaryGet(url, config));
  open(); await flushPromises();
  await wrapper.setProps({ client: { ...client, id: 2563 } });
  descriptor.resolve({ data: { eligible: true } }); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(1);
  expect(callsTo('/school-contact-plan/workflows').map(([, config]) => config.params)).toEqual([{ agencyId: 450, clientId: 2563 }]);
});

it('ignores a stale eligible descriptor after switching both the client and parent agency', async () => {
  const old = deferred(), current = deferred();
  api.get.mockImplementation((url, config) => url === '/school-contact-plan'
    ? (config.params.agencyId === 450 ? old.promise : current.promise) : ordinaryGet(url, config));
  open(); await flushPromises();
  await wrapper.setProps({ parentAgencyId: 2, client: { ...client, id: 2563, agency_id: 2 } }); await flushPromises();
  current.resolve({ data: { eligible: true } }); await flushPromises();
  old.resolve({ data: { eligible: true } }); await flushPromises();
  expect(callsTo('/school-contact-plan').map(([, config]) => config.params.agencyId)).toEqual([450, 2]);
  expect(callsTo('/school-contact-plan/workflows').map(([, config]) => config.params)).toEqual([{ agencyId: 2, clientId: 2563 }]);
  expect(wrapper.findComponent(WorkflowCard).props()).toMatchObject({ agencyId: 2, clientId: 2563 });
});

it('does not mount an old provider’s workflows after the signed-in provider changes', async () => {
  const old = deferred(), current = deferred(); let descriptorCalls = 0;
  api.get.mockImplementation((url, config) => url === '/school-contact-plan'
    ? (++descriptorCalls === 1 ? old.promise : current.promise) : ordinaryGet(url, config));
  open(); await flushPromises();
  auth.user = { id: 1439, role: 'provider' }; await flushPromises();
  current.resolve({ data: { eligible: false } }); old.resolve({ data: { eligible: true } }); await flushPromises();
  expect(callsTo('/school-contact-plan')).toHaveLength(2);
  expect(callsTo('/school-contact-plan/workflows')).toHaveLength(0);
  expect(wrapper.findComponent(WorkflowCard).exists()).toBe(false);
});

it('discards a pending eligible response after the care role is removed', async () => {
  const descriptor = deferred();
  api.get.mockImplementation((url, config) => url === '/school-contact-plan' ? descriptor.promise : ordinaryGet(url, config));
  open(); await flushPromises(); auth.user = { id: 1433, role: 'support' }; await flushPromises();
  descriptor.resolve({ data: { eligible: true } }); await flushPromises();
  expect(callsTo('/school-contact-plan/workflows')).toHaveLength(0);
  expect(wrapper.findComponent(WorkflowCard).exists()).toBe(false);
});
