// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Panel from '../PayrollProcessChangesPanel.vue';
import { appliedCatchupKeys, catchupIsPayableAddition, pairCatchupCorrections } from '../../../utils/payrollCatchupReview';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
const change = (patch = {}) => ({ rowMatchKey: 'late-a', changeType: 'status_change', user_id: 7,
  provider_name: 'Test Provider', patient_first_name: 'Example', service_date: '2026-10-21',
  from_service_code: 'H0004', to_service_code: 'H0004', from_status: 'NO_NOTE', to_status: 'DRAFT_PAID',
  from_units: 4, to_units: 4, ...patch });
const noNote = { user_id: 7, provider_name: 'Test Provider', patient_first_name: 'Incomplete',
  service_code: 'H0004', service_date: '2026-10-18', normalized_status: 'NO_NOTE', unit_count: 4 };
const props = { agencyId: 6, destinationPeriodId: 12, priorPeriodId: 11, embedded: true };
let changes, staging, baseline, compare;
const readiness = wrapper => wrapper.emitted('readiness').at(-1)[0];
const button = (wrapper, label) => wrapper.findAll('button').find(node => node.text() === label);
beforeEach(() => {
  vi.clearAllMocks(); changes = [change()]; staging = { matched: [], manualPayLines: [] }; baseline = []; compare = [];
  api.get.mockImplementation(async (url, options) => {
    if (url.endsWith('/staging')) return { data: staging };
    if (url.endsWith('/imports')) return { data: { imports: [{ id: 101, slot_number: 1 }, { id: 102, slot_number: 2 }] } };
    if (url.endsWith('/raw-audit')) {
      const original = options.params.importId === 101;
      return { data: { changes: original ? [] : changes, rows: original ? baseline : compare } };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  api.post.mockImplementation(async (_url, body) => {
    staging = { matched: body.rows.filter(row => row.actionType === 'add').map(row => ({ userId: row.userId, serviceCode: row.serviceCode, carryover: { carryoverMeta: row.carryoverMeta } })), manualPayLines: [] };
    return { data: { carryoverAppliedCount: body.rows.length } };
  });
});
it('keeps incomplete notes informational with no action to add or pay them', async () => {
  changes = []; baseline = [noNote]; compare = [noNote];
  const wrapper = mount(Panel, { props }); await flushPromises();
  expect(wrapper.text()).toContain('Still incomplete — not payable');
  expect(wrapper.text()).toContain('These remain unpaid');
  expect(button(wrapper, 'Add no-note to current period')).toBeUndefined();
  expect(api.put).not.toHaveBeenCalled(); expect(readiness(wrapper)).toMatchObject({ ready: true, pendingCount: 0 });
  wrapper.unmount();
});
it('blocks continuation for unadded payable notes even when deselected or hidden by search', async () => {
  const wrapper = mount(Panel, { props }); await flushPromises();
  expect(readiness(wrapper)).toMatchObject({ ready: false, pendingCount: 1 });
  await button(wrapper, 'Select none').trigger('click');
  await wrapper.get('input[type=text]').setValue('Hidden result');
  expect(readiness(wrapper)).toMatchObject({ ready: false, pendingCount: 1 });
  expect(readiness(wrapper).blockers[0].message).toContain('Test Provider');
  await wrapper.vm.focusPending(); expect(wrapper.get('input[type=text]').element.value).toBe(''); wrapper.unmount();
});
it('verifies saved additions, shows their payroll status beside the unchanged source draft, and prevents a repeat add', async () => {
  const wrapper = mount(Panel, { props }); await flushPromises();
  await button(wrapper, 'Add selected to current period').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Added to current payroll'); expect(wrapper.text()).toContain('NO_NOTE → DRAFT_PAID');
  expect(wrapper.get('input[type=checkbox]').element.disabled).toBe(true);
  expect(readiness(wrapper)).toMatchObject({ ready: true, pendingCount: 0, addedCount: 1 });
  expect(button(wrapper, 'Add selected to current period').element.disabled).toBe(true);
  await button(wrapper, 'Select all').trigger('click'); expect(button(wrapper, 'Add selected to current period').element.disabled).toBe(true);
  expect(api.post).toHaveBeenCalledTimes(1); wrapper.unmount();
});
it('restores added status from saved staging data on a fresh visit', async () => {
  staging = { matched: [{ userId: 7, serviceCode: 'H0004', carryover: { carryoverMeta: { rawAuditRows: [{ rowMatchKey: 'late-a' }] } } }] };
  const wrapper = mount(Panel, { props }); await flushPromises();
  expect(wrapper.text()).toContain('Added to current payroll');
  expect(readiness(wrapper)).toMatchObject({ ready: true, pendingCount: 0, addedCount: 1 }); wrapper.unmount();
});
it('does not claim success when the saved addition cannot be verified', async () => {
  api.post.mockResolvedValue({ data: { carryoverAppliedCount: 1 } });
  const wrapper = mount(Panel, { props }); await flushPromises();
  await button(wrapper, 'Add selected to current period').trigger('click'); await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toContain('could not be verified');
  expect(wrapper.emitted('applied')).toBeUndefined(); expect(readiness(wrapper).ready).toBe(false); wrapper.unmount();
});
it('routes a processing blocker without asking to bypass the processing gate', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'Process the H2014 minutes first.' }, pendingProcessing: { count: 1, sample: [{ service_code: 'H2014' }] } } } });
  const wrapper = mount(Panel, { props }); await flushPromises();
  await button(wrapper, 'Add selected to current period').trigger('click'); await flushPromises();
  expect(wrapper.emitted('blocked')[0][0]).toMatchObject({ targetMode: 'H2014', sourcePeriodId: 12 });
  expect(confirm).not.toHaveBeenCalled(); expect(api.post).toHaveBeenCalledTimes(1); expect(readiness(wrapper).ready).toBe(false);
  wrapper.unmount(); confirm.mockRestore();
});
it('fails closed when comparison data cannot be loaded', async () => {
  api.get.mockRejectedValue(new Error('Comparison unavailable'));
  const wrapper = mount(Panel, { props }); await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toContain('Comparison unavailable');
  expect(readiness(wrapper)).toMatchObject({ ready: false, empty: false }); wrapper.unmount();
});
it('does not select location reviews or reductions with Select all', async () => {
  changes = [change(), change({ rowMatchKey: 'location', changeType: 'location_changed', from_status: 'DRAFT_PAID' }), change({ rowMatchKey: 'removed', changeType: 'overpaid_deleted', from_status: 'DRAFT_PAID', to_status: null, to_units: 0 })];
  const wrapper = mount(Panel, { props }); await flushPromises();
  await button(wrapper, 'Select none').trigger('click'); await button(wrapper, 'Select all').trigger('click');
  expect(wrapper.findAll('input[type=checkbox]').map(node => node.element.checked)).toEqual([true, false, false]);
  expect(readiness(wrapper).pendingCount).toBe(1); wrapper.unmount();
});
it('pairs a uniquely recoded paid session as a correction rather than a payable addition', () => {
  const rows = pairCatchupCorrections([change({ rowMatchKey: 'old', changeType: 'overpaid_deleted', from_service_code: 'H2014', from_status: 'DRAFT_PAID', to_status: null, to_units: 0 }), change({ rowMatchKey: 'new', changeType: 'added', from_service_code: null, from_status: null, to_status: 'FINALIZED' })]);
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ changeType: 'service_code_changed', from_service_code: 'H2014', to_service_code: 'H0004' });
  expect(catchupIsPayableAddition(rows[0])).toBe(false);
});
it('leaves ambiguous paid corrections for review instead of automatically paying the additions', () => {
  const rows = pairCatchupCorrections([change({ rowMatchKey: 'old', changeType: 'overpaid_deleted', from_status: 'DRAFT_PAID', to_status: null }), change({ rowMatchKey: 'new-a', changeType: 'added', from_status: null }), change({ rowMatchKey: 'new-b', changeType: 'added', from_status: null })]);
  expect(rows.filter(catchupIsPayableAddition)).toHaveLength(0);
});
it('reads only row-level persisted additions, not aggregate units as proof of an added session', () => {
  expect(appliedCatchupKeys({ matched: [{ userId: 7, serviceCode: 'H0004', carryover: { oldDoneNotesUnits: 4 } }] }).size).toBe(0);
});
