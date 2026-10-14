import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import {defineComponent} from 'vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
vi.mock('../../../../../backend/src/models/AgencyOfficeIntakeMaster.model.js',()=>({default:{findByAgencyLanguage:vi.fn().mockResolvedValue(null)}}));
import api from '../../../services/api';
import Document from '../SafetyPlanDocument.vue';
import Panel from '../SafetyPlansPanel.vue';
import Signing from '../SafetyPlanSigning.vue';
import Portal from '../PortalSafetyPlans.vue';
import ScreenerLink from '../../clinical/ClinicalScreenerLink.vue';
import {safetyPlanTemplate} from '../../../../../backend/src/services/safetyPlans/template.js';
import {getClinicalTemplate,clinicalFormCatalog} from '../../../../../backend/src/services/safetyPlans/clinicalTemplates.js';
const branding={name:'Synthetic Agency',slug:'synthetic',font:'Montserrat',color:'#334455'};
const record={id:4,agencyId:2,clientId:41,version:1,currentVersion:1,contentHash:'hash-v1',template:safetyPlanTemplate,branding,data:{personLabel:'Synthetic Client',planDate:'2026-10-11',coping:'Synthetic coping'},signers:[],recipients:[],history:[{version:1,created_at:'2026-10-11'}]};
const button=(w,text)=>w.findAll('button').find(b=>b.text().includes(text));
async function mounted(component,props,stubs={}){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]});await router.push('/synthetic/clinical-forms');await router.isReady();return mount(component,{props,global:{plugins:[router],stubs:{NoteAidClientPicker:{template:'<div>Client picker</div>'},...stubs}}});}
beforeEach(()=>{vi.resetAllMocks();window.confirm=vi.fn().mockReturnValue(true);api.get.mockImplementation(async url=>({data:url.endsWith('/template')?{template:safetyPlanTemplate,branding,catalog:clinicalFormCatalog,client:{id:41,name:'Synthetic Client'}}:url==='/clinical-forms'?{plans:[]}:structuredClone(record)}));});
describe('clinical document rendering and editing',()=>{
 it('shows agency and AuricWell branding, seven fillable areas and preserves each edit',async()=>{const w=mount(Document,{props:{template:safetyPlanTemplate,branding,editable:true,modelValue:record.data}});expect(w.text()).toContain('Synthetic Agency');expect(w.text()).toContain('AuricWell EHR');expect(w.findAll('section')).toHaveLength(7);await w.get('textarea[aria-label="Things I can do to help myself"]').setValue('New coping');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({personLabel:'Synthetic Client',coping:'New coping'});w.unmount();});
 it('renders ROI choices and exact recipient fields without showing the safety-plan crisis footer',async()=>{const template=await getClinicalTemplate('release-of-information',2);const w=mount(Document,{props:{template,branding,editable:true,modelValue:{personLabel:'Synthetic'}}});expect(w.text()).toContain('I authorize Synthetic Agency');expect(w.find('.crisis').exists()).toBe(false);await w.findAll('input[type=checkbox]')[0].setValue(true);expect(w.emitted('update:modelValue').at(-1)[0].direction).toHaveLength(1);expect(w.get('input[aria-label="Recipient email"]').attributes('type')).toBe('email');w.unmount();});
 it('never renders arbitrary HTML supplied as a client answer',()=>{const w=mount(Document,{props:{template:safetyPlanTemplate,branding,modelValue:{...record.data,coping:'<img src=x onerror=alert(1)>'}}});expect(w.find('img[src=x]').exists()).toBe(false);expect(w.text()).toContain('<img src=x');w.unmount();});
 it('renders an unsigned attendance letter as a draft and uses neutral role wording',async()=>{const template=await getClinicalTemplate('attendance-verification',2);const w=mount(Document,{props:{template,branding,modelValue:{personLabel:'Synthetic',appointmentDate:'2026-10-10',attendanceStatus:'Confirmed attended',issuerTitle:'Facilitator'}}});expect(w.get('.attendance-letter').text()).toContain('Draft');expect(w.get('.attendance-letter').text()).toContain('Facilitator');expect(w.text()).not.toContain('Doctor');w.unmount();});
});
describe('staff workflow',()=>{
 it('saves a new client-linked form and keeps the clinical document type',async()=>{api.post.mockResolvedValue({data:record});const w=await mounted(Panel,{agencyId:2,clientId:41});await flushPromises();await button(w,'New safety plan').trigger('click');await w.get('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/clinical-forms',expect.objectContaining({clientId:41,documentKey:'safety-plan',allowUnlinked:false}));expect(w.text()).toContain('Document saved.');w.unmount();});
 it('offers each template and switches without creating a record',async()=>{const w=await mounted(Panel,{agencyId:2,clientId:41});await flushPromises();await button(w,'Release of information').trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledWith('/clinical-forms/template',expect.objectContaining({params:expect.objectContaining({documentKey:'release-of-information'})}));expect(api.post).not.toHaveBeenCalled();w.unmount();});
 it('requires an explicit override when no client is selected',async()=>{const w=await mounted(Panel,{agencyId:2});await flushPromises();await button(w,'New safety plan').trigger('click');expect(w.get('.plan-linkage').text()).toContain('private unlinked draft');expect(w.find('textarea[required]').exists()).toBe(false);await w.get('.plan-linkage input[type=checkbox]').setValue(true);expect(w.get('textarea[required]').exists()).toBe(true);w.unmount();});
});
describe('signatures and portal copies',()=>{
 const Capture=defineComponent({emits:['update:modelValue'],template:'<button type="button" @click="$emit(\'update:modelValue\',\'data:image/png;base64,example\')">Capture signature</button>'});
 it('sends the saved content hash with explicit witness confirmation for a live client signature',async()=>{api.post.mockResolvedValue({data:{signed:true}});const w=mount(Signing,{props:{plan:record,signer:{id:3,name:'Synthetic',kind:'client'}},global:{stubs:{AdaptiveSignatureCapture:Capture}}});await w.get('input[type=text],input:not([type])').setValue('Synthetic Client');await button(w,'Capture signature').trigger('click');await w.findAll('input[type=checkbox]')[0].setValue(true);expect(button(w,'Sign this version').attributes('disabled')).toBeDefined();await w.findAll('input[type=checkbox]')[1].setValue(true);await w.get('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/clinical-forms/4/signers/3/sign',expect.objectContaining({contentHash:'hash-v1',witnessConfirmed:true,consent:true}));w.unmount();});
 it('shows shared attendance copies without asking the client to sign',async()=>{const template=await getClinicalTemplate('attendance-verification',2);api.get.mockImplementation(async url=>({data:url==='/clinical-forms/portal'?{shares:[{id:3,version:1,title:template.title}]}:{...record,template,mySignerId:3,signers:[{id:3,kind:'client',name:'Synthetic',copyOnly:true}]}}));const w=mount(Portal,{props:{clientId:41}});await flushPromises();await button(w,'Appointment attendance').trigger('click');await flushPromises();expect(w.findComponent(Signing).exists()).toBe(false);expect(w.text()).toContain('No signature required');w.unmount();});
 it('lets a portal recipient edit an information update while binding submission to the shared version',async()=>{const template=await getClinicalTemplate('client-information-update',2);api.get.mockImplementation(async url=>({data:url==='/clinical-forms/portal'?{shares:[{id:3,version:1,title:template.title}]}:{...record,template,mySignerId:3,signers:[{id:3,kind:'client',name:'Synthetic'}]}}));const w=mount(Portal,{props:{clientId:41},global:{stubs:{AdaptiveSignatureCapture:Capture}}});await flushPromises();await button(w,'Client information').trigger('click');await flushPromises();await w.get('input[aria-label="Phone number"]').setValue('555-0103');expect(w.getComponent(Signing).props('updateData').phone_number).toBe('555-0103');expect(w.getComponent(Signing).props('plan').contentHash).toBe('hash-v1');w.unmount();});
});


describe('C-SSRS administration',()=>{
 it('shows conditional questions, clears stale answers and displays immediate follow-up guidance',async()=>{
  const template=await getClinicalTemplate('cssrs-screener',2);
  const w=mount(Document,{props:{template,branding,editable:true,modelValue:{personLabel:'Synthetic',cssrs_2:'no',cssrs_6:'no'}}});
  expect(w.find('input[name="cssrs_3"]').exists()).toBe(false);
  expect(w.find('input[name="cssrs_6_recent"]').exists()).toBe(false);
  await w.setProps({modelValue:{personLabel:'Synthetic',cssrs_2:'yes',cssrs_4:'yes',cssrs_6:'yes'}});
  expect(w.find('input[name="cssrs_3"]').exists()).toBe(true);
  expect(w.find('input[name="cssrs_6_recent"]').exists()).toBe(true);
  expect(w.get('.screen-concern').text()).toContain('Prompt safety follow-up');
  await w.get('input[name="cssrs_2"][value="no"]').setValue(true);
  expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({cssrs_2:'no',cssrs_4:''});w.unmount();
 });
 it('saves an unlinked screener with the explicit private-record override',async()=>{
  const template=await getClinicalTemplate('cssrs-screener',2);
  api.get.mockImplementation(async url=>({data:url.endsWith('/template')?{template,catalog:clinicalFormCatalog,branding}: {plans:[]}}));
  api.post.mockResolvedValue({data:{...record,clientId:null,documentKey:'cssrs-screener',template,data:{personLabel:'Synthetic',screenStatus:'draft'}}});
  const w=await mounted(Panel,{agencyId:2,initialDocumentKey:'cssrs-screener',mine:true});await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/clinical-forms',expect.objectContaining({params:expect.objectContaining({mine:'1'})}));
  await button(w,'New c-ssrs').trigger('click');
  await w.get('.plan-linkage input[type=checkbox]').setValue(true);
  await w.get('.plan-linkage textarea').setValue('Client record pending');
  await w.get('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clinical-forms',expect.objectContaining({documentKey:'cssrs-screener',allowUnlinked:true,overrideReason:'Client record pending'}));
  expect(w.text()).toContain('Document saved.');w.unmount();
 });
});

it('assessment launch preserves client identity and supports common search names',async()=>{
 const w=await mounted(ScreenerLink,{clientId:41,search:'suicidal ideation'});
 expect(w.get('a').attributes('href')).toContain('form=cssrs-screener&clientId=41');
 await w.setProps({search:'unrelated-tool'});expect(w.find('a').exists()).toBe(false);w.unmount();
});
