// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Panel from '../PayrollRawImportPanel.vue';
import { rawReviewState } from '../../../utils/payrollRawReview';

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
const draft = (id, extra = {}) => ({ id, provider_name: 'Test Employee', note_status: 'DRAFT', draft_payable: 1, service_code: 'H0004', service_date: '2026-10-21', unit_count: 4, ...extra });
const audit = (rows, extra = {}) => ({ data: { imports: [{ id: 15, slot_number: 2, draft_review_allowed: true }], selectedImportId: 15, rows, ...extra } });
const mountPanel = (props = {}) => mount(Panel, { props: { periodId: 11, guided: true, embedded: true, ...props }, global: { stubs: { PayrollWizardEmpty: { props: ['title', 'message'], template: '<div class="test-empty" role="status">{{ title }} {{ message }}</div>' } } } });
const latest = wrapper => wrapper.emitted('review-state').at(-1)[0];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(url => Promise.resolve(url.endsWith('/raw-audit') ? audit([]) : { data: { missedAppointmentsPaidInFull: [] } }));
  api.patch.mockResolvedValue({ data: { ok: true } });
});

it('counts only unreviewed drafts, excluding no-notes, reviewed decisions and previously paid sessions', () => {
  const state = rawReviewState({ rows: [draft(1), draft(2, { note_status: 'NO_NOTE' }), draft(3, { already_paid_in_baseline: 1 }), draft(4, { draft_reviewed: true, draft_payable: 0 })] });
  expect(state.pendingDraftCount).toBe(1);
  expect(state.ready).toBe(false);
  expect(rawReviewState({ rows: [draft(1, { note_status: 'NO_NOTE' })] })).toMatchObject({ pendingCount: 0, empty: true, ready: true, emptyTitle: 'No drafts to review' });
});

it('opens the requested import directly and saves an explicit payable decision before Continue is ready', async () => {
  api.get.mockImplementation(url => Promise.resolve(url.endsWith('/raw-audit') ? audit([draft(1)]) : { data: {} }));
  const wrapper = mountPanel({ initialImportId: 15 });
  await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/payroll/periods/11/raw-audit', { params: { importId: 15 } });
  expect(wrapper.find('.rip-header').exists()).toBe(false);
  expect(wrapper.find('.rip-tabs').exists()).toBe(false);
  expect(latest(wrapper)).toMatchObject({ ready: false, pendingCount: 1 });
  await wrapper.findAll('button').find(button => button.text() === 'Payable').trigger('click');
  await flushPromises();
  expect(api.patch).toHaveBeenCalledWith('/payroll/import-rows/1', { draftPayable: true, draftReviewed: true });
  expect(latest(wrapper)).toMatchObject({ ready: true, pendingCount: 0, emptyTitle: 'Draft review complete' });
  expect(wrapper.find('.test-empty').exists()).toBe(true);
  expect(wrapper.find('table').exists()).toBe(false);
  wrapper.unmount();
});

it('lets an explicit keep-unpaid decision resolve a draft without making it payable', async () => {
  api.get.mockImplementation(url => Promise.resolve(url.endsWith('/raw-audit') ? audit([draft(4, { draft_payable: 0 })]) : { data: {} }));
  const wrapper = mountPanel({ periodStatus: 'posted', catchUpMode: true });
  await flushPromises();
  await wrapper.findAll('button').find(button => button.text() === 'Keep unpaid').trigger('click');
  await flushPromises();
  expect(api.patch).toHaveBeenCalledWith('/payroll/import-rows/4?allowPostedDraftReview=true', { draftPayable: false, draftReviewed: true });
  expect(latest(wrapper)).toMatchObject({ ready: true, pendingCount: 0 });
  wrapper.unmount();
});

it('loads raw rows while showing missed fees so switching to processing works on the first action', async () => {
  api.get.mockImplementation(url => Promise.resolve(url.endsWith('/raw-audit') ? audit([draft(8, { service_code: 'H0031', requires_processing: 1 })]) : { data: { missedAppointmentsPaidInFull: [] } }));
  const wrapper = mountPanel({ initialMode: 'missed_appts_paid_in_full' });
  await flushPromises();
  expect(latest(wrapper)).toMatchObject({ empty: true, ready: true });
  await wrapper.setProps({ initialMode: 'process_h0031' });
  expect(wrapper.text()).toContain('Test Employee');
  expect(latest(wrapper)).toMatchObject({ mode: 'process_h0031', pendingCount: 1, ready: false });
  expect(api.get).toHaveBeenCalledTimes(2);
  await wrapper.findAll('button').find(button => button.text() === 'Mark done').trigger('click');
  await flushPromises();
  expect(latest(wrapper)).toMatchObject({ pendingCount: 0, ready: true });
  wrapper.unmount();
});

it('keeps global blockers when search hides their rows and brings the user back to pending work', async () => {
  api.get.mockImplementation(url => Promise.resolve(url.endsWith('/raw-audit') ? audit([draft(1)]) : { data: {} }));
  const wrapper = mountPanel();
  await flushPromises();
  await wrapper.get('input[type="text"]').setValue('not a matching person');
  expect(wrapper.find('[data-row-id="1"]').exists()).toBe(false);
  expect(latest(wrapper)).toMatchObject({ pendingCount: 1, ready: false });
  await wrapper.vm.focusPending();
  expect(wrapper.get('input[type="text"]').element.value).toBe('');
  expect(wrapper.find('[data-row-id="1"]').exists()).toBe(true);
  wrapper.unmount();
});

it('does not turn a load or save failure into an empty completed step', async () => {
  api.get.mockRejectedValueOnce(new Error('Import unavailable'));
  const wrapper = mountPanel();
  await flushPromises();
  expect(latest(wrapper)).toMatchObject({ ready: false, empty: false, error: 'Import unavailable' });
  expect(wrapper.find('[role="alert"]').text()).toContain('Import unavailable');
  expect(wrapper.find('.test-empty').exists()).toBe(false);
  api.get.mockImplementation(url => Promise.resolve(url.endsWith('/raw-audit') ? audit([draft(1)]) : { data: {} }));
  await wrapper.vm.refresh();
  api.patch.mockRejectedValueOnce(new Error('Decision not saved'));
  await wrapper.findAll('button').find(button => button.text() === 'Payable').trigger('click');
  await flushPromises();
  expect(latest(wrapper)).toMatchObject({ ready: false, pendingCount: 1, error: 'Decision not saved' });
  wrapper.unmount();
});

it('ignores a slow response from the previous pay period', async () => {
  let resolveOld;
  api.get.mockImplementation(url => {
    if (url === '/payroll/periods/11/raw-audit') return new Promise(resolve => { resolveOld = resolve; });
    if (url.endsWith('/raw-audit')) return Promise.resolve(audit([draft(2, { provider_name: 'New Period Employee' })], { selectedImportId: 16 }));
    return Promise.resolve({ data: {} });
  });
  const wrapper = mountPanel();
  await wrapper.setProps({ periodId: 12, initialImportId: 16 });
  await flushPromises();
  expect(wrapper.text()).toContain('New Period Employee');
  resolveOld(audit([draft(1, { provider_name: 'Old Period Employee' })]));
  await flushPromises();
  expect(wrapper.text()).not.toContain('Old Period Employee');
  expect(latest(wrapper)).toMatchObject({ periodId: 12, importId: 16, pendingCount: 1 });
  wrapper.unmount();
});

it('leaves original posted imports locked when catch-up review permission is absent', async () => {
  api.get.mockImplementation(url => Promise.resolve(url.endsWith('/raw-audit') ? audit([draft(1)], { imports: [{ id: 15 }] }) : { data: {} }));
  const wrapper = mountPanel({ periodStatus: 'posted', catchUpMode: true });
  await flushPromises();
  expect(wrapper.findAll('button').find(button => button.text() === 'Payable').attributes('disabled')).toBeDefined();
  expect(api.patch).not.toHaveBeenCalled();
  expect(latest(wrapper)).toMatchObject({ ready: false, empty: false, error: expect.stringContaining('locked') });
  wrapper.unmount();
});

it('lets an already posted payroll be viewed without demanding new decisions on its locked original import', async () => {
  api.get.mockImplementation(url => Promise.resolve(url.endsWith('/raw-audit') ? audit([draft(1)], { imports: [{ id: 15 }] }) : { data: {} }));
  const wrapper = mountPanel({ periodStatus: 'posted', catchUpMode: false });
  await flushPromises();
  expect(latest(wrapper)).toMatchObject({ ready: true, pendingCount: 0, empty: true, emptyTitle: 'Posted payroll is read-only' });
  expect(api.patch).not.toHaveBeenCalled();
  wrapper.unmount();
});
