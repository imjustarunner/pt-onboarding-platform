import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createMemoryHistory,createRouter} from 'vue-router';
const mocks=vi.hoisted(()=>({request:vi.fn(),get:vi.fn(),post:vi.fn(),quickPost:vi.fn(),auth:{user:null}}));
vi.mock('../../store/auth.js',()=>({useAuthStore:()=>mocks.auth}));
vi.mock('../transport.js',()=>({native:false,apiOrigin:'',MobileDevice:{},quickApiBase:'/api/quick-view',mobileApi:{request:mocks.request,get:mocks.get,post:mocks.post},randomSecret:()=>'',pkceChallenge:vi.fn(),accountUrl:()=>'',mobileRequestError:e=>e.response?.data?.error?.message || e.message}));
vi.mock('axios',()=>({default:{get:mocks.get,post:mocks.quickPost,interceptors:{response:{use:vi.fn(),eject:vi.fn()}}}}));
vi.mock('../../services/api',()=>({default:{get:mocks.get,post:mocks.quickPost}}));
import MobileApp from '../MobileApp.vue';
async function openWorkspace(wrapper){await flushPromises();await wrapper.get('input[type=password]').setValue('123456');await wrapper.get('form').trigger('submit');await flushPromises();}
const profile={user:{id:1,firstName:'Test',email:'test@example.invalid'},workspace:{id:10,name:'My workspace'},agencies:[{id:10,name:'My workspace'}]};
async function app(path='/mobile'){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push(path);return mount(MobileApp,{global:{plugins:[router],stubs:{AccountSecurityPanel:{template:'<div>Existing account verification</div>'},QuickView:{props:['mobileSession'],emits:['locked','account','open-workspace-item','refresh-session'],template:'<div data-testid="private-workspace"><button @click="$emit(\'locked\')">Test lock</button><button @click="$emit(\'account\')">My Account</button>Private inbox</div>'}}}});}
beforeEach(()=>{vi.restoreAllMocks();vi.resetAllMocks();sessionStorage.clear();localStorage.clear();history.replaceState(null,'','/mobile');mocks.quickPost.mockResolvedValue({});mocks.get.mockResolvedValue({data:profile});mocks.request.mockResolvedValue({data:{signedIn:true,needsCode:false,workspace:profile.workspace}});});
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

it('requires account-code unlock even for an existing device that previously opted out',async()=>{
 mocks.request.mockResolvedValue({data:{signedIn:true,workspace:profile.workspace,appLock:{method:'none',hasCode:false}}});const wrapper=await app();await flushPromises();expect(wrapper.text()).not.toContain('Private inbox');expect(wrapper.get('input[type=password]').exists()).toBe(true);expect(mocks.request.mock.calls.some(([request])=>request.url==='/resume')).toBe(false);wrapper.unmount();
});

it('requires app lock after primary sign-in and reuses the account code instead of creating a device PIN',async()=>{
 history.replaceState(null,'','/mobile/callback?code=verified-code&state=expected');sessionStorage.setItem('auricwell.mobile.pending',JSON.stringify({state:'expected',verifier:'private',callback:'https://auricwell.com/mobile/callback',clientId:'web',createdAt:Date.now()}));mocks.post.mockResolvedValue({data:{sessionToken:'fresh-primary-session',newDevice:true,profile:{...profile,appLock:{method:'none',hasCode:false}}}});const wrapper=await app();await flushPromises();expect(wrapper.text()).toContain('App lock · required');expect(wrapper.text()).not.toContain('Not now');expect(wrapper.text()).toContain('Existing account Quick View code');expect(wrapper.find('option[value=none]').exists()).toBe(false);expect(wrapper.findAll('input[type=password]')).toHaveLength(1);expect(wrapper.text()).not.toContain('New six-digit code');wrapper.unmount();
});

it('does not let a late account response erase an entered account-code confirmation',async()=>{
 mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{signedIn:true,workspace:profile.workspace,appLock:{method:'code',hasCode:true}}:{sessionToken:'open-session',profile:{...profile,appLock:{method:'code',hasCode:true}}}}));const wrapper=await app();await openWorkspace(wrapper);let finishProfile;mocks.get.mockImplementation(()=>new Promise(resolve=>finishProfile=resolve));await wrapper.findAll('button').find(button=>button.text()==='My Account').trigger('click');await wrapper.get('.account input[type=password]').setValue('654321');finishProfile({data:{...profile,appLock:{method:'code',hasCode:true}}});await flushPromises();expect(wrapper.get('.account input[type=password]').element.value).toBe('654321');expect(wrapper.findAll('input[type=password]')).toHaveLength(1);wrapper.unmount();
});

it('restores a cached page using the existing device rather than a new enrollment',async()=>{
  const wrapper=await app();await flushPromises();
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));await flushPromises();
  expect(wrapper.text()).toContain('Welcome back');expect(wrapper.text()).not.toContain('Confirm code');
  expect(mocks.post).not.toHaveBeenCalled();expect(mocks.request.mock.calls.filter(([request])=>request.url==='/session')).toHaveLength(2);wrapper.unmount();
});

it('switches the device workspace before opening another agency’s note',async()=>{
 mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{signedIn:true,workspace:profile.workspace,appLock:{method:'none',hasCode:false}}:url==='/workspace'?{sessionToken:'agency-20',agencyId:20,userId:1,profile:{...profile,workspace:{id:20,name:'School'},appLock:{method:'none',hasCode:false}}}:{sessionToken:'agency-10',agencyId:10,userId:1,profile:{...profile,appLock:{method:'none',hasCode:false}}}}));
 const wrapper=await app();await openWorkspace(wrapper);const router=wrapper.vm.$router;await router.replace('/mobile/workspace?view=mywork&workTab=started&workAgency=20');
 wrapper.findComponent('[data-testid="private-workspace"]').vm.$emit('open-workspace-item',{agencyId:20,query:{view:'clinical',workId:'work_20',clientId:'120'}});await flushPromises();
 expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({url:'/workspace',data:{agencyId:20},headers:{'X-Quick-View-Session':'agency-10'}}));
 expect(router.currentRoute.value.query).toMatchObject({view:'clinical',workId:'work_20'});expect(wrapper.findComponent('[data-testid="private-workspace"]').props('mobileSession').agencyId).toBe(20);
 await router.back();await flushPromises();expect(router.currentRoute.value.query).toMatchObject({view:'mywork',workTab:'started',workAgency:'20'});wrapper.unmount();
});
it('shows a failed workspace switch without opening an unauthorized note',async()=>{
 mocks.request.mockImplementation(async({url})=>{if(url==='/workspace')throw {response:{status:403,data:{error:{message:'Workspace access changed'}}}};return {data:url==='/session'?{signedIn:true,workspace:profile.workspace,appLock:{method:'none',hasCode:false}}:{sessionToken:'agency-10',profile:{...profile,appLock:{method:'none',hasCode:false}}}};});
 const wrapper=await app();await openWorkspace(wrapper);wrapper.findComponent('[data-testid="private-workspace"]').vm.$emit('open-workspace-item',{agencyId:20,query:{view:'clinical',noteId:'90'}});await flushPromises();expect(wrapper.get('[role="alert"]').text()).toContain('Workspace access changed');expect(wrapper.vm.$route.query.noteId).toBeUndefined();expect(wrapper.findComponent('[data-testid="private-workspace"]').props('mobileSession').sessionToken).toBe('agency-10');wrapper.unmount();
});
it('offers retry and an explicit account change when connect refuses a retained primary account',async()=>{
 history.replaceState(null,'','/mobile/connect?clientId=web&challenge='+('a'.repeat(43))+'&state='+('b'.repeat(43))+'&loginPath=%2Fitsco%2Flogin');
 mocks.get.mockRejectedValue({response:{status:403,data:{error:{message:'This account cannot use the staff mobile workspace.'}}}});
 const wrapper=await app();await flushPromises();expect(wrapper.text()).toContain('Sign in with a different account');expect(wrapper.text()).toContain('Try again');
 await wrapper.findAll('button').find(b=>b.text()==='Try again').trigger('click');await flushPromises();expect(mocks.get).toHaveBeenCalledTimes(2);expect(mocks.quickPost).not.toHaveBeenCalledWith('/api/auth/logout',expect.anything(),expect.anything());wrapper.unmount();
});

it('starts with username rather than requiring an organization name, and uses the existing school choice resolver',async()=>{mocks.request.mockRejectedValue({response:{status:401}});mocks.quickPost.mockResolvedValue({data:{needsOrgChoice:true,orgOptions:[{id:20,name:'Synthetic school',slug:'synthetic-school'}]}});const wrapper=await app();await flushPromises();expect(wrapper.text()).toContain('Username or email');expect(wrapper.text()).not.toContain('Organization workspace');await wrapper.get('input[autocomplete="username"]').setValue('school.staff@example.invalid');await wrapper.get('form').trigger('submit');await flushPromises();expect(mocks.quickPost).toHaveBeenCalledWith('/api/auth/identify',{username:'school.staff@example.invalid',surface:'schoolcarebridge'});expect(wrapper.text()).toContain('Synthetic school');wrapper.unmount();});

it('keeps the device disconnected until the existing account verification succeeds',async()=>{
 history.replaceState(null,'','/mobile/connect?clientId=web&challenge='+('a'.repeat(43))+'&state='+('b'.repeat(43))+'&loginPath=%2Fitsco%2Flogin');
 mocks.get.mockRejectedValueOnce({response:{status:403,data:{error:{code:'MFA_REQUIRED'}}}}).mockResolvedValueOnce({data:{id:1,first_name:'Synthetic',last_name:'Parent',email:'parent@example.invalid',role:'client_guardian'}});
 const wrapper=await app();await vi.waitFor(()=>expect(wrapper.text()).toContain('Verify your sign-in'));await vi.waitFor(()=>expect(wrapper.text()).toContain('Existing account verification'));expect(mocks.post).not.toHaveBeenCalled();
 mocks.get.mockResolvedValue({data:{...profile,surface:'family'}});await wrapper.findAll('button').find(b=>b.text().includes('continue connecting')).trigger('click');await flushPromises();expect(wrapper.text()).toContain('Continue as Test');expect(wrapper.text()).not.toContain('Verify your sign-in');expect(mocks.post).not.toHaveBeenCalled();wrapper.unmount();
});

it('keeps the exact secure-comment destination after normal family Unlock without forwarding unrelated query data',async()=>{
 const family={...profile,surface:'family',user:{...profile.user,role:'client_guardian'},workspace:{...profile.workspace,portal_url:'qa-family'}};
 const wrapper=await app('/mobile?secureCommentAppointmentId=101&secureCommentClientId=10&token=do-not-forward');await flushPromises();
 mocks.request.mockResolvedValue({data:{sessionToken:'short-lived',userId:1,agencyId:10,expiresAt:new Date(Date.now()+600000),profile:family}});
 await wrapper.find('input[type=password]').setValue('123456');await wrapper.find('form').trigger('submit');await flushPromises();
 expect(wrapper.vm.$route.path).toBe('/mobile/family/qa-family/guardian');expect(wrapper.vm.$route.query).toEqual({panel:'appointments',secureCommentAppointmentId:'101',secureCommentClientId:'10',childId:'10'});wrapper.unmount();
});

it('starts a fresh staff workspace in Today',async()=>{mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{workspace:profile.workspace,appLock:{method:'none'}}:{sessionToken:'same-token',userId:1,agencyId:10,expiresAt:new Date(Date.now()+600000).toISOString(),profile:{...profile,appLock:{method:'none'}}}}));const w=await app();await openWorkspace(w);expect(w.vm.$router.currentRoute.value.query.view).toBe('calendar');w.unmount();});
it('immediately unmounts the private workspace when leaving and never resumes without unlock',async()=>{
 mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{workspace:profile.workspace,appLock:{method:'code'}}:{sessionToken:'same-token',profile:{...profile,appLock:{method:'code'}}}}));const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await openWorkspace(w);hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);expect(mocks.quickPost).toHaveBeenCalledWith('/api/quick-view/session/logout',{},expect.anything());hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(w.text()).toContain('Welcome back');expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);expect(mocks.request.mock.calls.some(([r])=>r.url==='/resume')).toBe(false);w.unmount();hidden.mockRestore();
});

it('does not uncover the workspace when a delayed foreground status completes after another background transition',async()=>{
 mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{workspace:profile.workspace,appLock:{method:'code'}}:{sessionToken:'same-token',profile:{...profile,appLock:{method:'code'}}}}));const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await openWorkspace(w);hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();let finishStatus;mocks.request.mockImplementationOnce(()=>new Promise(resolve=>finishStatus=resolve));hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();finishStatus({data:{workspace:profile.workspace,appLock:{method:'code'}}});await flushPromises();expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);w.unmount();hidden.mockRestore();
});

it('discards an in-flight unlock when the app closes before it completes',async()=>{
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await flushPromises();let finishUnlock;mocks.request.mockImplementationOnce(()=>new Promise(resolve=>finishUnlock=resolve));await w.get('input[type=password]').setValue('123456');await w.get('form').trigger('submit');hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();finishUnlock({data:{sessionToken:'late-token',profile}});await flushPromises();expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);expect(w.text()).toContain('Welcome back');w.unmount();hidden.mockRestore();
});

it('requires explicit unlock when the app is initially loaded in the background',async()=>{
 mocks.request.mockImplementation(async()=>({data:{workspace:profile.workspace,appLock:{method:'none'}}}));const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true),w=await app();await flushPromises();expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(w.text()).toContain('Welcome back');expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);expect(mocks.request.mock.calls.some(([r])=>r.url==='/resume')).toBe(false);w.unmount();hidden.mockRestore();
});

it('shows a newly assigned random account code once before revealing the first workspace',async()=>{
 history.replaceState(null,'','/mobile/callback?code=verified-code&state=expected');sessionStorage.setItem('auricwell.mobile.pending',JSON.stringify({state:'expected',verifier:'private',callback:'https://auricwell.com/mobile/callback',clientId:'web',createdAt:Date.now()}));mocks.post.mockResolvedValue({data:{sessionToken:'fresh',newDevice:true,initialAccountCode:'081527',profile:{...profile,appLock:{method:'code',usesAccountCode:true}}}});const w=await app();await flushPromises();expect(w.get('output').text()).toBe('081527');expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);await w.findAll('button').find(b=>b.text().includes('I saved my code')).trigger('click');await flushPromises();expect(w.text()).toContain('Private inbox');expect(w.text()).not.toContain('081527');expect(localStorage.length).toBe(0);w.unmount();
});
it('locks when pagehide occurs even if the browser has not emitted visibilitychange',async()=>{mocks.request.mockImplementation(async({url})=>({data:url==='/session'?{workspace:profile.workspace,appLock:{method:'code'}}:{sessionToken:'active',profile}}));const w=await app();await openWorkspace(w);window.dispatchEvent(new Event('pagehide'));await flushPromises();expect(w.find('[data-testid=private-workspace]').exists()).toBe(false);expect(w.text()).toContain('Welcome back');w.unmount();});
