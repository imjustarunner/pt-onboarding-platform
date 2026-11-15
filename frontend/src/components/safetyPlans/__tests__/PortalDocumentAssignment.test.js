import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createRouter,createMemoryHistory} from 'vue-router';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Assignment from '../../enrollment/PortalDocumentAssignmentDialog.vue';
import Enrollment from '../../enrollment/EnrollmentPortalDocuments.vue';
import Panel from '../SafetyPlansPanel.vue';
import Portal from '../PortalSafetyPlans.vue';
const recipients=[{id:20,kind:'guardian',name:'Synthetic Guardian'}];
const props={agencyId:2,clientId:41,documents:[{foundationKey:'privacy',title:'Privacy notice'},{foundationKey:'insurance',title:'Insurance information'}],recipients};
let wrapper;
beforeEach(()=>{vi.clearAllMocks();api.post.mockResolvedValue({data:{assignedCount:2,alreadyAssignedCount:0,notifications:'grouped'}});});
afterEach(()=>wrapper?.unmount());
const mountDialog=()=>mount(Assignment,{props,global:{stubs:{Teleport:true}}});
it('assigns several forms in one request after choosing the guardian once',async()=>{
 wrapper=mountDialog();expect(wrapper.text()).toContain('Assign 2 documents');expect(wrapper.findAll('input:not([type=checkbox])')).toHaveLength(0);
 expect(wrapper.get('button.primary').attributes('disabled')).toBeDefined();await wrapper.get('input[type=checkbox]').setValue(true);await wrapper.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/enrollment-portal/clients/41/assignments',expect.objectContaining({recipient:{id:20,kind:'guardian'},documents:[{foundationKey:'privacy'},{foundationKey:'insurance'}],authorityConfirmed:true,action:'complete',requestKey:expect.any(String)}));expect(wrapper.emitted('assigned')).toBeUndefined();expect(wrapper.get('[role=status]').text()).toContain('Synthetic Guardian');expect(wrapper.get('[role=status]').text()).toContain('Delivery has not been confirmed');expect(wrapper.find('form').exists()).toBe(false);await wrapper.get('[role=status] button').trigger('click');expect(wrapper.emitted('assigned')[0][0].assignedCount).toBe(2);
});
it('keeps the request key when a response is lost so retrying cannot duplicate forms',async()=>{
 api.post.mockRejectedValueOnce(Error('Network unavailable'));wrapper=mountDialog();await wrapper.get('input[type=checkbox]').setValue(true);
 await wrapper.get('form').trigger('submit');await flushPromises();const first=api.post.mock.calls[0][1].requestKey;
 expect(wrapper.get('[role=alert]').text()).toContain('retry');await wrapper.get('form').trigger('submit');await flushPromises();expect(api.post.mock.calls[1][1].requestKey).toBe(first);
});
it('keeps a blocked recipient explicit without falling back to an in-person signature',()=>{
 wrapper=mount(Assignment,{props:{...props,recipients:[]},global:{stubs:{Teleport:true}}});expect(wrapper.text()).toContain('No portal account');expect(wrapper.find('form').exists()).toBe(false);expect(wrapper.text()).not.toContain('Together on this device');
});
it('selects new forms and saved documents together from the portal section',async()=>{
 api.get.mockImplementation(async url=>({data:url.includes('/catalog')?{branding:{name:'Synthetic'},client:{name:'Synthetic Client'},recipients,documents:[{key:'privacy',title:'Privacy notice'},{key:'insurance',title:'Insurance information'}]}:{plans:[{id:7,version:3,documentName:'Saved consent',title:'Consent'}]}}));
 wrapper=mount(Enrollment,{props:{agencyId:2,clientId:41},global:{stubs:{SafetyPlansPanel:true,Teleport:true}}});await flushPromises();
 await wrapper.get('input[aria-label="Select Saved consent"]').setValue(true);await wrapper.get('input[aria-label="Select Privacy notice"]').setValue(true);
 const assign=wrapper.findAll('button').find(b=>b.text()==='Assign 2 to portal');await assign.trigger('click');await flushPromises();expect(wrapper.findComponent(Assignment).props('documents')).toEqual([{recordId:7,version:3,title:'Saved consent'},{foundationKey:'privacy',title:'Privacy notice'}]);
 await wrapper.get('input[type=checkbox]:not([aria-label])').setValue(true);await wrapper.getComponent(Assignment).get('form').trigger('submit');await flushPromises();expect(wrapper.get('[role=status]').text()).toContain('2 newly assigned');await wrapper.get('[role=status] button').trigger('click');await flushPromises();expect(wrapper.text()).toContain('2 items are now in Synthetic Guardian’s portal');
});
it('opens a direct assignment dialog from Share to client portal without scrolling the chart',async()=>{
 const record={id:4,agencyId:2,clientId:41,version:1,currentVersion:1,documentKey:'enrollment-document',template:{key:'enrollment-document',title:'Privacy',sections:[],sourceHtml:'<p>Official notice</p>'},branding:{name:'Synthetic'},data:{documentName:'Privacy'},history:[],recipients,signers:[]};api.get.mockResolvedValue({data:record});
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]});await router.push('/synthetic');await router.isReady();
 wrapper=mount(Panel,{props:{agencyId:2,clientId:41,initialRecordId:4,recordOnly:true},global:{plugins:[router],stubs:{Teleport:true}}});await flushPromises();
 const scroll=vi.fn();wrapper.get('.signers').element.scrollIntoView=scroll;await wrapper.findAll('button').find(b=>b.text()==='Share to client portal').trigger('click');await flushPromises();
 expect(wrapper.findComponent(Assignment).exists()).toBe(true);expect(scroll).not.toHaveBeenCalled();expect(wrapper.get('[role=dialog]').text()).toContain('Assign 1 document');expect(wrapper.vm.confirmDiscard()).toBe(false);
});
it('takes the recipient through remaining forms and confirms when everything is completed',async()=>{
 let completed=0;
 api.get.mockImplementation(async url=>({data:url==='/clinical-forms/portal'?{shares:[{id:1,title:'Privacy',version:1,allowCompletion:true,signedAt:completed>=1?'now':null},{id:2,title:'Insurance',version:1,allowCompletion:true,signedAt:completed>=2?'now':null}]}:{id:Number(url.split('/').at(-1)),version:1,currentVersion:1,template:{key:'enrollment-document',title:'Synthetic',sections:[]},data:{},branding:{},mySignerId:1,signers:[{id:1,kind:'guardian',allowCompletion:true}]}}));
 wrapper=mount(Portal,{props:{clientId:41},global:{stubs:{SafetyPlanDocument:true,ClinicalDocumentCopy:true,SafetyPlanSigning:{emits:['signed'],template:'<button class="submit-synthetic-form" @click="$emit(\'signed\')">Submit form</button>'}}}});
 await flushPromises();expect(wrapper.text()).toContain('2 items need your attention');await wrapper.get('nav button').trigger('click');await flushPromises();
 completed=1;await wrapper.get('.submit-synthetic-form').trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledWith('/clinical-forms/portal/2');expect(wrapper.text()).toContain('1 item remains');
 completed=2;await wrapper.get('.submit-synthetic-form').trigger('click');await flushPromises();expect(wrapper.text()).toContain('All assigned items are complete');expect(wrapper.find('.submit-synthetic-form').exists()).toBe(false);
});

it('requires a fresh authority confirmation when switching guardian recipients',async()=>{
 wrapper=mount(Assignment,{props:{...props,recipients:[...recipients,{id:22,kind:'guardian',name:'Another Synthetic Guardian'}]},global:{stubs:{Teleport:true}}});
 await wrapper.findAll('select')[0].setValue(20);await wrapper.get('input[type=checkbox]').setValue(true);expect(wrapper.get('button.primary').attributes('disabled')).toBeUndefined();
 await wrapper.findAll('select')[0].setValue(22);expect(wrapper.get('input[type=checkbox]').element.checked).toBe(false);expect(wrapper.get('button.primary').attributes('disabled')).toBeDefined();
});
