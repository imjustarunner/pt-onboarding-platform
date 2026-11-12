// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defineComponent, h, watch } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Wizard from '../PayrollWizardView.vue';
const mock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), push: vi.fn(), replace: vi.fn(),
  route: { path: '/admin/payroll/wizard/12', params: { periodId: '12' }, query: {} },
  agency: { currentAgency: { id: 6, name: 'Test Agency' } }, rawStates: {}, processState: {}, claimsState: {}, previewState: {}, initialStep: 'upload_reports', savedFingerprint: null, progressOverride: {}, importErrors: [] }));
vi.mock('../../../services/api', () => ({ default: mock }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mock.agency }));
vi.mock('../../../store/organization', () => ({ useOrganizationStore: () => ({}) }));
vi.mock('../../../composables/useFundThredBranding', () => ({ useFundThredBranding: () => {} }));
vi.mock('vue-router', () => ({ useRoute: () => mock.route, useRouter: () => ({ push: mock.push, replace: mock.replace }) }));
const ready = { loading: false, error: '', ready: true, pendingCount: 0, empty: true, blockers: [] };
const Raw = defineComponent({ name: 'RawReviewStub', props: ['periodId', 'initialMode', 'initialImportId', 'catchUpMode', 'guided', 'embedded'], emits: ['readiness', 'changed'],
  setup(props, { emit, expose }) {
    expose({ focusPending: vi.fn() });
    watch(() => [props.periodId, props.initialMode], () => emit('readiness', { ...ready, ...mock.rawStates[`${props.periodId}:${props.initialMode}`], periodId: props.periodId, mode: props.initialMode }), { immediate: true });
    return () => h('div', { 'data-test': 'raw-review' }, `Raw data ${props.periodId} ${props.initialMode}`);
  } });
const Process = defineComponent({ name: 'CatchupReviewStub', props: ['destinationPeriodId'], emits: ['readiness', 'blocked', 'applied'],
  setup(_props, { emit, expose }) { expose({ focusPending: vi.fn(), refresh: vi.fn() }); emit('readiness', { ...ready, ...mock.processState }); return () => h('div', { 'data-test': 'catchup-review' }, 'Catch-up data'); } });
const Claims = defineComponent({ name: 'ClaimsReviewStub', emits: ['readiness', 'changed'], setup(_props, { emit, expose }) { expose({ focusPending: vi.fn() }); emit('readiness', { ...ready, ...mock.claimsState }); return () => h('div', { 'data-test': 'claims-review' }, 'Claim data'); } });
const Preview = defineComponent({ name: 'PreviewReviewStub', props: ['initialUserId'], emits: ['readiness', 'changed'], setup(_props, { emit, expose }) { expose({ focusPending: vi.fn() }); emit('readiness', { ...ready, ...mock.previewState }); return () => h('div', { 'data-test': 'preview-review' }, 'Preview data'); } });
let period, summaries, wrappers, imports;
const stepKeys = ['upload_reports', 'draft_audit_prior', 'draft_audit_two_ago', 'batch_catchup', 'drafts', 'missed_appts', 'h0031', 'h0032', 'h2014', '90853', 'h2032', 'claims', 'stage', 'run', 'preview', 'post'];
const completedBefore = key => Object.fromEntries(stepKeys.slice(0, stepKeys.indexOf(key)).map(step => [step, true]));
const importFingerprint = () => JSON.stringify([12, ...[[12, 1], [11, 2], [10, 3]].map(([periodId, slot]) => {
  const imported = imports[periodId]?.find(row => row.slot_number === slot);
  return imported ? [imported.id, imported.created_at, imported.row_count, imported.row_revision] : null;
})]);
const periods = () => [period, { id: 11, period_start: '2026-10-10', period_end: '2026-10-23', status: 'posted', schedule_aligned: 1 }, { id: 10, period_start: '2026-09-26', period_end: '2026-10-09', status: 'posted', schedule_aligned: 1 }];
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); wrappers = [];
  mock.initialStep = 'upload_reports'; mock.rawStates = {}; mock.processState = {}; mock.claimsState = {}; mock.previewState = {}; mock.savedFingerprint = null; mock.progressOverride = {}; mock.importErrors = [];
  mock.route.query = {}; period = { id: 12, period_start: '2026-10-24', period_end: '2026-11-06', status: 'staged', schedule_aligned: 1 }; summaries = [];
  imports = { 12: [{ id: 103, slot_number: 1, row_count: 10, row_revision: 1040, created_at: '2026-11-11 19:56:48' }], 11: [{ id: 101, slot_number: 1 }, { id: 102, slot_number: 2, row_count: 9, row_revision: 1050, created_at: '2026-11-11 19:56:49' }], 10: [{ id: 98, slot_number: 2 }, { id: 99, slot_number: 3, row_count: 8, row_revision: 1060, created_at: '2026-11-11 19:56:50' }] };
  mock.push.mockResolvedValue(); mock.replace.mockResolvedValue();
  mock.put.mockImplementation(async (_url, body) => ({ data: { state: body.state } }));
  mock.get.mockImplementation(async url => {
    if (url === '/payroll/periods') return { data: periods() };
    if (url === '/payroll/periods/12') return { data: { period: { ...period }, summaries } };
    if (url.endsWith('/wizard-progress')) return { data: { state: { stepKey: mock.initialStep, flowVersion: 2, flowFingerprint: mock.savedFingerprint || importFingerprint(), completed: completedBefore(mock.initialStep), ...mock.progressOverride } } };
    if (url.endsWith('/imports')) {
      const sourceId = Number(url.match(/periods\/(\d+)/)[1]);
      if (mock.importErrors.includes(sourceId)) throw new Error('Prior imports unavailable');
      return { data: { imports: imports[sourceId] || [] } };
    }
    if (url.endsWith('/todos')) return { data: { todos: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  mock.post.mockImplementation(async url => {
    if (url.endsWith('/compliance-unlock-check')) return { data: { unlocked: false } };
    if (url.endsWith('/run')) { period.status = 'ran'; summaries = [{ user_id: 7, total_amount: 108, total_hours: 3 }]; }
    if (url.endsWith('/post')) period.status = 'posted';
    return { data: {} };
  });
});
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
async function page(step = 'upload_reports') {
  mock.initialStep = step;
  const wrapper = mount(Wizard, { global: { stubs: { FundThredPayrollBrand: true, PayrollRawImportPanel: Raw, PayrollProcessChangesPanel: Process,
    PayrollClaimsPanel: Claims, PayrollPreviewPostPanel: Preview, PayrollStagePanel: true, PayrollTodosPanel: true, PayrollCompliancePanel: true, PayrollSupervisionConflicts: true } } });
  wrappers.push(wrapper); await flushPromises(); return wrapper;
}
const nextButton = wrapper => wrapper.get('.pw-continue');
async function next(wrapper) { await nextButton(wrapper).trigger('click'); await flushPromises(); }
const action = (wrapper, label) => wrapper.findAll('.pw-actions-stack button').find(button => button.text() === label);
it('opens each prior review and comparison directly with a single Continue and no duplicated done or skip actions', async () => {
  const wrapper = await page(); await next(wrapper);
  expect(wrapper.findComponent(Raw).props()).toMatchObject({ periodId: 11, initialImportId: 102, initialMode: 'draft_audit', embedded: true });
  expect(wrapper.text()).not.toContain('Mark done'); expect(wrapper.text()).not.toContain('Skip this step');
  await next(wrapper); expect(wrapper.findComponent(Raw).props()).toMatchObject({ periodId: 10, initialImportId: 99 });
  await next(wrapper); expect(wrapper.findComponent(Process).exists()).toBe(true); expect(wrapper.text()).not.toContain('Review changes & add late notes');
  expect(mock.push).not.toHaveBeenCalled();
});
it('advances inside current Raw Import from drafts to missed fees and H0031 without closing the data view', async () => {
  const wrapper = await page('drafts'); expect(wrapper.findComponent(Raw).props('initialMode')).toBe('draft_audit');
  await next(wrapper); expect(wrapper.findComponent(Raw).props()).toMatchObject({ periodId: 12, initialMode: 'missed_appts_paid_in_full' });
  await next(wrapper); expect(wrapper.findComponent(Raw).props()).toMatchObject({ periodId: 12, initialMode: 'process_h0031' });
  expect(mock.push).not.toHaveBeenCalled();
});
it('blocks Continue and phase shortcuts while a current review still needs work, then advances after its data becomes ready', async () => {
  mock.rawStates['12:draft_audit'] = { ready: false, empty: false, pendingCount: 2, blockers: [{ message: 'Decide whether these drafts are payable.' }] };
  const wrapper = await page('drafts'); expect(nextButton(wrapper).element.disabled).toBe(true);
  await wrapper.findAll('.pw-phase').at(-1).trigger('click'); await flushPromises();
  expect(wrapper.findComponent(Raw).props('initialMode')).toBe('draft_audit');
  expect(wrapper.text()).toContain('Decide whether these drafts are payable.');
  wrapper.findComponent(Raw).vm.$emit('readiness', { ...ready, periodId: 12, mode: 'draft_audit' }); await flushPromises();
  expect(nextButton(wrapper).element.disabled).toBe(false); await next(wrapper);
  expect(wrapper.findComponent(Raw).props('initialMode')).toBe('missed_appts_paid_in_full');
});
it('treats an unloaded or failed review as blocked and a loaded empty review as ready', async () => {
  mock.rawStates['12:process_h0031'] = { loading: true, ready: false };
  const wrapper = await page('h0031'); expect(nextButton(wrapper).element.disabled).toBe(true);
  wrapper.findComponent(Raw).vm.$emit('readiness', { ...ready, periodId: 12, mode: 'process_h0031', error: 'Could not check H0031.', ready: false }); await flushPromises();
  expect(nextButton(wrapper).element.disabled).toBe(true); expect(wrapper.text()).toContain('Could not check H0031.');
  wrapper.findComponent(Raw).vm.$emit('readiness', { ...ready, periodId: 12, mode: 'process_h0031' }); await flushPromises();
  await next(wrapper); expect(wrapper.findComponent(Raw).props('initialMode')).toBe('process_h0032');
});
it('does not let a phase shortcut skip reviews that have not yet passed', async () => {
  const wrapper = await page('draft_audit_prior');
  await wrapper.findAll('.pw-phase').at(-1).trigger('click'); await flushPromises();
  expect(wrapper.findComponent(Raw).props('periodId')).toBe(10);
  expect(wrapper.get('.pw-step-title').text()).toContain('Run 3');
});
it('skips optional absent catch-up reports through a clear empty state', async () => {
  imports[11] = [{ id: 101, slot_number: 1 }];
  const wrapper = await page('draft_audit_prior');
  expect(wrapper.text()).toContain('No catch-up report to review'); expect(wrapper.findComponent(Raw).exists()).toBe(false);
  expect(nextButton(wrapper).element.disabled).toBe(false); await next(wrapper); expect(wrapper.findComponent(Raw).props('periodId')).toBe(10);
});
it('blocks comparison until payable late notes have been added and routes a processing dependency back into the wizard', async () => {
  mock.processState = { ready: false, pendingCount: 1, blockers: [{ message: 'Add the October 21 late note.' }] };
  const wrapper = await page('batch_catchup'); expect(nextButton(wrapper).element.disabled).toBe(true);
  wrapper.findComponent(Process).vm.$emit('blocked', { message: 'Process H2014 first.', targetMode: 'H2014', sourcePeriodId: 12 }); await flushPromises();
  expect(wrapper.findComponent(Raw).props('initialMode')).toBe('process_h2014');
  await next(wrapper); expect(wrapper.findComponent(Process).exists()).toBe(true);
  expect(nextButton(wrapper).element.disabled).toBe(true);
});
it('opens claims directly and blocks unresolved claims without any Mark done bypass', async () => {
  mock.claimsState = { ready: false, pendingCount: 1, blockers: [{ message: 'Approve or defer this claim.' }] };
  const wrapper = await page('claims'); expect(wrapper.findComponent(Claims).exists()).toBe(true);
  expect(wrapper.text()).not.toContain('Mark done'); expect(nextButton(wrapper).element.disabled).toBe(true);
  wrapper.findComponent(Claims).vm.$emit('readiness', { ...ready }); await flushPromises(); await next(wrapper);
  expect(wrapper.findComponent({ name: 'PayrollStagePanel' }).exists()).toBe(true);
});
it('requires calculated results before preview and allows a single Continue after a successful run', async () => {
  const wrapper = await page('preview'); expect(wrapper.get('.pw-step-title').text()).toBe('Run Payroll'); expect(nextButton(wrapper).element.disabled).toBe(true);
  expect(wrapper.text()).not.toContain('Already ran'); expect(wrapper.findComponent(Preview).exists()).toBe(false);
  await action(wrapper, 'Run Payroll').trigger('click'); await flushPromises();
  expect(nextButton(wrapper).element.disabled).toBe(false); await next(wrapper);
  expect(wrapper.findComponent(Preview).exists()).toBe(true); await next(wrapper);
  expect(wrapper.get('.pw-step-title').text()).toBe('Post Payroll');
});
it('shows Post until the server confirms posting, then shows Posted and enables Finish exactly once', async () => {
  period.status = 'ran'; summaries = [{ user_id: 7, total_amount: 108, total_hours: 3 }];
  const wrapper = await page('post'); expect(nextButton(wrapper).text()).toBe('Finish'); expect(nextButton(wrapper).element.disabled).toBe(true);
  expect(action(wrapper, 'Post Payroll')).toBeDefined(); expect(wrapper.text()).not.toContain('Already posted');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await action(wrapper, 'Post Payroll').trigger('click'); await flushPromises();
  expect(action(wrapper, 'Post Payroll')).toBeUndefined(); expect(wrapper.text()).toContain('Posted — payroll is visible to providers.');
  expect(nextButton(wrapper).element.disabled).toBe(false); await next(wrapper); expect(mock.push).toHaveBeenCalledTimes(1);
});

it('does not resume stale completed progress at Post after a report replacement with the same import ID and row count', async () => {
  period.status = 'ran'; summaries = [{ user_id: 7, total_amount: 108, total_hours: 3 }];
  mock.savedFingerprint = importFingerprint();
  imports[12][0].row_revision += 100;
  const wrapper = await page('post');
  expect(wrapper.get('.pw-step-title').text()).not.toBe('Post Payroll');
  expect(action(wrapper, 'Post Payroll')).toBeUndefined();
  expect(mock.put.mock.calls.at(-1)[1].state.completed?.post).not.toBe(true);
});
it('rejects legacy progress without verified current-report prerequisites instead of resuming Post', async () => {
  period.status = 'ran'; summaries = [{ user_id: 7, total_amount: 108, total_hours: 3 }];
  mock.progressOverride = { flowVersion: 1, completed: { post: true } };
  const wrapper = await page('post');
  expect(wrapper.get('.pw-step-title').text()).not.toBe('Post Payroll');
  expect(action(wrapper, 'Post Payroll')).toBeUndefined();
});
it('never treats a failed prior-import fetch as an optional empty review', async () => {
  mock.importErrors = [11];
  const wrapper = await page('draft_audit_prior');
  expect(wrapper.text()).not.toContain('No catch-up report to review');
  expect(wrapper.text()).toMatch(/Prior imports unavailable|could not check|could not load|failed to load/i);
  expect(nextButton(wrapper).element.disabled).toBe(true);
  await wrapper.findAll('.pw-phase').at(-1).trigger('click'); await flushPromises();
  expect(action(wrapper, 'Post Payroll')).toBeUndefined();
  mock.importErrors = [];
  const retry = wrapper.findAll('button').find(button => button.text() === 'Show what needs attention');
  expect(retry).toBeDefined();
  await retry.trigger('click'); await flushPromises();
  expect(nextButton(wrapper).element.disabled).toBe(false);
});
it('does not post through same-fingerprint saved progress when required reviews were never completed', async () => {
  period.status = 'ran'; summaries = [{ user_id: 7, total_amount: 108, total_hours: 3 }];
  mock.progressOverride = { completed: { upload_reports: true, post: true } };
  const wrapper = await page('post');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const post = action(wrapper, 'Post Payroll');
  if (post) { await post.trigger('click'); await flushPromises(); }
  expect(mock.post.mock.calls.filter(([url]) => url.endsWith('/post'))).toHaveLength(0);
  expect(post.element.disabled).toBe(true);
  const show = wrapper.findAll('button').find(button => button.text() === 'Show what needs attention');
  expect(show).toBeDefined();
  await show.trigger('click'); await flushPromises();
  expect(wrapper.get('.pw-step-title').text()).toContain('Run 2');
});

it('invalidates downstream reviews after a raw edit while preserving completed earlier reviews', async () => {
  period.status = 'ran'; summaries = [{ user_id: 7, total_amount: 108, total_hours: 3 }];
  mock.progressOverride = { completed: completedBefore('post') };
  const wrapper = await page('drafts');
  period.status = 'staged'; summaries = []; imports[12][0].row_revision += 1;
  wrapper.findComponent(Raw).vm.$emit('changed'); await flushPromises();
  await wrapper.findAll('.pw-phase').at(-1).trigger('click'); await flushPromises();
  expect(wrapper.findComponent(Raw).props('initialMode')).toBe('missed_appts_paid_in_full');
  const saved = mock.put.mock.calls.at(-1)[1].state;
  expect(saved.completed).toMatchObject({ draft_audit_prior: true, draft_audit_two_ago: true, batch_catchup: true });
  expect(saved.completed.run).not.toBe(true); expect(saved.completed.preview).not.toBe(true);
  expect(saved.flowFingerprint).toBe(importFingerprint());
});
it('reloads the actual staged status after a claim edit and requires recalculation before preview', async () => {
  period.status = 'ran'; summaries = [{ user_id: 7, total_amount: 108, total_hours: 3 }];
  mock.progressOverride = { completed: completedBefore('post') };
  const wrapper = await page('claims');
  period.status = 'staged'; summaries = [];
  wrapper.findComponent(Claims).vm.$emit('changed'); await flushPromises();
  await next(wrapper); await next(wrapper);
  expect(wrapper.get('.pw-step-title').text()).toBe('Run Payroll');
  expect(nextButton(wrapper).element.disabled).toBe(true);
  expect(action(wrapper, 'Run Payroll')).toBeDefined();
  expect(wrapper.findComponent(Preview).exists()).toBe(false);
});

it('keeps nested code processing mounted and adopts confirmed row edits without refetching the period or imports',async()=>{
 mock.processState={ready:false,pendingCount:1};const w=await page('batch_catchup');w.findComponent(Process).vm.$emit('blocked',{message:'Process H0031.',targetMode:'H0031',sourcePeriodId:12});await flushPromises();const raw=w.findComponent(Raw),element=raw.element,reads=mock.get.mock.calls.length;
 raw.vm.$emit('changed',{periodId:12,kind:'minutes',saved:{period:{...period,status:'staged'},row:{id:4,unit_count:23},payrollInvalidated:true,import:{id:imports[12][0].id,row_revision:'changed:1',row_count:10,mutationSequence:99}}});await flushPromises();expect(mock.get).toHaveBeenCalledTimes(reads);expect(w.findComponent(Raw).element).toBe(element);expect(w.findComponent(Raw).props('initialMode')).toBe('process_h0031');
 const saves=mock.put.mock.calls.filter(([url])=>url.endsWith('/wizard-progress'));expect(saves.at(-1)[1].state.flowFingerprint).toContain('changed:1');
 raw.vm.$emit('changed',{periodId:12,kind:'minutes',saved:{period:{...period,status:'staged'},import:{id:imports[12][0].id,row_revision:'older:1',mutationSequence:98}}});await flushPromises();expect(mock.put.mock.calls.filter(([url])=>url.endsWith('/wizard-progress')).at(-1)[1].state.flowFingerprint).toContain('changed:1');w.unmount();
});

it('keeps green completed phases and lets payroll jump back to Run after revisiting a completed audit',async()=>{
 const w=await page('run');const done=()=>w.findAll('.pw-phase.done').length;
 expect(done()).toBe(4);await w.findAll('.pw-phase')[2].trigger('click');await flushPromises();expect(w.get('.pw-step-title').text()).toContain('Draft Audit');expect(done()).toBe(4);
 await w.findAll('.pw-phase').at(-1).trigger('click');await flushPromises();expect(w.get('.pw-step-title').text()).toBe('Run Payroll');expect(done()).toBe(4);
});
