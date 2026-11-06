import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createMemoryHistory,createRouter} from 'vue-router';
const mocks=vi.hoisted(()=>({request:vi.fn(),get:vi.fn(),post:vi.fn(),quickPost:vi.fn()}));
vi.mock('../transport.js',()=>({native:false,MobileDevice:{},quickApiBase:'/api/quick-view',mobileApi:{request:mocks.request,get:mocks.get,post:mocks.post},randomSecret:()=>'',pkceChallenge:vi.fn(),accountUrl:()=>'',mobileRequestError:e=>e.response?.data?.error?.message || e.message}));
vi.mock('axios',()=>({default:{post:mocks.quickPost,interceptors:{response:{use:vi.fn(),eject:vi.fn()}}}}));
import MobileApp from '../MobileApp.vue';
const profile={user:{id:1,firstName:'Test',email:'test@example.invalid'},workspace:{id:10,name:'My workspace'},agencies:[{id:10,name:'My workspace'}]};
async function app(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push('/mobile');return mount(MobileApp,{global:{plugins:[router],stubs:{QuickView:{props:['mobileSession'],emits:['locked','account'],template:'<div data-testid="private-workspace"><button @click="$emit(\'locked\')">Test lock</button><button @click="$emit(\'account\')">My Account</button>Private inbox</div>'}}}});}
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();localStorage.clear();history.replaceState(null,'','/mobile');mocks.quickPost.mockResolvedValue({});mocks.get.mockResolvedValue({data:profile});mocks.request.mockResolvedValue({data:{signedIn:true,needsCode:false,workspace:profile.workspace}});});
it('unlocks the scoped account and locks without signing the device out',async()=>{
  const wrapper=await app();await flushPromises();expect(wrapper.text()).toContain('Your account is still signed in');
  mocks.request.mockResolvedValue({data:{sessionToken:'short-lived',userId:1,agencyId:10,expiresAt:new Date(Date.now()+600000),profile}});
  await wrapper.find('input[type=password]').setValue('123456');await wrapper.find('form').trigger('submit');await flushPromises();
  expect(wrapper.text()).toContain('Private inbox');expect(sessionStorage.length).toBe(0);expect(localStorage.length).toBe(0);
  await wrapper.find('[data-testid=private-workspace] button').trigger('click');await flushPromises();
  expect(wrapper.text()).not.toContain('Private inbox');expect(wrapper.text()).toContain('Welcome back');
  expect(mocks.request.mock.calls.some(([request])=>request.url==='/logout')).toBe(false);
  expect(mocks.quickPost).toHaveBeenCalledWith('/api/quick-view/session/logout',{},expect.objectContaining({headers:{'X-Quick-View-Session':'short-lived'}}));
  wrapper.unmount();
});
it('clears private content when the browser goes to the background',async()=>{
  const wrapper=await app();await flushPromises();mocks.request.mockResolvedValue({data:{sessionToken:'short-lived',profile}});
  await wrapper.find('input').setValue('123456');await wrapper.find('form').trigger('submit');await flushPromises();
  vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();
  expect(wrapper.find('[data-testid=private-workspace]').exists()).toBe(false);wrapper.unmount();
});
it('rejects a mismatched sign-in state and reopens the existing device instead of resetting its code',async()=>{
  history.replaceState(null,'','/mobile/callback?code=untrusted&state=wrong');
  sessionStorage.setItem('auricwell.mobile.pending',JSON.stringify({state:'expected',verifier:'private',createdAt:Date.now()}));
  const wrapper=await app();await flushPromises();expect(wrapper.text()).toContain('Welcome back');expect(wrapper.text()).not.toContain('Confirm code');expect(mocks.post).not.toHaveBeenCalled();wrapper.unmount();
});

it('resumes a retained sign-in with no mandatory code when app lock is off',async()=>{
  mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{signedIn:true,workspace:profile.workspace,appLock:{method:'none',hasCode:false}}:{sessionToken:'open-session',profile:{...profile,appLock:{method:'none',hasCode:false}}}}));
  const wrapper=await app();await flushPromises();expect(wrapper.text()).toContain('Private inbox');expect(wrapper.find('input[type=password]').exists()).toBe(false);
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({url:'/resume'}));wrapper.unmount();
});
it('offers app lock as an optional account setting after primary sign-in',async()=>{
  history.replaceState(null,'','/mobile/callback?code=verified-code&state=expected');
  sessionStorage.setItem('auricwell.mobile.pending',JSON.stringify({state:'expected',verifier:'private',callback:'https://auricwell.com/mobile/callback',clientId:'web',createdAt:Date.now()}));
  mocks.post.mockResolvedValue({data:{sessionToken:'fresh-primary-session',newDevice:true,profile:{...profile,appLock:{method:'none',hasCode:false}}}});
  const wrapper=await app();await flushPromises();expect(wrapper.text()).toContain('App lock · optional');expect(wrapper.text()).toContain('Not now');
  expect(wrapper.findAll('input[type=password]')).toHaveLength(0);
  await wrapper.findAll('button').find(b=>b.text().includes('Not now')).trigger('click');expect(wrapper.text()).toContain('Private inbox');wrapper.unmount();
});

it('does not let a late account response reset a chosen code option',async()=>{
  mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{signedIn:true,workspace:profile.workspace,appLock:{method:'none',hasCode:false}}:{sessionToken:'open-session',profile:{...profile,appLock:{method:'none',hasCode:false}}}}));
  const wrapper=await app();await flushPromises();let finishProfile;
  mocks.get.mockImplementation(()=>new Promise(resolve=>finishProfile=resolve));
  await wrapper.findAll('button').find(button=>button.text()==='My Account').trigger('click');
  await wrapper.find('#mobile-app-lock').setValue('code');
  finishProfile({data:{...profile,appLock:{method:'none',hasCode:false}}});await flushPromises();
  expect(wrapper.find('#mobile-app-lock').element.value).toBe('code');expect(wrapper.findAll('input[type=password]')).toHaveLength(2);wrapper.unmount();
});

it('restores a cached page using the existing device rather than a new enrollment',async()=>{
  const wrapper=await app();await flushPromises();
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));await flushPromises();
  expect(wrapper.text()).toContain('Welcome back');expect(wrapper.text()).not.toContain('Confirm code');
  expect(mocks.post).not.toHaveBeenCalled();expect(mocks.request.mock.calls.filter(([request])=>request.url==='/session')).toHaveLength(2);wrapper.unmount();
});
