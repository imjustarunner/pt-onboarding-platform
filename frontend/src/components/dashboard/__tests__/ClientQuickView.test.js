import {mount,flushPromises} from '@vue/test-utils';
import {expect,it,vi,afterEach} from 'vitest';
import {createRouter,createMemoryHistory} from 'vue-router';
import Panel from '../ClientQuickView.vue';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:9,role:'provider'}})}));
vi.mock('../ClientCareOverview.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../clients/ClientFollowUpTask.vue',()=>({default:{template:'<div />'}}));
let w;
afterEach(()=>{w?.unmount();document.body.innerHTML='';vi.clearAllMocks();});
async function render() {
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]});
  await router.push('/dashboard');await router.isReady();
  m.get.mockImplementation(async url=>{
    if(url.startsWith('/messages/hub/people/'))return {data:{person:{clientId:12,agencyId:2,clientMessaging:{guardians:[{userId:7,methods:[{id:'secure',available:true}]}]}}}};
    if(url.endsWith('/guardians'))return {data:[
      {guardian_user_id:7,first_name:'Current',email:'current@example.invalid',phone:'555-0123',access_enabled:1},
      {guardian_user_id:8,first_name:'Disconnected',email:'old@example.invalid',access_enabled:0}]};
    if(url.endsWith('quick-view-tasks'))return {data:{tasks:[{id:5,title:'Call about paperwork',status:'pending'}]}};
    return {data:{id:12,agency_id:2,email:'client@example.invalid',contact_phone:'555-0100'}};
  });
  w=mount(Panel,{attachTo:document.body,props:{client:{id:12,agency_id:2},label:'Client A',status:'Current',snapshot:{nextAt:'2026-11-26T12:00:00Z'}},global:{plugins:[router],stubs:{Teleport:true}}});
  await flushPromises();return router;
}
it('shows appointment, task and distinct client and guardian contacts and opens the chosen guardian composer',async()=>{
  const router=await render();
  expect(w.text()).toContain('Next scheduled');expect(w.text()).toContain('Call about paperwork');
  expect(w.text()).toContain('client@example.invalid');expect(w.text()).toContain('current@example.invalid');expect(w.text()).not.toContain('old@example.invalid');
  await w.findAll('button').find(b=>b.text()==='Message this guardian').trigger('click');await flushPromises();
  expect(router.currentRoute.value.query).toMatchObject({secureRecipient:'guardian',secureClientId:'12',secureGuardianUserId:'7',agencyId:'2'});
});
it('clears contact information immediately when moving to a different client while responses are pending',async()=>{
  await render();
  m.get.mockImplementation(()=>new Promise(()=>{}));
  await w.setProps({client:{id:13,agency_id:3},label:'Client B'});
  expect(w.text()).not.toContain('client@example.invalid');expect(w.text()).not.toContain('current@example.invalid');
  await w.get('aside').trigger('keydown',{key:'Escape'});
  expect(w.emitted('close')).toHaveLength(1);
});

it('keeps an unavailable guardian on the chart and explains the portal issue',async()=>{
 const router=await render();m.get.mockResolvedValue({data:{person:{clientId:12,agencyId:2,clientMessaging:{guardians:[{userId:7,methods:[{id:'secure',available:false,reason:'Guardian portal is inactive.'}]}]}}}});
 await w.findAll('button').find(b=>b.text()==='Message this guardian').trigger('click');await flushPromises();
 expect(router.currentRoute.value.path).toBe('/dashboard');expect(w.text()).toContain('Guardian portal is inactive.');
});
it('uses a nonmodal hover preview without locking the roster or stealing focus',async()=>{
 const button=document.createElement('button');document.body.append(button);button.focus();await render();
 expect(document.activeElement).toBe(button);expect(document.body.style.overflow).toBe('');expect(w.get('aside').attributes('aria-modal')).toBeUndefined();
 await w.get('aside').trigger('mouseenter');expect(w.emitted('keep-open')).toBeTruthy();
});
