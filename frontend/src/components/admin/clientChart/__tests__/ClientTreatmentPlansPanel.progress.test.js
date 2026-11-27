import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const state = vi.hoisted(() => ({ role: 'provider', get: vi.fn(), patch: vi.fn(), push:vi.fn(),agency:null }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('../../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1439, role: state.role } }) }));
vi.mock('../../../../store/agency', () => ({ useAgencyStore: () => state.agency }));
vi.mock('../../../../services/api', () => ({ default: { get: state.get, patch: state.patch } }));
vi.mock('../ClientChartAvatar.vue', () => ({ default: { template: '<span />' } }));
vi.mock('../TreatmentPlanAckPanel.vue', () => ({ default: { template: '<span />' } }));
import Panel from '../ClientTreatmentPlansPanel.vue';
beforeEach(() => {
  vi.clearAllMocks(); state.role = 'provider';state.agency={currentAgency:{id:450,slug:'demo'},userAgencies:[{id:450,slug:'demo'}]};
  const plan = { id: 51, status: 'active', title: 'Synthetic plan', created_by_user_id: 1439, goals: [{ id: 61, goal_index: 1, goal_text: 'Synthetic goal', status: 'active', objectives: [] }] };
  state.get.mockResolvedValue({ data: { plans: [plan], latestPlan: plan, events: [] } });
  state.patch.mockResolvedValue({ data: { changed: true, status: 'achieved', notifications: { sent: 1, needs_review: 1 } } });
});
it('requires an explicit progress save and reports transport acceptance separately from follow-up', async () => {
  const wrapper = mount(Panel, { props: { clientId: 2297, agencyId: 450, clientType: 'clinical' } }); await flushPromises();
  const select = wrapper.find('#goal-progress-61'); expect(select.exists()).toBe(true);
  await select.setValue('achieved'); expect(state.patch).not.toHaveBeenCalled();
  await wrapper.find('form.ctp-progress-controls').trigger('submit'); await flushPromises();
  expect(state.patch).toHaveBeenCalledWith('/medical-billing/treatment-plans/51/goals/61/progress', { agencyId: 450, clientId: 2297, status: 'achieved', expectedStatus: 'active' });
  expect(wrapper.text()).toContain('email(s) accepted for delivery'); expect(wrapper.text()).toContain('needs delivery follow-up'); expect(wrapper.text()).toContain('Achieved');
  await wrapper.find('form.ctp-progress-controls').trigger('submit'); await flushPromises(); expect(state.patch).toHaveBeenCalledOnce(); wrapper.unmount();
});
it('keeps clinical progress controls out of support and learning-plan views', async () => {
  for (const [role, clientType] of [['support', 'clinical'], ['provider', 'learning']]) {
    state.role = role; const wrapper = mount(Panel, { props: { clientId: 2297, agencyId: 450, clientType } }); await flushPromises();
    expect(wrapper.find('form.ctp-progress-controls').exists()).toBe(false); wrapper.unmount();
  }
});

it('opens the selected client plan in its own agency instead of a stale NLU selection',async()=>{
 state.agency={currentAgency:{id:453,slug:'nlu-qa-demo'},userAgencies:[{id:450,slug:'auricwell-qa-demo'},{id:453,slug:'nlu-qa-demo'}]};
 const w=mount(Panel,{props:{clientId:2449,agencyId:450,clientType:'clinical'}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Revise plan with Narriva').trigger('click');
 expect(state.push).toHaveBeenCalledWith(expect.objectContaining({path:'/auricwell-qa-demo/note-aid',query:expect.objectContaining({planId:'51',revision:'1'})}));w.unmount();
});

it('loads imported plan details for the chart summary and numbers legacy rows by their order', async () => {
 const row={id:51,status:'draft',source_tool_id:'client_records_import:legacy',goals:[
  {id:71,goal_index:1,goal_text:'First goal',objectives:[{id:81,objective_index:1,objective_text:'First objective',scale_current:6,scale_target:10}]},
  {id:72,goal_index:1,goal_text:'Second goal',objectives:[{id:82,objective_index:1,objective_text:'Second objective'}]}
 ]};
 state.get.mockResolvedValueOnce({data:{plans:[row],latestPlan:row}})
   .mockResolvedValueOnce({data:{plan:{...row,chartDraft:{revision:0},recordsImportSource:{parsed:{diagnoses:[{icd10Code:'F41.1',description:'Example diagnosis'}]}}}}});
 const w=mount(Panel,{props:{clientId:2449,agencyId:450,clientType:'clinical'}});
 await flushPromises();
 expect(state.get).toHaveBeenCalledWith('/medical-billing/treatment-plans/51',expect.anything());
 expect(w.text()).toContain('F41.1');
 expect(w.text()).toContain('Current 6');
 expect(w.text()).toContain('O2.1');
 expect(w.text()).toContain('Edit draft in chart');
 w.unmount();
});

it('labels a provider-signed plan awaiting supervisor approval and uses the revision workflow', async () => {
  const plan = { id: 51, status: 'draft', title: 'Synthetic treatment plan draft', providerApproved: true, goals: [] };
  state.get.mockResolvedValue({ data: { plans: [plan], latestPlan: plan } });
  const wrapper = mount(Panel, { props: { clientId: 2297, agencyId: 450, clientType: 'clinical' } });
  await flushPromises();
  expect(wrapper.text()).toContain('Provider signed · Supervisor review pending');
  expect(wrapper.text()).not.toContain('Discard draft');
  expect(wrapper.text()).not.toContain('Draft — updating');
  await wrapper.findAll('button').find(button => button.text() === 'Revise plan with Narriva').trigger('click');
  expect(state.push).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ planId: '51', revision: '1' }) }));
  wrapper.unmount();
});
