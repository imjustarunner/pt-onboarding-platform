import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:8,role:'support'}})}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'demo'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2}})}));
vi.mock('../../../composables/useClientDisplayMode',()=>({useClientDisplayMode:()=>({getClientLabel:c=>c.fullName,getAvatarLetters:()=> 'QA'})}));
import Panel from '../OfficeIntakeQueuePanel.vue';
import Dialog from '../ClientTerminationDialog.vue';
let wrapper,clients;
beforeEach(()=>{
 vi.clearAllMocks();clients=[{id:51,fullName:'Example Client',clientType:'school'},{id:52,fullName:'Another Client',clientType:'clinical'}];
 api.get.mockImplementation(async url=>({data:url.endsWith('pending-office-clients')?{clients:[...clients]}:url.endsWith('closure-review')?{reviewToken:'review',canMarkInactive:true,terminationNote:null}:url.endsWith('termination-providers')?{providers:[{id:37,first_name:'Former',last_name:'Provider',is_active:0}]}:url==='/users'||url.endsWith('/notes')?[]:{}}));
 api.post.mockImplementation(async url=>{if(url==='/clients/51/inactive')clients=clients.filter(c=>c.id!==51);return {data:{id:51,status:'ARCHIVED',client_status_key:'inactive'}};});
});
afterEach(()=>wrapper?.unmount());
async function open(){wrapper=mount(Panel,{attachTo:document.body,global:{stubs:{Teleport:true,QuickPostClientToExchange:true,ClientDisplayModeToggle:true}}});await flushPromises();await wrapper.get('.oiq-card').trigger('click');await flushPromises();await wrapper.get('.oiq-btn--terminate').trigger('click');await flushPromises();}
async function decide(){await wrapper.get('#termination-reason').setValue('Did not start services');await wrapper.get('#termination-note-required').setValue('no');await wrapper.get('#termination-note-exemption').setValue('No services were provided.');}
async function review(){await wrapper.get('[role=dialog]').trigger('submit');await flushPromises();}
it('requires a documentation decision and a separate confirmation before changing the client',async()=>{
 await open();expect(wrapper.get('.termination-submit').element.disabled).toBe(true);await decide();await review();expect(api.post).not.toHaveBeenCalled();expect(wrapper.get('.termination-confirmation').text()).toContain('Are you sure');await review();
 expect(api.post).toHaveBeenCalledWith('/clients/51/inactive',expect.objectContaining({confirmClientClosure:true,closureReviewToken:'review',termination_note_required:false,termination_note_not_required_reason:'No services were provided.'}),{headers:{'X-Agency-Id':'2'}});
 expect(wrapper.find('[role=dialog]').exists()).toBe(false);expect(wrapper.findAll('.oiq-card')).toHaveLength(1);expect(wrapper.text()).toContain('marked inactive');
});
it('keeps failed changes and the entered details available for review',async()=>{
 await open();await decide();api.post.mockRejectedValueOnce({response:{data:{error:{message:'Withdraw the referral first.'}}}});await review();await review();expect(wrapper.text()).toContain('Withdraw the referral first.');expect(wrapper.get('#termination-note-exemption').element.value).toBe('No services were provided.');expect(wrapper.findAll('.oiq-card')).toHaveLength(2);
});
it('can cancel without changing any client',async()=>{await open();await wrapper.get('[role=dialog]').trigger('keydown',{key:'Escape'});expect(api.post).not.toHaveBeenCalled();expect(wrapper.find('[role=dialog]').exists()).toBe(false);});
it('does not assume a missing termination note means one is unnecessary',async()=>{await open();expect(wrapper.get('#termination-note-required').element.value).toBe('');expect(wrapper.get('.termination-submit').element.disabled).toBe(true);});
it('prevents duplicate submissions while the confirmed request is pending',async()=>{
 await open();await decide();await review();let finish;api.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await wrapper.get('[role=dialog]').trigger('submit');await wrapper.get('[role=dialog]').trigger('submit');expect(api.post).toHaveBeenCalledOnce();finish({data:{id:51}});await flushPromises();
});

it('allows provider termination while keeping direct inactive changes restricted',async()=>{
 const get=api.get.getMockImplementation();api.get.mockImplementation(async url=>url.endsWith('closure-review')?{data:{reviewToken:'review',canMarkInactive:false,terminationNote:{id:91}}}:get(url));
 wrapper=mount(Dialog,{props:{clientId:51,clientName:'Example Client',agencyId:2,mode:'terminate'},global:{stubs:{Teleport:true}}});await flushPromises();await wrapper.get('#termination-reason').setValue('Services completed');await review();await review();expect(api.post).toHaveBeenCalledWith('/clients/51/terminate',expect.objectContaining({confirmClientClosure:true}),{headers:{'X-Agency-Id':'2'}});
 wrapper.unmount();wrapper=mount(Dialog,{props:{clientId:51,clientName:'Example Client',agencyId:2},global:{stubs:{Teleport:true}}});await flushPromises();expect(wrapper.get('.termination-submit').element.disabled).toBe(true);expect(wrapper.text()).toContain('Providers must use Terminate client');
});
