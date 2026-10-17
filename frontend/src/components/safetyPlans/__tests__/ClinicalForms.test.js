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
beforeEach(()=>{vi.resetAllMocks();window.confirm=vi.fn().mockReturnValue(true);api.get.mockImplementation(async (url,config)=>({data:url.endsWith('/template')?{template:await getClinicalTemplate(config?.params?.documentKey||'safety-plan',2),branding,catalog:clinicalFormCatalog,client:{id:41,name:'Synthetic Client'}}:url==='/clinical-forms'?{plans:[]}:structuredClone(record)}));});
describe('clinical document rendering and editing',()=>{
 it('shows agency and AuricWell branding, seven fillable areas and preserves each edit',async()=>{const w=mount(Document,{props:{template:safetyPlanTemplate,branding,editable:true,modelValue:record.data}});expect(w.text()).toContain('Synthetic Agency');expect(w.text()).toContain('AuricWell EHR');expect(w.findAll('section')).toHaveLength(7);await w.get('textarea[aria-label="Things I can do to help myself"]').setValue('New coping');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({personLabel:'Synthetic Client',coping:'New coping'});w.unmount();});
 it('renders ROI choices and exact recipient fields without showing the safety-plan crisis footer',async()=>{const template=await getClinicalTemplate('release-of-information',2);const w=mount(Document,{props:{template,branding,editable:true,modelValue:{personLabel:'Synthetic'}}});expect(w.text()).toContain('I authorize Synthetic Agency');expect(w.find('.crisis').exists()).toBe(false);await w.findAll('input[type=checkbox]')[0].setValue(true);expect(w.emitted('update:modelValue').at(-1)[0].direction).toHaveLength(1);expect(w.get('input[aria-label="Recipient email"]').attributes('type')).toBe('email');w.unmount();});
 it('never renders arbitrary HTML supplied as a client answer',()=>{const w=mount(Document,{props:{template:safetyPlanTemplate,branding,modelValue:{...record.data,coping:'<img src=x onerror=alert(1)>'}}});expect(w.find('img[src=x]').exists()).toBe(false);expect(w.text()).toContain('<img src=x');w.unmount();});
 it('renders an unsigned attendance letter as a draft and uses neutral role wording',async()=>{const template=await getClinicalTemplate('attendance-verification',2);const w=mount(Document,{props:{template,branding,modelValue:{personLabel:'Synthetic',appointmentDate:'2026-10-10',attendanceStatus:'Confirmed attended',issuerTitle:'Facilitator'}}});expect(w.get('.attendance-letter').text()).toContain('Draft');expect(w.get('.attendance-letter').text()).toContain('Facilitator');expect(w.text()).not.toContain('Doctor');w.unmount();});
});
describe('staff workflow',()=>{
 it('saves a new client-linked form and keeps the clinical document type',async()=>{api.post.mockResolvedValue({data:record});const w=await mounted(Panel,{agencyId:2,clientId:41});await flushPromises();await button(w,'Safety plan').trigger('click');await w.get('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/clinical-forms',expect.objectContaining({clientId:41,documentKey:'safety-plan',allowUnlinked:false}));expect(w.text()).toContain('Document saved.');w.unmount();});
 it('opens the selected template for editing without persisting until save',async()=>{const w=await mounted(Panel,{agencyId:2,clientId:41});await flushPromises();await button(w,'Release of information').trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledWith('/clinical-forms/template',expect.objectContaining({params:expect.objectContaining({documentKey:'release-of-information'})}));expect(api.post).not.toHaveBeenCalled();expect(w.getComponent(Document).props('template').key).toBe('release-of-information');expect(w.getComponent(Document).props('editable')).toBe(true);expect(w.get('.template-picker').element.compareDocumentPosition(w.get('form').element)&4).toBe(4);w.unmount();});
 it('preserves unsaved answers when a new document is declined, then opens a fresh form after one confirmation',async()=>{
  const w=await mounted(Panel,{agencyId:2,clientId:41});await flushPromises();
  expect(w.findAll('.template-card')).toHaveLength(clinicalFormCatalog.length);
  await button(w,'Safety plan').trigger('click');
  await w.get('textarea[aria-label="Things I can do to help myself"]').setValue('Keep this answer');
  window.confirm.mockReturnValue(false);
  await button(w,'Release of information').trigger('click');await flushPromises();
  expect(w.get('textarea[aria-label="Things I can do to help myself"]').element.value).toBe('Keep this answer');
  window.confirm.mockClear().mockReturnValue(true);
  await button(w,'Release of information').trigger('click');await flushPromises();
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(w.getComponent(Document).props('template').key).toBe('release-of-information');
  expect(w.getComponent(Document).props('modelValue').coping).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();w.unmount();
 });
 it('can start another blank document of the same type without saving the previous draft',async()=>{
  const w=await mounted(Panel,{agencyId:2,clientId:41});await flushPromises();
  await button(w,'Safety plan').trigger('click');
  await w.get('textarea[aria-label="Things I can do to help myself"]').setValue('First draft');
  await button(w,'Safety plan').trigger('click');await flushPromises();
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(w.get('textarea[aria-label="Things I can do to help myself"]').element.value).toBe('');
  expect(api.post).not.toHaveBeenCalled();w.unmount();
 });
 it('keeps cards available for retry after a template load fails and disables them while loading',async()=>{
  const w=await mounted(Panel,{agencyId:2,clientId:41});await flushPromises();
  let rejectTemplate;
  api.get.mockImplementationOnce(()=>new Promise((resolve,reject)=>{rejectTemplate=reject;}));
  await button(w,'Release of information').trigger('click');
  expect(w.findAll('.template-card').every(card=>card.attributes('disabled')!==undefined)).toBe(true);
  rejectTemplate(new Error('Temporary failure'));await flushPromises();
  expect(w.find('form').exists()).toBe(false);expect(w.get('[role="alert"]').text()).toContain('try again');
  await button(w,'Release of information').trigger('click');await flushPromises();
  expect(w.getComponent(Document).props('template').key).toBe('release-of-information');
  expect(w.find('form').exists()).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();
 });
 it('opens a saved form directly and attaches it to the selected client only after identity confirmation',async()=>{
  const unlinked={...record,clientId:null};
  api.get.mockImplementation(async url=>({data:url.endsWith('/template')?{template:safetyPlanTemplate,branding,catalog:clinicalFormCatalog}:url==='/clinical-forms'?{plans:[{id:4,documentKey:'safety-plan',name:'Synthetic Client',version:1}]}:unlinked}));
  api.post.mockResolvedValue({data:{...record,version:2,currentVersion:2}});
  const Picker=defineComponent({props:['modelValue','agencyId','searchAllTenants'],emits:['update:modelValue'],template:'<button type="button" @click="$emit(\'update:modelValue\',41)">Choose assigned client</button>'});
  const w=await mounted(Panel,{agencyId:2,initialRecordId:4},{NoteAidClientPicker:Picker});await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/clinical-forms/4',expect.anything());
  expect(w.get('details summary').text()).toBe('Attach to a client’s medical record');
  await button(w,'Choose assigned client').trigger('click');
  expect(button(w,'Attach to client record').attributes('disabled')).toBeDefined();
  await w.get('details input[type=checkbox]').setValue(true);
  await button(w,'Attach to client record').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clinical-forms/4/link',{version:1,clientId:41,confirmIdentity:true});
  expect(w.get('aside').text()).toContain('Linked to a client');
  expect(w.text()).toContain('Saved in the client’s medical record');w.unmount();
 });
 it('does not display a deep-linked record from a different agency',async()=>{
  api.get.mockImplementation(async url=>({data:url.endsWith('/template')?{template:safetyPlanTemplate,branding,catalog:clinicalFormCatalog}:url==='/clinical-forms'?{plans:[]}:{...record,agencyId:99}}));
  const w=await mounted(Panel,{agencyId:2,initialRecordId:4});await flushPromises();
  expect(w.findComponent(Document).exists()).toBe(false);expect(w.get('[role="alert"]').exists()).toBe(true);w.unmount();
 });
 it('requires an explicit override when no client is selected',async()=>{const w=await mounted(Panel,{agencyId:2});await flushPromises();await button(w,'Safety plan').trigger('click');expect(w.get('.plan-linkage').text()).toContain('private unlinked draft');expect(w.find('textarea[required]').exists()).toBe(false);await w.get('.plan-linkage input[type=checkbox]').setValue(true);expect(w.get('textarea[required]').exists()).toBe(true);w.unmount();});
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
  await button(w,'C-SSRS').trigger('click');
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


it('names a client-profile form while retaining the automatic client link',async()=>{
 api.post.mockResolvedValue({data:record});const w=await mounted(Panel,{agencyId:2,clientId:41});await flushPromises();await button(w,'Safety plan').trigger('click');
 await w.get('input[aria-label="Document name"]').setValue('Fall support plan');await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clinical-forms',expect.objectContaining({clientId:41,data:expect.objectContaining({documentName:'Fall support plan'})}));w.unmount();
});
it('offers portal completion from a saved linked form',async()=>{
 const shared={...record,recipients:[{id:21,kind:'client',name:'Synthetic Client'}]};api.get.mockImplementation(async url=>({data:url.endsWith('/template')?{template:safetyPlanTemplate,branding,catalog:clinicalFormCatalog}:url==='/clinical-forms'?{plans:[]}:shared}));api.post.mockResolvedValue({data:shared});
 const w=await mounted(Panel,{agencyId:2,clientId:41,initialRecordId:4});await flushPromises();expect(button(w,'Share to client portal')).toBeTruthy();
 await w.findAll('.signer-setup select')[1].setValue(21);await w.findAll('.signer-setup select')[2].setValue('complete');await w.get('.signer-setup').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clinical-forms/4/signers',expect.objectContaining({userId:21,allowCompletion:true,copyOnly:false}));expect(w.text()).toContain('notifications are grouped');w.unmount();
});
it('only makes a safety plan editable in the portal when completion was requested',async()=>{
 let allowed=false;api.get.mockImplementation(async url=>({data:url==='/clinical-forms/portal'?{shares:[{id:3,version:1,title:'Safety plan'}]}:{...record,mySignerId:3,signers:[{id:3,kind:'client',name:'Synthetic',allowCompletion:allowed}]}}));
 const w=mount(Portal,{props:{clientId:41},global:{stubs:{SafetyPlanSigning:true}}});await flushPromises();await button(w,'Safety plan').trigger('click');await flushPromises();expect(w.getComponent(Document).props('editable')).toBe(false);
 allowed=true;await button(w,'Safety plan').trigger('click');await flushPromises();expect(w.getComponent(Document).props('editable')).toBe(true);await w.get('textarea[aria-label="Things I can do to help myself"]').setValue('Portal answer');expect(w.getComponent(Signing).props('updateData').coping).toBe('Portal answer');w.unmount();
});
