import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
vi.mock('vue',async importOriginal=>{const vue=await importOriginal();return {...vue,Teleport:{...vue.Teleport,process(previous,next,...args){next.props={...next.props,disabled:true};return vue.Teleport.process(previous,next,...args);}}};});
vi.mock('vue-router',()=>({onBeforeRouteLeave:vi.fn()}));
const m=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));
vi.mock('../../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'support',billingAgencyIds:[2]}})}));
import Panel from '../ClientEhrBringUpToDatePanel.vue';
import Assignments from '../ClientUpdateAssignments.vue';
import CreateModal from '../ClientRecordsCreateModal.vue';
let savedAssignment,access;
beforeEach(()=>{
 vi.clearAllMocks();setActivePinia(createPinia());savedAssignment=null;access=0;Element.prototype.scrollIntoView=vi.fn();
 m.get.mockImplementation(async url=>{
  if(url==='/clients/creation-draft')return {data:{revision:1,value:{form:{fullName:'Synthetic Client',kind:'clinical',organizationId:2},created:{id:12,agency_id:2},completed:false}}};
  if(url==='/provider-scheduling/providers')return {data:[{id:20,first_name:'Pat',last_name:'Provider'}]};
  if(url.endsWith('/chart-import/drafts'))return {data:{drafts:{comments:{revision:1,value:{text:'Imported source comment',imported:true}}}}};
  if(url.endsWith('/chart-import/drafts/assignments'))return {data:{draft:{revision:savedAssignment?1:0,value:savedAssignment?{text:savedAssignment}:null}}};
  if(url==='/clients/12')return {data:{id:12,agency_id:2,client_type:'clinical',provider_id:20}};
  if(url.endsWith('/service-enrollments'))return {data:{services:[{id:1,label:'Counseling',service_kind:'counseling',provider_user_id:20,is_active:1}],availableServiceKinds:['counseling','coaching']}};
  if(url==='/office-clients/providers')return {data:{providers:[{id:20,first_name:'Pat',last_name:'Provider'}]}};
  if(url.endsWith('/agency-affiliations'))return {data:[{agency_id:2,agency_name:'Agency'}]};
  if(url.endsWith('/affiliations')||url.endsWith('/affiliated-organizations'))return {data:[]};
  if(url==='/offices')return {data:[{id:21,physical_office_location_id:9,agency_id:2,name:'Example office',default_place_of_service:'11'}]};
  if(url.endsWith('/office-assignments'))return {data:{assigned:[{office_location_id:9,is_active:1,is_primary:1}]}};
  if(url.includes('/service-locations'))return {data:{items:[{id:41,agency_id:2,billing_office_location_id:21,place_of_service:'11'}]}};
  if(url.endsWith('/guardians'))return {data:[{guardian_user_id:30,first_name:'Primary',last_name:'Parent',email:'parent@example.test',relationship_type:'guardian',relationship_title:'Mother',access_enabled:access}]};
  return {data:[]};
 });
 m.put.mockImplementation(async(url,body)=>{if(url.endsWith('/drafts/assignments'))savedAssignment=body.text;return {data:{revision:2}};});
 m.post.mockResolvedValue({data:{progress:{status:'complete'},recipients:[]}});
 m.patch.mockImplementation(async()=>{access=1;return {data:{}};});
});
function renderCreate(){return mount(CreateModal,{props:{agencies:[{id:2,name:'Agency'}],initialAgencyId:2},global:{plugins:[createPinia()],stubs:{ClientMedicalHistory:true,ClientPayerLinkage:true,Teleport:false}}});}
function render(props={}){return mount(Panel,{props:{open:true,clientId:12,agencyId:2,autoImport:false,...props},global:{stubs:{ClientMedicalHistory:true,ClientPayerLinkage:true,Teleport:true}}});}
it('completes the real import while provider defaults are unsaved, preserving those defaults as a private draft',async()=>{
 m.post.mockResolvedValue({data:{progress:{status:'complete',clientStatus:{id:11,key:'current',label:'Current'}}}});
 const w=render({creationFlow:true,requireVerifiedPayers:true});await flushPromises();
 const assignments=w.findComponent(Assignments);expect(assignments.get('[aria-label="Default office"]').element.value).toBe('21');expect(assignments.vm.prepareLeave()).toBe(false);
 await w.findAll('button').find(b=>b.text()==='Finish client import').trigger('click');await w.get('.ehr-completion-review input[type=checkbox]').setValue(true);
 await w.findAll('button').find(b=>b.text()==='Complete records import').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/clients/12/chart-import/complete',expect.anything(),expect.anything());expect(w.emitted('imported')).toHaveLength(1);
 expect(JSON.parse(savedAssignment)).toMatchObject({defaults:{officeId:'21',pos:'11',serviceLocationId:'41'}});
 expect(m.post.mock.calls.some(([url])=>url.endsWith('/agency-affiliations'))).toBe(false);expect(w.emitted('imported')[0][0].assignmentDraftPending).toBe(true);
 expect(w.emitted('imported')[0][0].client).toMatchObject({id:12,status:'ACTIVE',client_status_id:11,client_status_key:'current',client_status_label:'Current'});
 w.unmount();
});
it('lets staff save and leave with restored assignment choices instead of forcing them to commit every pending action',async()=>{
 const w=render();await flushPromises();expect(await w.vm.prepareLeave()).toBe(true);expect(savedAssignment).toContain('21');w.unmount();
 const reopened=render();await flushPromises();expect(reopened.text()).toContain('Saved assignment draft restored');expect(reopened.findComponent(Assignments).get('[aria-label="Default office"]').element.value).toBe('21');reopened.unmount();
});
it('keeps real portal access and preview controls usable while source text and office defaults are pending',async()=>{
 const w=render();await flushPromises();await w.get('textarea[data-section=contacts]').setValue('Not yet imported contacts');
 const access=w.get('[aria-label="Portal relationship access"] select');expect(access.element.disabled).toBe(false);expect(access.element.closest('fieldset[disabled]')).toBeNull();
 await access.setValue('care');await w.get('[aria-label="Portal relationship access"] input[placeholder]').setValue('Verified parent relationship and requested access');await w.findAll('button').find(b=>b.text()==='Save access').trigger('click');await flushPromises();
 expect(m.patch).toHaveBeenCalledWith('/clients/12/guardians/30',{accessMode:'care',accessReason:'Verified parent relationship and requested access'});
 await w.findAll('button').find(b=>b.text()==='Preview transition invitation').trigger('click');await flushPromises();expect(m.post).toHaveBeenCalledWith('/portal-migration/staff/transition-preview',{agencyId:2,clientId:12});expect(m.post.mock.calls.some(([url])=>url.endsWith('transition-send'))).toBe(false);w.unmount();
});

it('saves and closes the outer add-client modal with a real unfinished provider editor',async()=>{
 const w=renderCreate();await flushPromises();await w.findAll('button').find(b=>b.text()==='Change provider').trigger('click');await flushPromises();
 const close=w.findAll('button').find(b=>b.text()==='Save draft & close');expect(close.element.disabled).toBe(false);await close.trigger('click');await flushPromises();
 expect(w.emitted('close')).toHaveLength(1);expect(JSON.parse(savedAssignment)).toMatchObject({services:{editingServiceId:1,selectedProviderId:20}});
 expect(m.post.mock.calls.some(([url])=>url.endsWith('/providers'))).toBe(false);w.unmount();
});

it('saves the current import and opens a different client without committing the pending office defaults',async()=>{
 const w=renderCreate();await flushPromises();await w.findAll('button').find(b=>b.text()==='Save this import and add a different client').trigger('click');await flushPromises();
 expect(w.get('textarea[data-section=demographics]').element.value).toBe('');expect(w.text()).toContain('Create chart and import sections');expect(w.text()).not.toContain('Chart #12 is saved');
 expect(JSON.parse(savedAssignment)).toMatchObject({defaults:{officeId:'21'}});expect(m.post.mock.calls.some(([url])=>url==='/clients')).toBe(false);w.unmount();
});

it('shows completion and allows the next client before the completed chart refresh returns',async()=>{
 const w=renderCreate();await flushPromises();const original=m.get.getMockImplementation();let resolveRefresh;
 const refresh=new Promise(resolve=>{resolveRefresh=resolve;});m.get.mockImplementation((url,...args)=>url==='/clients/12'||url.endsWith('/service-enrollments')?refresh:original(url,...args));
 await w.findAll('button').find(b=>b.text()==='Finish client import').trigger('click');await w.get('.ehr-completion-review input[type=checkbox]').setValue(true);
 await w.findAll('button').find(b=>b.text()==='Complete records import').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/clients/12/chart-import/complete',expect.anything(),expect.anything());expect(w.text()).toContain('Client saved');expect(w.find('.ehr-completion-review').exists()).toBe(false);
 await w.findAll('button').find(b=>b.text().startsWith('Add next client')).trigger('click');await flushPromises();expect(w.get('textarea[data-section=demographics]').element.value).toBe('');
 resolveRefresh({data:{id:12,agency_id:2,full_name:'Previous Synthetic Client',provider_id:20,services:[]}});await flushPromises();expect(w.text()).not.toContain('Previous Synthetic Client');expect(w.text()).not.toContain('Chart #12');w.unmount();
});
