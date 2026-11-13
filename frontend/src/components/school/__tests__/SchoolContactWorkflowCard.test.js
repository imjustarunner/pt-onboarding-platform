import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Card from '../SchoolContactWorkflowCard.vue';
import api from '../../../services/api';
import { useAgencyStore } from '../../../store/agency';
import { useUserPreferencesStore } from '../../../store/userPreferences';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
let wrapper;
const workflow = { id: 12, clientId: 99, initials: 'AB', status: 'waiting_parent', initialSentAt: '2026-10-30T18:00:00Z', conversationId: 45 };
const options = { props: { agencyId: 450, clientId: 99 }, global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' } } } };
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); api.get.mockResolvedValue({ data: [{ ...workflow }, { ...workflow, id: 13, clientId: 100 }] }); api.post.mockResolvedValue({ data: { stopped: true } }); });
afterEach(() => wrapper?.unmount());
it('shows the client’s contact record and records an outside reply to stop follow-ups', async () => {
  wrapper = mount(Card, options); await flushPromises();
  expect(wrapper.findAll('article')).toHaveLength(1);
  expect(wrapper.text()).toContain('Waiting for the family');
  expect(wrapper.find('a').text()).toContain('View email conversation');
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/school-contact-plan/workflows/12/parent-replied', {}, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(wrapper.text()).toContain('Intake coordination in progress');
  expect(wrapper.text()).not.toContain('Intake documented');
  expect(wrapper.find('button').exists()).toBe(false);
});
it('keeps outstanding documentation visible after a reply following the day-six notice',async()=>{
  api.get.mockResolvedValue({data:[{...workflow,status:'intake_followup_required',providerNotifiedAt:'2026-11-06T18:00:00Z'}]});
  wrapper=mount(Card,options);await flushPromises();
  await wrapper.find('button').trigger('click');await flushPromises();
  expect(wrapper.text()).toContain('Intake Follow-Up Required');
  expect(wrapper.text()).not.toContain('Intake documented');
  expect(wrapper.find('button').exists()).toBe(false);
});
it('preserves the stop action when recording a reply fails', async () => {
  api.post.mockRejectedValue(new Error('offline'));
  wrapper = mount(Card, options); await flushPromises();
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(wrapper.find('[role="alert"]').text()).toContain('could not be recorded');
  expect(wrapper.find('button').exists()).toBe(true);
});
it('does not fetch automation outside the rollout agencies or offer stop after an in-app reply', async () => {
  wrapper = mount(Card, { ...options, props: { agencyId: 7, clientId: 99 } }); await flushPromises();
  expect(api.get).not.toHaveBeenCalled(); expect(wrapper.find('section').exists()).toBe(false);
  api.get.mockResolvedValue({ data: [{ ...workflow, parentReplyAt: '2026-10-30T19:00:00Z', status: 'awaiting_provider' }] });
  await wrapper.setProps({ agencyId: 450 }); await flushPromises();
  expect(wrapper.text()).toContain('Your response is needed'); expect(wrapper.find('button').exists()).toBe(false);
});

it('uses the user’s timezone and the selected tenant for its conversation link', async () => {
  const agencyStore = useAgencyStore(); agencyStore.currentAgency = { id: 450, portal_url: 'auricwell-qa-demo' };
  const preferences = useUserPreferencesStore(); preferences.timezone = 'America/Denver'; preferences.timeFormat = '24h';
  wrapper = mount(Card, options); await flushPromises();
  expect(wrapper.text()).toContain('12:00');
  expect(JSON.parse(wrapper.find('a').attributes('data-to'))).toEqual({ path: '/auricwell-qa-demo/messages', query: { conversationId: 45 } });
});

it('lets a live ITSCO provider record an outside family reply through the same protected workflow',async()=>{
 wrapper=mount(Card,{...options,props:{agencyId:2,clientId:99}});await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/school-contact-plan/workflows',expect.objectContaining({params:{agencyId:2,clientId:99}}));
 await wrapper.find('button').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/school-contact-plan/workflows/12/parent-replied',{},expect.objectContaining({params:{agencyId:2}}));
 expect(wrapper.text()).toContain('stopped');
});

const failedWelcome = { id: 12, clientId: 99, status: 'needs_review', initialSentAt: null, canRetryInitial: true,
  note: 'EMAIL_SENDER_UNVERIFIED', steps: [{ id: 7, step_key: 'initial_email', status: 'needs_review' }] };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

it('queues a server-approved unsent welcome retry without claiming it was sent or erasing its history', async () => {
  api.get.mockResolvedValue({ data: [{ ...failedWelcome }] });
  api.post.mockResolvedValue({ data: { queued: true, workflowId: 12, status: 'queued', alreadyQueued: false } });
  wrapper = mount(Card, options); await flushPromises();
  expect(wrapper.find('button').text()).toBe('Retry welcome');
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/school-contact-plan/workflows/12/retry-initial', {}, expect.objectContaining({ params: { agencyId: 450 }, skipGlobalLoading: true }));
  expect(wrapper.find('[role="status"]').text()).toBe('Welcome retry queued. Delivery will be checked before sending.');
  expect(wrapper.text()).toContain('EMAIL_SENDER_UNVERIFIED');
  expect(wrapper.text()).toContain('initial email · needs_review');
  expect(wrapper.text()).not.toContain('First email');
  expect(wrapper.find('button').exists()).toBe(false);
});

it.each([
  ['unknown delivery', { canRetryInitial: false }],
  ['no explicit retry authorization', { canRetryInitial: undefined }],
  ['a successful initial', { initialSentAt: workflow.initialSentAt, status: 'waiting_parent' }],
  ['a cancelled plan', { status: 'cancelled' }],
  ['a parent reply', { parentReplyAt: workflow.initialSentAt }],
  ['an outside reply', { externalReplyRecordedAt: workflow.initialSentAt }]
])('does not offer welcome retry for %s', async (_label, change) => {
  api.get.mockResolvedValue({ data: [{ ...failedWelcome, ...change }] });
  wrapper = mount(Card, options); await flushPromises();
  expect(wrapper.findAll('button').some(button => button.text() === 'Retry welcome')).toBe(false);
  expect(api.post).not.toHaveBeenCalled();
});

it('blocks repeated clicks while the queue request is pending and accepts an already-queued response', async () => {
  const pending = deferred();
  api.get.mockResolvedValue({ data: [{ ...failedWelcome }] }); api.post.mockReturnValue(pending.promise);
  wrapper = mount(Card, options); await flushPromises();
  const button = wrapper.find('button');
  await button.trigger('click'); await button.trigger('click');
  expect(button.attributes('disabled')).toBeDefined(); expect(button.text()).toBe('Queuing…');
  expect(api.post).toHaveBeenCalledTimes(1);
  pending.resolve({ data: { queued: true, workflowId: 12, status: 'queued', alreadyQueued: true } }); await flushPromises();
  expect(wrapper.text()).toContain('Welcome retry queued. Delivery will be checked before sending.');
  expect(wrapper.find('button').exists()).toBe(false);
});

it('shows a queued retry after readback without offering another send', async () => {
  api.get.mockResolvedValue({ data: [{ ...failedWelcome, status: 'queued', canRetryInitial: false, retryInitialQueued: true }] });
  wrapper = mount(Card, options); await flushPromises();
  expect(wrapper.find('[role="status"]').text()).toContain('Delivery will be checked before sending');
  expect(wrapper.find('button').exists()).toBe(false); expect(api.post).not.toHaveBeenCalled();
});

it('requires record refresh after an uncertain retry result instead of offering a blind resend', async () => {
  api.get.mockResolvedValue({ data: [{ ...failedWelcome }] }); api.post.mockRejectedValue(new Error('connection closed'));
  wrapper = mount(Card, options); await flushPromises();
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(wrapper.find('[role="alert"]').text()).toContain('Refresh this record and review delivery');
  expect(wrapper.find('button').exists()).toBe(false);
  expect(wrapper.text()).not.toContain('Welcome retry queued');
});

it.each(['resolved', 'rejected'])('ignores an old retry %s response after the selected agency and client change', async outcome => {
  const pending = deferred();
  api.get.mockResolvedValueOnce({ data: [{ ...failedWelcome }] }); api.post.mockReturnValueOnce(pending.promise);
  wrapper = mount(Card, options); await flushPromises();
  await wrapper.find('button').trigger('click');
  api.get.mockResolvedValueOnce({ data: [{ ...failedWelcome, id: 44, clientId: 100 }] });
  await wrapper.setProps({ agencyId: 2, clientId: 100 }); await flushPromises();
  if (outcome === 'resolved') pending.resolve({ data: { queued: true, workflowId: 12, status: 'queued' } });
  else pending.reject({ response: { data: { error: { message: 'Old record delivery changed' } } } });
  await flushPromises();
  expect(wrapper.find('button').text()).toBe('Retry welcome'); expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  expect(wrapper.find('[role="alert"]').exists()).toBe(false); expect(wrapper.find('[role="status"]').exists()).toBe(false);
  api.post.mockResolvedValueOnce({ data: { queued: true, workflowId: 44, status: 'queued' } });
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/school-contact-plan/workflows/44/retry-initial', {}, expect.objectContaining({ params: { agencyId: 2 } }));
  expect(wrapper.text()).toContain('Welcome retry queued. Delivery will be checked before sending.');
});
