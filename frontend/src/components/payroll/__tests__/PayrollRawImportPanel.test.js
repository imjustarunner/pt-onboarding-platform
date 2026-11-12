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
  expect(api.get).toHaveBeenCalledWith('/payroll/periods/11/raw-audit', { skipGlobalLoading:true, params: { importId: 15 } });
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
it('selects matching drafts, lets payroll exclude an exception, and saves opposite decisions in separate batches', async()=>{
 api.get.mockImplementation(url=>Promise.resolve(url.endsWith('/raw-audit')?audit([draft(1),draft(2),draft(3)]):{data:{}}));
 const w=mountPanel();await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Select all matching drafts').trigger('click');
 await w.get('input[aria-label="Select draft 2 for Test Employee"]').setValue(false);
 await w.findAll('button').find(b=>b.text()==='Mark selected payable').trigger('click');await flushPromises();
 expect(api.patch.mock.calls.map(([url])=>url)).toEqual(['/payroll/import-rows/1','/payroll/import-rows/3']);
 expect(latest(w).pendingCount).toBe(1);
 await w.get('input[aria-label="Select draft 2 for Test Employee"]').setValue(true);
 await w.findAll('button').find(b=>b.text()==='Keep selected unpaid').trigger('click');await flushPromises();
 expect(api.patch).toHaveBeenLastCalledWith('/payroll/import-rows/2',{draftPayable:false,draftReviewed:true});expect(latest(w).ready).toBe(true);w.unmount();
});
it('selects only matching eligible drafts and preserves failed and unselected rows after a partial save',async()=>{
 api.get.mockImplementation(url=>Promise.resolve(url.endsWith('/raw-audit')?audit([draft(1),draft(2),draft(3,{provider_name:'Another Provider'}),draft(4,{already_paid_in_baseline:1})]):{data:{}}));
 const w=mountPanel();await flushPromises();await w.get('input[type=text]').setValue('Test Employee');
 await w.get('input[aria-label="Select all matching drafts"]').setValue(true);
 api.patch.mockResolvedValueOnce({data:{ok:true}}).mockRejectedValueOnce(new Error('Save failed'));
 await w.findAll('button').find(b=>b.text()==='Mark selected payable').trigger('click');await flushPromises();
 expect(api.patch).toHaveBeenCalledTimes(2);expect(w.get('[role=alert]').text()).toContain('1 of 2 decisions saved');expect(latest(w).pendingCount).toBe(2);expect(w.get('input[aria-label="Select draft 2 for Test Employee"]').element.checked).toBe(true);await w.findAll('button').find(b=>b.text()==='Mark selected payable').trigger('click');await flushPromises();expect(latest(w).pendingCount).toBe(1);w.unmount();
});
it('allows payroll to revisit saved catch-up decisions and keep a reviewed draft unpaid',async()=>{
 api.get.mockImplementation(url=>Promise.resolve(url.endsWith('/raw-audit')?audit([draft(1,{draft_reviewed:true,draft_payable:1})]):{data:{}}));
 const w=mountPanel();await flushPromises();await w.findAll('button').find(b=>b.text()==='Review saved draft decisions').trigger('click');
 await w.get('input[aria-label="Select all matching drafts"]').setValue(true);await w.findAll('button').find(b=>b.text()==='Keep selected unpaid').trigger('click');await flushPromises();
 expect(api.patch).toHaveBeenCalledWith('/payroll/import-rows/1',{draftPayable:false,draftReviewed:true});w.unmount();
});

const processRow=(id,provider,date,extra={})=>draft(id,{provider_name:provider,service_date:date,service_code:'H0031',requires_processing:1,unit_count:60,note_status:'FINALIZED',...extra});
it('groups providers and independently reverses dates without changing the provider order',async()=>{
 api.get.mockImplementation(url=>Promise.resolve(url.endsWith('/raw-audit')?audit([processRow(1,'Zoe','2026-10-30'),processRow(2,'Aaron','2026-11-05'),processRow(3,'Aaron','2026-10-28')]):{data:{}}));
 const w=mountPanel({initialMode:'process_h0031'});await flushPromises();const ids=()=>w.findAll('[data-row-id]').map(r=>r.attributes('data-row-id'));expect(ids()).toEqual(['2','3','1']);await w.findAll('button').find(b=>b.text()==='DOS ↓').trigger('click');expect(ids()).toEqual(['3','2','1']);await w.findAll('button').find(b=>b.text()==='Provider Name ↑').trigger('click');expect(ids()).toEqual(['1','3','2']);w.unmount();
});
it('keeps the table present during a slow row save and updates Done only after server acknowledgement',async()=>{
 api.get.mockImplementation(url=>Promise.resolve(url.endsWith('/raw-audit')?audit([processRow(1,'Employee','2026-11-05')]):{data:{}}));let finish;api.patch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));const w=mountPanel({initialMode:'process_h0031'});await flushPromises();const reads=api.get.mock.calls.length;await w.findAll('button').find(b=>b.text()==='Mark done').trigger('click');await flushPromises();expect(w.text()).toContain('Saving…');expect(w.find('[data-row-id="1"]').exists()).toBe(true);expect(latest(w).ready).toBe(false);expect(api.get).toHaveBeenCalledTimes(reads);
 expect(api.patch).toHaveBeenCalledWith('/payroll/import-rows/1',{processed:true,deferPayrollRecompute:true},{skipGlobalLoading:true});finish({data:{ok:true,row:{id:1,unit_count:60,processed_at:'2026-11-11T20:00:00Z'}}});await flushPromises();expect(w.text()).toContain('Marked done.');expect(latest(w).ready).toBe(true);expect(api.get).toHaveBeenCalledTimes(reads);w.unmount();
});
it('queues Done behind a pending minutes edit and avoids a duplicate unit save for an unchanged value',async()=>{
 api.get.mockImplementation(url=>Promise.resolve(url.endsWith('/raw-audit')?audit([processRow(1,'Employee','2026-11-05')]):{data:{}}));let finish;api.patch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({data:{ok:true}});const w=mountPanel({initialMode:'process_h0031',guided:false});await flushPromises();const input=w.get('input.rip-num');await input.setValue(23);await w.findAll('button').find(b=>b.text()==='Mark done').trigger('click');await flushPromises();expect(api.patch).toHaveBeenCalledTimes(1);expect(api.patch.mock.calls[0][1]).toMatchObject({unitCount:23});expect(w.get('input.rip-num').element.value).toBe('23');finish({data:{ok:true,row:{id:1,unit_count:23,processed_at:null}}});await flushPromises();expect(api.patch).toHaveBeenCalledTimes(2);expect(api.patch.mock.calls[1][1]).toMatchObject({processed:true});await w.get('input.rip-num').setValue(23);expect(api.patch).toHaveBeenCalledTimes(2);w.unmount();
});
it('keeps a failed units edit unresolved, cancels its queued Done, and allows a targeted retry',async()=>{
 api.get.mockImplementation(url=>Promise.resolve(url.endsWith('/raw-audit')?audit([processRow(1,'Employee','2026-11-05')]):{data:{}}));let fail;api.patch.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject}));const w=mountPanel({initialMode:'process_h0031'});await flushPromises();await w.get('input.rip-num').setValue(23);await w.findAll('button').find(b=>b.text()==='Mark done').trigger('click');fail(new Error('Minutes were not saved'));await flushPromises();expect(api.patch).toHaveBeenCalledTimes(1);expect(latest(w).ready).toBe(false);expect(w.text()).toContain('Not saved');api.patch.mockResolvedValue({data:{ok:true,row:{id:1,unit_count:23,processed_at:null}}});await w.findAll('button').find(b=>b.text()==='Retry save').trigger('click');await flushPromises();expect(api.patch.mock.calls[1][1]).toMatchObject({unitCount:23});expect(latest(w).pendingCount).toBe(1);w.unmount();
});


it('shows the same rounded whole-minute value that is submitted and saved',async()=>{
 api.get.mockImplementation(url=>Promise.resolve(url.endsWith('/raw-audit')?audit([processRow(1,'Employee','2026-11-05')]):{data:{}}));let finish;api.patch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));const w=mountPanel({initialMode:'process_h0031'});await flushPromises();await w.get('input.rip-num').setValue('23.6');await flushPromises();expect(api.patch.mock.calls[0][1]).toMatchObject({unitCount:24});expect(w.get('input.rip-num').element.value).toBe('24');finish({data:{ok:true,row:{id:1,unit_count:24}}});await flushPromises();expect(w.get('input.rip-num').element.value).toBe('24');w.unmount();
});
