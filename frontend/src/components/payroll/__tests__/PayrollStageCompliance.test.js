// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Stage from '../PayrollStagePanel.vue';
import Compliance from '../PayrollCompliancePanel.vue';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../../services/api.js', () => ({ default: api }));
vi.mock('../AnnualMileagePanel.vue', () => ({ default: { template: '<div />' } }));

const employee = (id, changes = {}) => ({
  id, agency_id: 6, agency_is_active: 1, role: 'provider', status: 'ACTIVE_EMPLOYEE',
  is_active: 1, is_archived: 0, first_name: `Employee${id}`, last_name: 'Test', ...changes
});
const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text() === label);
beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  api.get.mockResolvedValue({ data: [] });
});

it('limits both stage selectors to active employees of the selected agency while retaining saved former employee lines', async () => {
  const people = [employee(1), employee(2, { agency_id: 2 }), employee(3, { agency_is_active: 0 }),
    employee(4, { status: 'ONBOARDING' }), employee(5, { status: 'ACTIVE' }), employee(6, { is_archived: 1 }),
    employee(7, { is_active: 0 }), employee(8, { role: 'client_guardian' }), employee(9, { is_assistant_account: 1 }),
    employee(10, { is_demo: 1 }), employee(11, { created_via_dev_fill: 1 })];
  api.get.mockImplementation(async url => ({ data: url === '/payroll/agency-users' ? people
    : url.endsWith('/manual-pay-lines') ? [{ id: 1, user_id: 7, first_name: 'Former', last_name: 'Employee', label: 'Saved correction', amount: 50 }]
      : [] }));
  const wrapper = mount(Stage, { props: { agencyId: 6, periodId: 912 } });
  await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/payroll/agency-users', { params: { agencyId: 6, activeEmployeesOnly: true } });
  expect(wrapper.findAll('select')[1].findAll('option').map(option => option.text())).toEqual(['Select…', 'Test, Employee1']);
  expect(wrapper.text()).toContain('Employee, Former');
  expect(wrapper.text()).toContain('Saved correction');
  await button(wrapper, 'Provider Adjustments').trigger('click');
  await wrapper.get('.psp-combo-trigger').trigger('click');
  expect(wrapper.findAll('.psp-combo-option').map(option => option.text())).toEqual(['Employee1 Test']);
  expect(wrapper.text()).not.toContain('Inactive / Archived');
  wrapper.unmount();
});

it('discards a roster response from the previously selected agency', async () => {
  let resolveOld;
  api.get.mockImplementation((url, options) => {
    if (url === '/payroll/agency-users' && options.params.agencyId === 6) return new Promise(resolve => { resolveOld = resolve; });
    return Promise.resolve({ data: url === '/payroll/agency-users' ? [employee(2, { agency_id: 2 })] : [] });
  });
  const wrapper = mount(Stage, { props: { agencyId: 6, periodId: 912 } });
  await wrapper.setProps({ agencyId: 2, periodId: 913 });
  await flushPromises();
  resolveOld({ data: [employee(1)] });
  await flushPromises();
  expect(wrapper.findAll('select')[1].findAll('option').map(option => option.text())).toEqual(['Select…', 'Test, Employee2']);
  wrapper.unmount();
});

it('rejects bulk attendees who are not active employees of this agency before submitting pay', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/payroll/agency-users' ? [employee(1)] : [] }));
  const wrapper = mount(Stage, { props: { agencyId: 6, periodId: 912 } });
  await flushPromises();
  await button(wrapper, 'Manual Bulk').trigger('click');
  await wrapper.get('textarea').setValue('Otheragency, Person');
  await wrapper.get('input[type=number]').setValue('60');
  await button(wrapper, 'Submit Manual Bulk').trigger('click');
  expect(wrapper.text()).toContain('Choose an active employee of this agency');
  expect(api.post).not.toHaveBeenCalled();
  wrapper.unmount();
});

it('deselects all reminders for one provider, including hidden categories, without muting clients or changing others', async () => {
  const providers = [
    { userId: 1, name: 'One Provider', lateNotesByPeriod: [{ payrollPeriodId: 912, periodLabel: 'Current period', rows: [{ id: 11, label: 'Unfinished note' }] }],
      sessionLimits: [{ id: 'limit1', providerUserId: 1, clientId: 21, clientLabel: 'Client A', total: 30, threshold: 25 }] },
    { userId: 2, name: 'Another Provider', lateNotesByPeriod: [{ payrollPeriodId: 912, periodLabel: 'Current period', rows: [{ id: 12, label: 'Another note' }] }], sessionLimits: [] }
  ];
  api.get.mockResolvedValue({ data: { unlocked: true, providers } });
  const wrapper = mount(Compliance, { props: { agencyId: 6, periodId: 912, exclusionsByUser: { 1: { excludedRowIds: [99], excludedClientKeys: ['old-client'] } } } });
  await flushPromises();
  await button(wrapper, 'Late notes').trigger('click');
  await wrapper.get('[aria-label="Deselect all reminders for One Provider"]').trigger('click');
  const exclusions = wrapper.emitted('update:exclusionsByUser').at(-1)[0];
  expect(exclusions).toEqual({ 1: { excludedRowIds: [99, 11], excludedClientKeys: ['old-client', '1:21'] } });
  await wrapper.setProps({ exclusionsByUser: exclusions });
  await button(wrapper, 'All compliance').trigger('click');
  expect(wrapper.findAll('input[type=checkbox]').map(input => input.element.checked)).toEqual([false, false, true]);
  expect(wrapper.get('[aria-label="Deselect all reminders for One Provider"]').attributes('disabled')).toBeDefined();
  expect(api.put).not.toHaveBeenCalled();
  expect(api.post.mock.calls.map(([url]) => url)).toEqual(['/payroll/periods/912/compliance-unlock-check']);
  wrapper.unmount();
});

it('shows Sent email after confirmed delivery, disables a second send and retains the status after reload',async()=>{
 const provider={userId:1,name:'Test Provider',lateNotesByPeriod:[{rows:[{id:11,label:'Outstanding note'}]}],sessionLimits:[],emailDelivery:{status:'not_sent'}};
 api.get.mockImplementation(async()=>({data:{unlocked:true,providers:[structuredClone(provider)]}}));api.post.mockImplementation(async url=>url.endsWith('/compliance-send')?{data:{delivery:{status:'sent',sentAt:'2026-11-12'}}}:{data:{unlocked:true}});
 const w=mount(Compliance,{props:{agencyId:6,periodId:912}});await flushPromises();await button(w,'Send email').trigger('click');await flushPromises();expect(button(w,'Sent email').element.disabled).toBe(true);expect(api.post.mock.calls.filter(([url])=>url.endsWith('/compliance-send'))).toHaveLength(1);
 provider.emailDelivery={status:'sent'};await w.vm.reload();await flushPromises();expect(button(w,'Sent email').element.disabled).toBe(true);w.unmount();
});
it('labels pending approval honestly and does not offer another send',async()=>{
 api.get.mockResolvedValue({data:{unlocked:true,providers:[{userId:1,name:'Test Provider',lateNotesByPeriod:[{rows:[{id:11,label:'Note'}]}],sessionLimits:[],emailDelivery:{status:'pending_approval'}}]}});
 const w=mount(Compliance,{props:{agencyId:6,periodId:912}});await flushPromises();expect(button(w,'Awaiting approval').element.disabled).toBe(true);expect(w.findAll('button').some(b=>b.text()==='Sent email')).toBe(false);w.unmount();
});
