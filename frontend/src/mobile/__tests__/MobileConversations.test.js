import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils';
import {createRouter,createWebHistory} from 'vue-router';
const mocks=vi.hoisted(()=>({request:vi.fn(),get:vi.fn(),post:vi.fn(),quickGet:vi.fn(),quickPost:vi.fn()}));
vi.mock('../transport.js',()=>({native:false,MobileDevice:{},quickApiBase:'/api/quick-view',mobileApi:{request:mocks.request,get:mocks.get,post:mocks.post},randomSecret:()=>'',pkceChallenge:vi.fn(),accountUrl:()=>'',mobileRequestError:e=>e.message}));
vi.mock('axios',()=>({default:{get:mocks.quickGet,post:mocks.quickPost,patch:vi.fn(),interceptors:{response:{use:vi.fn(),eject:vi.fn()}}}}));
import MobileApp from '../MobileApp.vue';
const profile={user:{id:1,firstName:'Test',email:'staff@example.invalid'},workspace:{id:10,name:'Test workspace'},agencies:[{id:10,name:'Test workspace'}],appLock:{method:'none',hasCode:false}};
let wrapper,router;
beforeEach(async()=>{
  vi.resetAllMocks();history.replaceState({},'','/mobile');
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})));
  mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{workspace:profile.workspace,appLock:profile.appLock}:{sessionToken:'test-scoped-session',userId:1,agencyId:10,expiresAt:'2099-01-01',profile}}));
  mocks.quickPost.mockResolvedValue({data:{ok:true}});
  mocks.quickGet.mockImplementation(async url=>({data:url.endsWith('/messages/inbox')?{items:[{key:'email:41',id:41,kind:'email',channel:'email',category:'email',title:'SYNTHETIC-EMAIL-41',subject:'SYNTHETIC-EMAIL-41',sender:'Synthetic Sender',preview:'Preview',at:'2026-11-05'}],mailboxEmail:'staff@example.invalid'}:url.endsWith('/conversations/41')?{conversation:{id:41,channel:'email',subject:'SYNTHETIC-EMAIL-41',inbox_from_email:'staff@example.invalid'},messages:[{id:100,from:{email:'sender@example.invalid'},to:[{email:'staff@example.invalid'}],body_text:'LONG-EMAIL-BODY\n'.repeat(100),direction:'inbound',send_status:'sent'}]}:{items:[],tasks:[],conversations:[]}}));
  router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push('/mobile');
  wrapper=mount(MobileApp,{attachTo:document.body,global:{plugins:[router],stubs:{QuickViewMusicDock:true,QuickViewPresence:true}}});await flushPromises();
});
afterEach(async()=>{wrapper?.unmount();router?.options.history.destroy();await new Promise(resolve=>setTimeout(resolve,35));document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals();});
const email=()=>wrapper.findAll('button').find(button=>button.text().includes('SYNTHETIC-EMAIL-41'));
async function historyBack(){router.back();await new Promise(resolve=>setTimeout(resolve,30));await flushPromises();}
it('opens a touch email without an obstructing hover preview and shows a closable reply',async()=>{
  await email().trigger('mouseenter');await email().trigger('focus');await email().trigger('click');await flushPromises();
  await new Promise(resolve=>setTimeout(resolve,380));await flushPromises();
  expect(document.querySelector('.qv-email-preview')).toBeNull();
  await wrapper.findAll('.email-reader header button').find(button=>button.text()==='Reply').trigger('click');await flushPromises();
  const dialog=document.querySelector('[aria-label="Email reply"]');expect(dialog).not.toBeNull();
  expect(document.activeElement).toBe(dialog.querySelector('textarea'));
  await new DOMWrapper(dialog.querySelector('textarea')).setValue('SYNTHETIC-REPLY');
  expect([...dialog.querySelectorAll('button')].find(button=>button.textContent.includes('Send reply')).disabled).toBe(false);
  await new DOMWrapper(dialog.querySelector('[aria-label="Close reply"]')).trigger('click');await flushPromises();
  expect(document.querySelector('[aria-label="Email reply"]')).toBeNull();expect(wrapper.find('.email-reader').exists()).toBe(true);
});
it('uses browser Back for reply, conversation and inbox without going to sign-in or setup',async()=>{
  await email().trigger('click');await flushPromises();
  await wrapper.findAll('.email-reader header button').find(button=>button.text()==='Reply').trigger('click');await flushPromises();
  await historyBack();expect(document.querySelector('[aria-label="Email reply"]')).toBeNull();expect(wrapper.find('.email-reader').exists()).toBe(true);
  await historyBack();expect(wrapper.find('.email-reader').exists()).toBe(false);expect(email()).toBeTruthy();
  expect(wrapper.text()).not.toContain('Continue to sign in');expect(wrapper.text()).not.toContain('Confirm code');
  expect(mocks.post).not.toHaveBeenCalled();expect(mocks.request.mock.calls.filter(([request])=>request.url==='/session')).toHaveLength(1);
});
it('cancels a queued desktop preview when the conversation opens',async()=>{
  window.matchMedia.mockReturnValue({matches:true});
  await email().trigger('mouseenter');await email().trigger('click');await flushPromises();await new Promise(resolve=>setTimeout(resolve,380));
  expect(document.querySelector('.qv-email-preview')).toBeNull();expect(wrapper.find('.email-reader').exists()).toBe(true);
});
