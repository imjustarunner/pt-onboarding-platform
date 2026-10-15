import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
const m = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), route: null }));
vi.mock('../../../services/api', () => ({ default: { post: m.post, get: m.get, put: vi.fn() }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'provider' }, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, name: 'Test' }, agencies: [], userAgencies: [] }) }));
import Dialog from '../DayCancellationDialog.vue';
import Grid from '../ScheduleAvailabilityGrid.vue';
import { clearScheduleSummaryCache } from '../../../utils/scheduleSummaryCache';

const token = 'reviewed-day-token';
const base = '/availability/providers/7/day-cancellation';
const fixture = (status = 'preview', results = {}) => ({
  token, status, date: '2026-10-15', providerId: 7,
  scopes: [{ agencyId: 2, timeZone: 'America/Denver' }],
  clientFacingReason: 'Your provider is unavailable due to an unexpected schedule change.',
  followUpAction: 'client_contact_support', followUpMessage: 'Contact support for another time.',
  items: [
    { key: 'appointment:41', kind: 'appointment', title: 'Client session', recipients: ['Example Client'], agencyId: 2, timeZone: 'America/Denver', startAt: '2026-10-15T16:00:00Z', note: 'Provider-initiated cancellation. No fee.' },
    { key: 'weekly:52', kind: 'weekly', title: 'Virtual opening', agencyId: 2, timeZone: 'America/Denver', startAt: '2026-10-15T18:00:00Z' }
  ],
  unchanged: [{ key: 'meeting:63', title: 'Started meeting', detail: 'Already started; review individually.', timeZone: 'America/Denver', startAt: '2026-10-15T12:00:00Z' }],
  results
});
const completed = { 'appointment:41': { status: 'completed' }, 'weekly:52': { status: 'completed' } };
let wrapper;
let originalShowModal;
const button = text => wrapper.findAll('button').find(b => b.text() === text);
function open() {
  wrapper = mount(Dialog, { props: { providerId: 7, agencyId: 2, agencyOptions: [{ id: 2, name: 'Test agency' }, { id: 3, label: 'Second agency' }], date: '2026-10-15' }, attachTo: document.body });
  return wrapper;
}
async function review() {
  await wrapper.findAll('textarea')[0].setValue(fixture().clientFacingReason);
  await button('Review day').trigger('click');
  await flushPromises();
}
async function signAndConfirm() {
  await wrapper.find('.day-signature input').setValue(true);
  await button('Confirm cancellation').trigger('click');
  await flushPromises();
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-13T18:00:00Z'));
  setActivePinia(createPinia()); localStorage.clear(); clearScheduleSummaryCache(); vi.clearAllMocks();
  m.route = reactive({ path: '/dashboard', params: {}, query: {} });
  m.get.mockImplementation(async url => ({ data: url.includes('/schedule-summary') ? { providerId: 7, weekStart: '2026-10-12', scheduleEvents: [], scheduleAgencyIds: [2] } : { review: null } }));
  originalShowModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
  m.post.mockImplementation(async url => ({ data: url.endsWith('/preview') ? fixture() : fixture('completed', completed) }));
});
afterEach(() => {
  wrapper?.unmount(); clearScheduleSummaryCache(); vi.useRealTimers();
  if (originalShowModal) HTMLDialogElement.prototype.showModal = originalShowModal;
  else delete HTMLDialogElement.prototype.showModal;
});

describe('day cancellation review', () => {
  it('opens without network actions and requires a reason and an agency before review', async () => {
    open();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(wrapper.find('dialog').attributes('open')).toBeDefined();
    expect(m.post).not.toHaveBeenCalled();
    expect(button('Review day').element.disabled).toBe(true);
    await wrapper.findAll('textarea')[0].setValue('Provider unavailable.');
    expect(button('Review day').element.disabled).toBe(false);
    for (const checkbox of wrapper.findAll('fieldset input')) await checkbox.setValue(false);
    expect(button('Review day').element.disabled).toBe(true);
    await button('Review day').trigger('click');
    expect(m.post).not.toHaveBeenCalled();
    await button('Close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('saved')).toBeUndefined();
  });
  it('previews the chosen agencies and separate reasons before any apply request', async () => {
    open();
    await wrapper.findAll('fieldset input')[1].setValue(false);
    await wrapper.findAll('textarea')[1].setValue('Private staffing note.');
    await wrapper.findAll('textarea')[2].setValue('Please contact support for another time.');
    await review();
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.post).toHaveBeenCalledWith(`${base}/preview`, {
      agencyIds: [2], date: '2026-10-15', clientFacingReason: fixture().clientFacingReason,
      internalReason: 'Private staffing note.', notificationMode: 'send', suppressionReason: '', followUpAction: 'client_contact_support', followUpMessage: 'Please contact support for another time.'
    }, { skipGlobalLoading: true });
    expect(wrapper.find('.day-review').text()).toContain(fixture().clientFacingReason);
    expect(wrapper.find('.day-review').text()).not.toContain('Private staffing note');
    expect(wrapper.find('.day-items').text()).toContain('Example Client');
    expect(wrapper.find('details').text()).toContain('No fee');
    expect(wrapper.text()).toContain('Already started; review individually.');
    expect(button('Confirm cancellation').element.disabled).toBe(true);
    await button('Confirm cancellation').trigger('click');
    expect(m.post).toHaveBeenCalledOnce();
  });
  it('requires a fresh signature after going back and rebuilding the preview', async () => {
    open(); await review();
    await wrapper.find('.day-signature input').setValue(true);
    await button('Back').trigger('click');
    await button('Review day').trigger('click'); await flushPromises();
    expect(wrapper.find('.day-signature input').element.checked).toBe(false);
    expect(button('Confirm cancellation').element.disabled).toBe(true);
    expect(m.post.mock.calls.every(([url]) => url.endsWith('/preview'))).toBe(true);
  });
  it('signs, updates the reviewed plan, and emits saved only when the processed dialog closes', async () => {
    open(); await review(); await signAndConfirm();
    expect(m.post).toHaveBeenLastCalledWith(`${base}/${token}/apply`, { signatureConfirmed: true, retryFailed: false }, { skipGlobalLoading: true });
    expect(wrapper.text()).toContain('The day is marked unavailable and the listed items were updated.');
    expect(wrapper.emitted('saved')).toBeUndefined();
    await button('Done').trigger('click');
    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('resumes the same plan after processing is interrupted without redoing the preview', async () => {
    let applications = 0;
    m.post.mockImplementation(async url => {
      if (url.endsWith('/preview')) return { data: fixture() };
      applications++;
      if (applications === 1) return { data: fixture('processing', { 'appointment:41': { status: 'completed' } }) };
      if (applications === 2) throw new Error('Connection interrupted');
      return { data: fixture('completed', completed) };
    });
    open(); await review(); await signAndConfirm();
    expect(wrapper.find('[role="alert"]').text()).toContain('Continue');
    expect(wrapper.find('.day-items').text()).toContain('Updated');
    expect(button('Continue').element.disabled).toBe(false);
    await button('Continue').trigger('click'); await flushPromises();
    expect(m.post.mock.calls.filter(([url]) => url.endsWith('/preview'))).toHaveLength(1);
    expect(m.post.mock.calls.filter(([url]) => url.endsWith('/apply'))).toHaveLength(3);
    expect(wrapper.text()).toContain('listed items were updated');
  });
  it('reports partial failures and delivery warnings and retries only when requested', async () => {
    let applications = 0;
    m.post.mockImplementation(async url => {
      if (url.endsWith('/preview')) return { data: fixture() };
      applications++;
      return { data: applications === 1 ? fixture('partial', {
        'appointment:41': { status: 'completed', notificationDelivery: { failed: 1, held: 1, pending: 1 } },
        'weekly:52': { status: 'failed', message: 'Opening changed. Review individually.' }
      }) : fixture('completed', completed) };
    });
    open(); await review(); await signAndConfirm();
    expect(applications).toBe(1);
    expect(wrapper.text()).toContain('Some items still need attention');
    expect(wrapper.text()).toContain('Opening changed. Review individually.');
    expect(wrapper.findAll('[role="alert"]').some(el => el.text().includes('2 notifications need attention'))).toBe(true);
    expect(wrapper.text()).toContain('Communications tab');
    expect(wrapper.text()).toContain('1 schedule updates are queued');
    await button('Retry failed items').trigger('click'); await flushPromises();
    expect(m.post).toHaveBeenLastCalledWith(`${base}/${token}/apply`, { signatureConfirmed: true, retryFailed: true }, { skipGlobalLoading: true });
    expect(button('Retry failed items')).toBeUndefined();
  });
  it('prevents closing while updating and refreshes after closing an interrupted processed plan', async () => {
    let rejectApply;
    // First apply returns a partial progress receipt, second remains in flight.
    let count = 0;
    m.post.mockImplementation(url => {
      if (url.endsWith('/preview')) return Promise.resolve({ data: fixture() });
      if (++count === 1) return Promise.resolve({ data: fixture('processing', { 'appointment:41': { status: 'completed' } }) });
      return new Promise((_, reject) => { rejectApply = reject; });
    });
    open(); await review(); await signAndConfirm();
    expect(button('Done').element.disabled).toBe(true);
    await wrapper.find('dialog').trigger('cancel');
    expect(wrapper.emitted('close')).toBeUndefined();
    rejectApply(new Error('Interrupted')); await flushPromises();
    await button('Done').trigger('click');
    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('restores an interrupted signed review on reopen without automatically applying it', async () => {
    m.get.mockResolvedValue({ data: { review: fixture('processing', { 'appointment:41': { status: 'completed' } }) } });
    open(); await flushPromises();
    expect(m.get).toHaveBeenCalledWith(base, { params: { date: '2026-10-15' }, skipGlobalLoading: true });
    expect(m.post).not.toHaveBeenCalled();
    expect(button('Continue').element.disabled).toBe(false);
    expect(wrapper.text()).toContain('Contact support for another time.');
    await button('Continue').trigger('click'); await flushPromises();
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.post).toHaveBeenCalledWith(`${base}/${token}/apply`, { signatureConfirmed: true, retryFailed: false }, { skipGlobalLoading: true });
  });
  it('restores partial failures for explicit retry without sending more notifications on open', async () => {
    m.get.mockResolvedValue({ data: { review: fixture('partial', { 'appointment:41': { status: 'completed' }, 'weekly:52': { status: 'failed', message: 'Review this opening.' } }) } });
    open(); await flushPromises();
    expect(m.post).not.toHaveBeenCalled();
    expect(button('Retry failed items').exists()).toBe(true);
    await button('Done').trigger('click');
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });
  it('blocks a fresh review when checking for an interrupted cancellation fails', async () => {
    m.get.mockRejectedValue(new Error('Resume lookup unavailable'));
    open(); await flushPromises();
    await wrapper.findAll('textarea')[0].setValue('Provider unavailable.');
    expect(wrapper.find('[role="alert"]').text()).toContain('Close and reopen');
    expect(button('Review day').element.disabled).toBe(true);
    await button('Review day').trigger('click');
    expect(m.post).not.toHaveBeenCalled();
    await button('Close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('saved')).toBeUndefined();
  });
  it('refreshes the schedule on close if the first apply response was lost', async () => {
    m.post.mockImplementation(async url => {
      if (url.endsWith('/preview')) return { data: fixture() };
      throw new Error('Response lost after server may have committed');
    });
    open(); await review(); await signAndConfirm();
    expect(wrapper.find('[role="alert"]').text()).toContain('Processing was interrupted');
    expect(button('Continue').element.disabled).toBe(false);
    expect(m.post.mock.calls.filter(([url]) => url.endsWith('/apply'))).toHaveLength(1);
    await button('Close').trigger('click');
    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('reports preview errors without entering the cancellation state', async () => {
    m.post.mockRejectedValue({ response: { data: { error: { message: 'Schedule access denied.' } } } });
    open(); await review();
    expect(wrapper.find('[role="alert"]').text()).toContain('Schedule access denied.');
    expect(button('Review day').exists()).toBe(true);
    expect(button('Confirm cancellation')).toBeUndefined();
    expect(wrapper.emitted('saved')).toBeUndefined();
  });
});

it('opens exactly one dialog from a day header without focusing the day or opening a booking editor', async () => {
  wrapper = shallowMount(Grid, { props: { userId: 7, agencyId: 2, mode: 'self', weekStartYmd: '2026-10-12' }, global: { stubs: { RouterLink: true, ClinicalWorkspaceFrame: { template: '<div><slot /></div>' }, DayCancellationDialog: false } } });
  await flushPromises(); const state = wrapper.vm.$.setupState; await state.load({ forceRefresh: true }); await flushPromises();
  const before = [...state.focusedDays];
  const dayButton = wrapper.findAll('.sched-day-cancel').find(b => b.attributes('aria-label')?.includes('Tuesday'));
  await dayButton.trigger('click'); await flushPromises();
  expect(wrapper.findAllComponents(Dialog)).toHaveLength(1);
  expect(wrapper.findAll('dialog')).toHaveLength(1);
  expect(state.focusedDays).toEqual(before);
  expect(state.showRequestModal).toBe(false);
  expect(m.post).not.toHaveBeenCalled();
  await wrapper.findComponent(Dialog).find('button[aria-label="Close"]').trigger('click'); await flushPromises();
  expect(wrapper.findAll('dialog')).toHaveLength(0);
});
