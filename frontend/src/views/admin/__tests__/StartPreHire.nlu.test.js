import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),agency:{id:453,slug:'nlu-qa-demo'}}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post,put:m.put}}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:m.agency})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{userId:'1888',organizationSlug:'nlu-qa-demo'},query:{agencyId:'453'}}),useRouter:()=>({push:vi.fn()}),onBeforeRouteLeave:vi.fn()}));
import Page from '../StartPreHireView.vue';
let wrapper;
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();
 m.get.mockImplementation(async url=>({data:
  url.endsWith('/wizard-context')?{contractTenant:'nlu',serviceCompensation:{programs:{h2014:{rates:{3:[20,20,20,22,22]},indirectMinutesPerHour:10},homework_help:{rates:{3:[20,20,20,22,22]},indirectMinutesPerHour:0}}},tokens:{COMPANY_ADDRESS:'QA office',CREDENTIAL:'MA',CONTRACT_SERVICE_ROLES:['tutoring']},configs:[{id:1,is_active:1,pay_mode:'hourly'}],suggested:{configId:1,compensationCategory:3,officeLocationId:12},offices:[{id:12,name:'QA office',address:'QA address'}],compensationCategories:{3:{label:'Master’s-Level'}},compensationLevels:[{category:3,level:4,paySystem:{creditRate:46,hcodeRate:32,indirectRate:22}}]}:
  url==='/hiring/settings'?{portal_workflow:{handbookUrl:'https://example.com/qa-handbook'}}:
  url==='/users'?[{id:99,first_name:'QA',last_name:'Supervisor',role:'provider',has_supervisor_privileges:1},{id:100,first_name:'Not',last_name:'Supervisor',role:'provider'}]:
  url.endsWith('/prehire-draft')?{revision:0,draft:null}:
  url==='/contracts/infer-compensation'?{compensationCategory:3,payCategoryLabel:'Master’s'}:
  url==='/hiring/candidates/1888'?{user:{first_name:'QA',last_name:'Candidate'},profile:{credential:'MA'},jobDescription:{title:'Tutor',prehireConfig:{documents:[]}}}:
  []}));
 m.put.mockResolvedValue({data:{revision:1}});m.post.mockResolvedValue({data:{html:'<p>QA agreement</p>',unresolvedTokens:[]}});
});
afterEach(async()=>{wrapper?.unmount();await flushPromises();document.body.innerHTML='';vi.useRealTimers();});
async function page(){wrapper=mount(Page,{attachTo:document.body,global:{stubs:{RouterLink:true,ContractHandbookModal:true,JobDescriptionSections:true,HireWorkflowEditor:true,StandardAgreementApproval:true}}});await flushPromises();return wrapper;}
function field(label){return wrapper.findAll('label').find(node=>node.text().startsWith(label)).get('input');}
it('keeps the same form, focus and typed hours through draft saves and credential suggestions',async()=>{
 await page();
 const hours=field('Total work hours / week');hours.element.focus();
 await hours.setValue('20–25');await vi.advanceTimersByTimeAsync(400);await flushPromises();
 expect(m.put).toHaveBeenCalled();expect(m.put.mock.calls.at(-1)[1].draft.individualExpectations.expectedHours).toBe('20–25');
 expect(document.activeElement).toBe(hours.element);expect(field('Total work hours / week').element).toBe(hours.element);
 await wrapper.get('#prehire-level').setValue('4');
 const picker=wrapper.findComponent({name:'CredentialPicker'});picker.vm.$emit('update:modelValue','MA, LPCC');await flushPromises();
 expect(wrapper.get('#prehire-category').element.value).toBe('3');expect(wrapper.get('#prehire-level').element.value).toBe('4');
 expect(hours.element.value).toBe('20–25');
});
it('retains typed data after a failed autosave and retries the same draft inline',async()=>{
 m.put.mockRejectedValueOnce({response:{data:{error:{message:'Progress could not be saved.'}}}});
 await page();await field('Work schedule').setValue('Tuesday afternoons');await vi.advanceTimersByTimeAsync(400);await flushPromises();
 expect(wrapper.text()).toContain('Progress could not be saved.');expect(field('Work schedule').element.value).toBe('Tuesday afternoons');
 await wrapper.findAll('button').find(b=>b.text()==='Retry saving progress').trigger('click');await flushPromises();
 expect(m.put).toHaveBeenCalledTimes(2);expect(m.put.mock.calls[1][1].draft.individualExpectations.schedule).toBe('Tuesday afternoons');
});
it('takes a missing-level error to the actual field without clearing the schedule',async()=>{
 await page();await field('Work schedule').setValue('Mondays');
 await wrapper.get('input[type=radio][value=no]').setValue(true);
 await wrapper.get('#prehire-preview-button').trigger('click');await flushPromises();
 expect(wrapper.get('#prehire-preview-error').text()).toContain('Choose a pay level');
 expect(document.activeElement).toBe(wrapper.get('#prehire-level').element);
 expect(field('Work schedule').element.value).toBe('Mondays');expect(m.post).not.toHaveBeenCalled();
});
it('uses a selected eligible supervisor in the contract preview and keeps countersigners separate',async()=>{
 await page();await wrapper.get('#prehire-level').setValue('4');await wrapper.get('input[type=radio][value=no]').setValue(true);
 const supervisor=wrapper.get('#prehire-supervisor select');expect(supervisor.text()).not.toContain('Not Supervisor');
 await supervisor.setValue('99');await wrapper.get('#prehire-preview-button').trigger('click');await flushPromises();
 expect(m.post.mock.calls.at(-1)[1].tokens).toMatchObject({SUPERVISOR_NAME:'QA Supervisor',INCLUDE_SUPERVISION:'1',IS_SUPERVISOR:'0'});
 expect(m.post.mock.calls.at(-1)[1].tokens.CONTRACT_SERVICE_ROLES).toEqual(['tutoring']);
});

it('shows H2014 and Homework Help as separate schedules using the selected employee level',async()=>{
 await page();await wrapper.get('#prehire-level').setValue('4');
 expect(wrapper.get('.sph-program-rates table').text()).toContain('H2014 — Therapy + Tutoring');
 expect(wrapper.get('.sph-program-rates table').text()).toContain('Homework Help');
 const rows=wrapper.findAll('.sph-program-rates tbody tr');
 expect(rows[0].text()).toContain('$22.00');expect(rows[0].text()).toContain('10 minutes');
 expect(rows[1].text()).toContain('0 minutes');
 await wrapper.get('input[type=radio][value=yes]').setValue(true);
 expect(rows[0].text()).toContain('$18.70');
});
it('takes a server-side rate error to its service without losing entered hours',async()=>{
 m.post.mockRejectedValueOnce({response:{data:{error:{message:'Confirm the individual childcare hourly rate.'}}}});
 await page();await wrapper.get('#prehire-level').setValue('4');await wrapper.get('input[type=radio][value=no]').setValue(true);
 await field('Total work hours / week').setValue('20–25');
 await wrapper.get('#prehire-preview-button').trigger('click');await flushPromises();
 expect(wrapper.get('#prehire-preview-error').text()).toContain('Review childcare rates');
 expect(document.activeElement.closest('article').id).toBe('prehire-service-childcare');
 expect(field('Total work hours / week').element.value).toBe('20–25');
});
