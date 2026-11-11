import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils';
import {createRouter,createWebHistory} from 'vue-router';
const mocks=vi.hoisted(()=>({request:vi.fn(),get:vi.fn(),post:vi.fn(),quickGet:vi.fn(),quickPost:vi.fn(),quickPatch:vi.fn()}));
vi.mock('../transport.js',()=>({native:false,MobileDevice:{},quickApiBase:'/api/quick-view',mobileApi:{request:mocks.request,get:mocks.get,post:mocks.post},randomSecret:()=>'',pkceChallenge:vi.fn(),accountUrl:()=>'',mobileRequestError:e=>e.message}));
vi.mock('axios',()=>({default:{get:mocks.quickGet,post:mocks.quickPost,patch:mocks.quickPatch,interceptors:{response:{use:vi.fn(),eject:vi.fn()}}}}));
vi.mock('../../services/api',()=>({default:{get:mocks.quickGet,post:mocks.quickPost,patch:mocks.quickPatch}}));
import MobileApp from '../MobileApp.vue';
import MobileNotifications from '../MobileNotifications.vue';
const profile={user:{id:1,firstName:'Test',email:'staff@example.invalid'},workspace:{id:10,name:'Test workspace'},agencies:[{id:10,name:'Test workspace'}],appLock:{method:'code',hasCode:true}};
let wrapper,router;
beforeEach(async()=>{
  vi.resetAllMocks();history.replaceState({},'','/mobile');
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})));
  mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{workspace:profile.workspace,appLock:profile.appLock}:{sessionToken:'test-scoped-session',userId:1,agencyId:10,expiresAt:'2099-01-01',profile}}));
  mocks.quickPost.mockResolvedValue({data:{ok:true}});mocks.quickPatch.mockResolvedValue({data:{ok:true}});
  mocks.quickGet.mockImplementation(async (url,config)=>({data:url.endsWith('/messages/inbox') && config?.params?.countsOnly==='1'?{counts:{all:{unread:312}}}:url.endsWith('/messages/preferences')?{preferences:{navigationMode:'pinned',pinnedNavigation:['mywork','tasks','home'],usage:{}}}:url.endsWith('/workspace-counts')?{mywork:15,tasks:257}:url.endsWith('/messages/inbox')?{items:[{key:'email:41',id:41,kind:'email',channel:'email',category:'email',title:'SYNTHETIC-EMAIL-41',subject:'SYNTHETIC-EMAIL-41',sender:'Synthetic Sender',preview:'Preview',at:'2026-11-05'}],mailboxEmail:'staff@example.invalid'}:url.endsWith('/conversations/41')?{conversation:{id:41,channel:'email',subject:'SYNTHETIC-EMAIL-41',inbox_from_email:'staff@example.invalid'},messages:[{id:100,from:{email:'sender@example.invalid'},to:[{email:'staff@example.invalid'}],body_text:'LONG-EMAIL-BODY\n'.repeat(100),direction:'inbound',send_status:'sent'}]}:{items:[],tasks:[],conversations:[]}}));
  router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push('/mobile/workspace?view=home');
  wrapper=mount(MobileApp,{attachTo:document.body,global:{plugins:[router],stubs:{QuickViewMusicDock:true,QuickViewPresence:true}}});await flushPromises();
  // The retained device fixture has a valid server activity grant: restore it directly.
  expect(wrapper.find('.mobile-gate input[type=password]').exists()).toBe(false);
  expect(mocks.request.mock.calls.some(([request])=>request.url==='/resume')).toBe(true);
  await flushPromises();
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

it('hides the message list when opening My Work or Tasks through full navigation',async()=>{await wrapper.get('[aria-label="All workspace options"]').trigger('click');await wrapper.findAll('.qv-tool-card').find(button=>button.attributes('aria-label')==='My Work').trigger('click');await flushPromises();expect(wrapper.get('.mobile-messages').isVisible()).toBe(false);await wrapper.get('[aria-label="All workspace options"]').trigger('click');await wrapper.findAll('.qv-tool-card').find(button=>button.attributes('aria-label')==='Tasks').trigger('click');await flushPromises();expect(wrapper.get('.mobile-messages').isVisible()).toBe(false);});


it('loads actionable navigation badges before opening My Work or Tasks',async()=>{
 await vi.waitFor(()=>expect(mocks.quickGet).toHaveBeenCalledWith('/api/quick-view/workspace-counts',expect.any(Object)));
 const nav=()=>wrapper.findAll('.qv-tabs>button');
 expect(nav().find(b=>b.text().includes('Tasks')).get('.qv-nav-badge').text()).toBe('257');
 expect(nav().find(b=>b.text().includes('My Work')).get('.qv-nav-badge').text()).toBe('15');
});


async function taskScreen(){const base=mocks.quickGet.getMockImplementation();mocks.quickGet.mockImplementation(async(url,config)=>url.endsWith('/task-counts')?{data:{counts:{assigned:27,mine:7,lists:4,projects:2}}}:url.endsWith('/tasks')?{data:{tasks:[{id:7,title:'SYNTHETIC-TASK',status:'pending'}]}}:url.endsWith('/tasks/7')?{data:{task:{id:7,title:'SYNTHETIC-TASK',status:'pending',description:'Synthetic description',can_change_status:true},comments:[],availableLists:[]}}:base(url,config));await wrapper.findAll('.qv-tabs>button').find(b=>b.text().includes('Tasks')).trigger('click');await flushPromises();}
it('shows all four task suite counts and previews before requiring completion confirmation',async()=>{await taskScreen();expect(wrapper.get('.qv-suite').text()).toContain('Assigned 27');expect(wrapper.get('.qv-suite').text()).toContain('My tasks 7');expect(wrapper.get('.qv-suite').text()).toContain('Shared lists 4');expect(wrapper.get('.qv-suite').text()).toContain('Projects 2');await wrapper.get('.mt-options').trigger('click');await flushPromises();expect(wrapper.get('[aria-label="Task preview"]').text()).toContain('Synthetic description');await wrapper.findAll('[aria-label="Task preview"] button').find(b=>b.text()==='Mark done').trigger('click');expect(mocks.quickPatch).not.toHaveBeenCalled();await wrapper.findAll('[aria-label="Confirm task completion"] button').find(b=>b.text()==='Mark done').trigger('click');await flushPromises();expect(mocks.quickPatch).toHaveBeenCalledWith('/api/quick-view/tasks/7/status',{status:'completed'},expect.any(Object));});
it('opens task details while a slow directory request is still pending',async()=>{await taskScreen();const base=mocks.quickGet.getMockImplementation();let resolveDirectory;mocks.quickGet.mockImplementation((url,config)=>url.includes('/directory')?new Promise(resolve=>resolveDirectory=resolve):base(url,config));await wrapper.get('.mt-card').trigger('click');await flushPromises();expect(wrapper.get('[aria-label="Task details"]').text()).toContain('Synthetic description');resolveDirectory?.({data:{providers:[],schoolStaff:[]}});});
it('edits a due date from the task preview and preserves the prompt on a rejected save',async()=>{await taskScreen();await wrapper.get('.mt-options').trigger('click');await flushPromises();await wrapper.findAll('[aria-label="Task preview"] button').find(b=>b.text()==='Change due date').trigger('click');await wrapper.get('input[type="datetime-local"]').setValue('2026-11-17T15:30');mocks.quickPatch.mockRejectedValueOnce({response:{data:{error:{message:'Access changed'}}}});await wrapper.findAll('[aria-label="Change task due date"] button').find(b=>b.text()==='Save due date').trigger('click');await flushPromises();expect(wrapper.get('[aria-label="Change task due date"] [role="alert"]').text()).toContain('Access changed');expect(mocks.quickPatch).toHaveBeenCalledWith('/api/quick-view/tasks/7',{dueDate:new Date('2026-11-17T15:30').toISOString()},expect.any(Object));});

it('shows the weekday of the selected calendar date rather than only today',async()=>{
 await router.push('/mobile/workspace?view=calendar');await flushPromises();await wrapper.get('[aria-label="Calendar date"]').setValue('2026-11-10');await flushPromises();expect(wrapper.get('.calendar-heading').text()).toContain('Tuesday');expect(wrapper.get('.calendar-heading').text()).toContain('November 10');
});

it('reopens a recent email without waiting for a second detail request',async()=>{await email().trigger('click');await flushPromises();const details=()=>mocks.quickGet.mock.calls.filter(([url])=>url.endsWith('/conversations/41')).length;expect(details()).toBe(1);await historyBack();await email().trigger('click');await flushPromises();expect(details()).toBe(1);expect(wrapper.find('.email-reader').exists()).toBe(true);});

it('keeps Today fixed first and preserves saved order across navigation',async()=>{const nav=()=>wrapper.findAll('[aria-label="Primary navigation"]>button').map(b=>b.text().replace(/\d+|…/g,'').trim());const initial=nav();expect(initial).toEqual(['Today','My Work','Tasks','Messages','More']);await router.push('/mobile/workspace?view=tasks');await flushPromises();await router.push('/mobile/workspace?view=home');await flushPromises();expect(nav()).toEqual(initial);expect(wrapper.get('.qv-fixed-shortcut').text()).toContain('Today');expect(mocks.quickPatch.mock.calls.some(([url,body])=>url.endsWith('/messages/preferences')&&body.usage)).toBe(false);});
it('loads the unread badge independently of the active message list',async()=>{expect(mocks.quickGet.mock.calls.some(([url,config])=>url.endsWith('/messages/inbox')&&config?.params?.countsOnly==='1')).toBe(true);expect(wrapper.findAll('[aria-label="Primary navigation"]>button').find(b=>b.text().includes('Messages')).text()).toContain('312');});
it('preserves Notifications in browser history when opening another agency client',async()=>{await wrapper.get('.qv-top-actions [aria-label="Notifications"]').trigger('click');await flushPromises();await vi.waitFor(()=>expect(wrapper.find('.mobile-notifications').exists()).toBe(true));const notifications=wrapper.findComponent(MobileNotifications);expect(notifications.isVisible()).toBe(true);notifications.vm.$emit('open',{related_entity_type:'client',related_entity_id:42,agency_id:20});await flushPromises();expect(router.currentRoute.value.query).toMatchObject({view:'client',agencyId:'20',clientId:'42'});expect(mocks.request.mock.calls.some(([r])=>r.url==='/workspace')).toBe(false);await historyBack();expect(router.currentRoute.value.query.mobilePanel).toBe('notifications');expect(wrapper.findComponent(MobileNotifications).isVisible()).toBe(true);});
