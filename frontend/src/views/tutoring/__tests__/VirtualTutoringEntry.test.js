import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),replace:vi.fn(),route:null,router:null}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('vue-router',async importOriginal=>{const actual=await importOriginal();return{...actual,useRoute:()=>m.route||actual.useRoute(),useRouter:()=>m.router||{replace:m.replace}};});
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{name:'Next Level Up'}})}));
import Entry from '../VirtualTutoringSessionView.vue';
beforeEach(()=>{vi.clearAllMocks();m.route={params:{appointmentId:'12'},query:{clientId:'4',agencyId:'6'}};m.router=null;});afterEach(()=>{vi.useRealTimers();sessionStorage.clear();});
const mountEntry=()=>mount(Entry,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});
it('shows an opening time at 45 minutes early without creating a visit or admitting anyone',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-21T19:15:00Z'));
 m.get.mockResolvedValue({data:{available:false,virtual:true,opensAt:'2026-10-21T19:30:00Z',closesAt:'2026-10-21T21:30:00Z',timeZone:'America/Denver'}});
 const w=mountEntry();await flushPromises();expect(w.text()).toContain('You’re a little early');expect(w.text()).toContain('1:30 PM MDT');expect(m.post).not.toHaveBeenCalled();expect(m.replace).not.toHaveBeenCalled();w.unmount();
});
it('at 10 minutes early creates a waiting visit and carries its credential to the same permanent office',async()=>{
 m.get.mockResolvedValue({data:{available:true,virtual:true,appointmentId:12,source:'appointment',officeSlug:'sample'}});m.post.mockResolvedValue({data:{officeSlug:'sample',lobby:{id:9,credential:'synthetic',guestDisplayName:'Parent',status:'waiting'}}});
 const w=mountEntry();await flushPromises();expect(m.post.mock.calls[0][0]).toBe('/tutoring-learning-os/clients/4/office-visit');expect(m.replace).toHaveBeenCalledWith('/join/my-room/sample');expect(JSON.parse(sessionStorage.getItem('auricwell-office-visit:sample')).id).toBe(9);expect(m.post.mock.calls.some(([url])=>url.includes('/admit'))).toBe(false);w.unmount();
});
it('does not reuse a cancelled or closed appointment link',async()=>{m.get.mockResolvedValue({data:{available:false,virtual:true,opensAt:null}});const w=mountEntry();await flushPromises();expect(w.text()).toContain('closed or the appointment has changed');expect(m.post).not.toHaveBeenCalled();w.unmount();});

it('follows the actual guardian navigation policy into the public waiting room without admission',async()=>{
 const {createRouter,createMemoryHistory,RouterView}=await import('vue-router');
 const {isGuardianWorkspaceRoute}=await import('../../../router/guardianRoutePolicy.js');
 const router=createRouter({history:createMemoryHistory(),routes:[
  {path:'/tutoring-session/appointment/:appointmentId',name:'VirtualTutoringAppointment',component:Entry},
  {path:'/join/my-room/:slug',name:'JoinMyRoom',component:{template:'<div>Waiting for admission</div>'}},
  {path:'/nlu-qa-demo/my-virtual-office',name:'OrganizationPrivateVirtualOffice',component:{template:'<div>Employee office controls</div>'}},
  {path:'/nlu-qa-demo/guardian',name:'Guardian',component:{template:'<div>Family dashboard</div>'}}
 ]});
 router.beforeEach(to=>isGuardianWorkspaceRoute(to)?true:'/nlu-qa-demo/guardian');
 m.route=null;m.router=router;
 m.get.mockResolvedValue({data:{available:true,virtual:true,appointmentId:12,source:'appointment',officeSlug:'qa-nlu-tutor'}});
 m.post.mockResolvedValue({data:{officeSlug:'qa-nlu-tutor',lobby:{id:9,credential:'synthetic',guestDisplayName:'Parent',status:'waiting'}}});
 await router.push('/tutoring-session/appointment/12?clientId=4&agencyId=6');
 const w=mount(RouterView,{global:{plugins:[router]}});await flushPromises();await flushPromises();
 expect(router.currentRoute.value.name).toBe('JoinMyRoom');expect(w.text()).toBe('Waiting for admission');
 expect(m.post).toHaveBeenCalledTimes(1);expect(m.post.mock.calls[0][1]).toMatchObject({appointmentId:12,intent:'join'});
 expect(m.post.mock.calls.some(([url])=>url.includes('/admit'))).toBe(false);
 expect(JSON.parse(sessionStorage.getItem('auricwell-office-visit:qa-nlu-tutor'))).toMatchObject({id:9,credential:'synthetic'});
 await router.push('/nlu-qa-demo/my-virtual-office');await flushPromises();
 expect(router.currentRoute.value.name).toBe('Guardian');w.unmount();
});
