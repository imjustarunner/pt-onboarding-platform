import {beforeEach,it,expect,vi} from 'vitest';
import {mount,shallowMount,flushPromises} from '@vue/test-utils';
const http=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('../../services/api',()=>({default:http}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({user:{id:3,role:'super_admin'}})}));
vi.mock('../../store/agency',()=>({useAgencyStore:()=>({agencies:[{id:2,name:'ITSCO',slug:'itsco'}],currentAgency:{id:2},currentAgencyId:2})}));
vi.mock('../../store/branding',()=>({useBrandingStore:()=>({})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'},query:{}})}));
import View from '../admin/PreHireView.vue';
let candidate;
beforeEach(()=>{
 vi.clearAllMocks();candidate={id:8,first_name:'Candidate',last_name:'Person',status:'PREHIRE_OPEN',progress_pct:100,task_total:6,task_completed:6,work_email:'candidate@itsco.health'};
 http.get.mockImplementation(async url=>({data:url==='/hiring/prehire-candidates'?[candidate]:[]}));
 http.post.mockImplementation(async()=>{candidate={...candidate,status:'PREHIRE_REVIEW'};return {data:{advancedTo:'PREHIRE_REVIEW'}};});
});
it('offers manual verified completion at100percent, then exposes the separate onboarding action',async()=>{
 const w=shallowMount(View,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();
 const button=w.findAll('button').find(value=>value.text()==='Mark pre-hire complete');expect(button.attributes('disabled')).toBeUndefined();
 await button.trigger('click');await flushPromises();expect(http.post).toHaveBeenCalledWith('/hiring/candidates/8/complete-prehire',{}, {params:{agencyId:expect.anything()}});
 expect(w.text()).toContain('Move to Onboarding');expect(http.post.mock.calls.some(([url])=>url.includes('promote-to-onboarding'))).toBe(false);w.unmount();
});
it('keeps the action visible but unavailable while required prehire work remains',async()=>{
 candidate.progress_pct=83;candidate.task_completed=5;
 const w=shallowMount(View);await flushPromises();const button=w.findAll('button').find(value=>value.text()==='Mark pre-hire complete');
 expect(button.attributes('disabled')).toBeDefined();expect(http.post).not.toHaveBeenCalled();w.unmount();
});
it('shows the server prerequisite denial when completion is requested directly from the table',async()=>{
 http.post.mockRejectedValueOnce({response:{data:{error:{message:'The candidate’s required items changed. Refresh and review.'}}}});
 const w=shallowMount(View);await flushPromises();await w.findAll('button').find(value=>value.text()==='Mark pre-hire complete').trigger('click');await flushPromises();
 expect(w.get('[role="status"]').text()).toContain('required items changed');expect(w.text()).not.toContain('Move to Onboarding →');w.unmount();
});
it('opens the real onboarding setup from the list without changing the employee',async()=>{
 candidate.status='PREHIRE_REVIEW';
 http.get.mockImplementation(async url=>({data:
   url==='/hiring/prehire-candidates'?[candidate]:
   url==='/onboarding-packages'?[{id:9,name:'Employee onboarding',agency_id:2,package_type:'onboarding',is_active:true}]:
   url.endsWith('/hire-packages')?{phases:{onboarding:{packageId:9,workflow:{resources:[]}}}}:
   url.includes('document-learning')?{courses:[],expectedSchoolWork:false}:
   url.endsWith('/lifecycle')?{onboarding:{credentials:{workspaceEmail:candidate.work_email}}}:
   url==='/onboarding-packages/9'?{id:9,documents:[]}:
   url==='/hiring/settings'?{settings:{}}:[]
 }));
 const w=mount(View,{attachTo:document.body,global:{stubs:{RouterLink:{template:'<a><slot /></a>'},HiringHubSwitcher:true,PeopleOperationsNotificationRecipients:true}}});
 try {
  await flushPromises();
  await w.findAll('button').find(b=>b.text()==='Move to Onboarding →').trigger('click');await flushPromises();
  expect(document.body.querySelector('.pto-title')?.textContent).toBe('Prepare onboarding');
  expect(http.get).toHaveBeenCalledWith('/onboarding-packages',{params:{agencyId:'2'}});
  expect(http.post).not.toHaveBeenCalled();
 } finally {w.unmount();}
});
