import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils';
import {createMemoryHistory,createRouter} from 'vue-router';
const mocks=vi.hoisted(()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn()},auth:{user:null,logout:vi.fn()},agencies:{},activity:vi.fn()}));
vi.mock('../../services/api',()=>({default:mocks.api}));
vi.mock('../../store/auth.js',()=>({useAuthStore:()=>mocks.auth}));
vi.mock('../../store/agency.js',()=>({useAgencyStore:()=>mocks.agencies}));
vi.mock('../transport.js',()=>({mobileApi:{post:mocks.activity}}));
import MobileFamilyPortal from '../MobileFamilyPortal.vue';
import {activateFamilyDevice,clearFamilyDevice,familyDeviceContext} from '../familyContext';
import {secureCommentState} from '../../components/session-comments/sessionComments';
import {FAMILY_SHARING_REQUIRED_EVENT} from '../../utils/familySharingNotice';
const profile={surface:'family',user:{id:21,role:'guardian',firstName:'Fictional',lastName:'Parent'},workspace:{id:450,name:'Synthetic agency'},agencies:[{id:450,name:'Synthetic agency'}]};
let wrapper,router,originalLogout;
async function start(query='?secureCommentAppointmentId=12&secureCommentClientId=4'){
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p>Owned family portal</p>'}}]});await router.push('/mobile/family/demo/guardian'+query);
 wrapper=mount(MobileFamilyPortal,{props:{profile},attachTo:document.body,global:{plugins:[router]}});await flushPromises();return new DOMWrapper(document.body);
}
beforeEach(()=>{
 vi.resetAllMocks();originalLogout=mocks.auth.logout;activateFamilyDevice({sessionToken:'fictional-memory-credential',apiOrigin:'https://fixture.invalid'});
 mocks.api.get.mockImplementation(async(path)=>{
  // The same normal API surface used by family views must use the retained,
  // memory-only family context; this mock performs no network request.
  if(!familyDeviceContext())throw Error('Missing scoped family session');
  if(path.endsWith('/today'))return{data:{appointments:[],showSplash:false}};
  if(path==='/secure-family-sharing-notice')return{data:{agencyId:450,version:'2026-11-11',acknowledged:false,notice:{title:'Before your first shared message or comment',statements:['All currently eligible family portal users can see these updates.'],acknowledgment:'I understand'}}};
  if(path==='/secure-session-comments/appointments/12')return{data:{appointment:{id:12,clientId:4,agencyId:450,startAt:'2026-11-11T17:00:00Z',timeZone:'America/Denver'},comments:[{id:9,version:2,body:'Fictional session update',author:{id:31,name:'Fictional Provider'},createdAt:'2026-11-11T15:00:00Z',recipients:[{id:21,name:'Fictional Parent'}],readAt:null}],recipients:[{id:31,name:'Fictional Provider',required:true}],canWrite:true}};
  throw Error('Unexpected fixture request: '+path);
 });mocks.api.post.mockResolvedValue({data:{ok:true}});mocks.activity.mockResolvedValue({data:{}});
});
afterEach(()=>{wrapper?.unmount();wrapper=null;clearFamilyDevice();router?.options.history.destroy();document.body.innerHTML='';vi.restoreAllMocks();});
it('opens a per-session family deep link with the real host and clears its private content on lock unmount',async()=>{
 const body=await start();expect(body.text()).toContain('Fictional session update');expect(mocks.api.get).toHaveBeenCalledWith('/secure-session-comments/appointments/12',expect.objectContaining({params:expect.objectContaining({clientId:4})}));
 expect(mocks.api.post).toHaveBeenCalledWith('/secure-session-comments/appointments/12/read',{clientId:4,commentIds:[9],commentVersions:{9:2}},expect.any(Object));
 expect(mocks.auth.user).toMatchObject({id:21,role:'client_guardian'});expect(wrapper.findComponent({name:'SecureSessionCommentsHost'}).props('scopeKey')).not.toContain('fictional-memory-credential');
 wrapper.unmount();wrapper=null;expect(document.body.textContent).not.toContain('Fictional session update');expect(secureCommentState.selected).toBeNull();expect(secureCommentState.enabled).toBe(false);expect(mocks.auth.user).toBeNull();expect(mocks.agencies.currentAgency).toBeNull();expect(mocks.auth.logout).toBe(originalLogout);
});
it('mounts the shared first-send notice host for the family API fallback without resending a message',async()=>{
 const body=await start('');window.dispatchEvent(new CustomEvent(FAMILY_SHARING_REQUIRED_EVENT,{detail:{agencyId:450,version:'2026-11-11'}}));await flushPromises();
 expect(body.text()).toContain('All currently eligible family portal users');expect(body.find('input[type=checkbox]').exists()).toBe(true);expect(mocks.api.post).not.toHaveBeenCalled();
 wrapper.unmount();wrapper=null;expect(document.body.textContent).not.toContain('All currently eligible family portal users');
});
it('retains the existing account-settings and sign-out events',async()=>{
 await start('');await wrapper.get('.family-device-tools button').trigger('pointerdown');await wrapper.get('.family-device-tools button').trigger('click');expect(wrapper.emitted('account')).toHaveLength(1);mocks.auth.logout();expect(wrapper.emitted('logout')).toHaveLength(1);expect(mocks.activity).toHaveBeenCalledWith('/activity',{},expect.objectContaining({headers:{'X-Quick-View-Session':familyDeviceContext().sessionToken}}));
});
