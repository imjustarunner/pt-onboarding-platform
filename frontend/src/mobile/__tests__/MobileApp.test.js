import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createMemoryHistory,createRouter} from 'vue-router';
const mocks=vi.hoisted(()=>({request:vi.fn(),get:vi.fn(),post:vi.fn(),quickPost:vi.fn(),auth:{user:null}}));
vi.mock('../../store/auth.js',()=>({useAuthStore:()=>mocks.auth}));
vi.mock('../transport.js',()=>({native:false,apiOrigin:'',MobileDevice:{},quickApiBase:'/api/quick-view',mobileApi:{request:mocks.request,get:mocks.get,post:mocks.post},randomSecret:()=>'',pkceChallenge:vi.fn(),accountUrl:()=>'',mobileRequestError:e=>e.response?.data?.error?.message || e.message || 'Please try again.'}));
vi.mock('axios',()=>({default:{get:mocks.get,post:mocks.quickPost,interceptors:{response:{use:vi.fn(),eject:vi.fn()}}}}));
vi.mock('../../services/api',()=>({default:{get:mocks.get,post:mocks.quickPost}}));
import MobileApp from '../MobileApp.vue';
const profile={surface:'staff',user:{id:1,firstName:'Test',email:'test@example.invalid'},workspace:{id:10,name:'My workspace'},agencies:[{id:10,name:'My workspace'},{id:20,name:'School'}],appLock:{method:'code',hasCode:true,usesAccountCode:true}};
let result,requestHandler,wrappers=[];
const locked=()=>Promise.reject({response:{status:423,data:{error:{code:'MOBILE_LOCKED',message:'Activity timer expired.'}}}});
async function app(path='/mobile'){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push(path);
 const wrapper=mount(MobileApp,{global:{plugins:[router],stubs:{AccountSecurityPanel:{template:'<div>Existing account verification</div>'},MobileFamilyPortal:{props:['profile','privateVisible'],template:'<div data-testid="family">Family portal</div>'},QuickView:{props:['mobileSession','privacyHidden','notificationUnread'],emits:['locked','account','open-workspace-item','refresh-session','session-expiry'],template:'<div data-testid="private-workspace"><button @click="$emit(\'locked\')">Test lock</button><button @click="$emit(\'account\')">My Account</button>Private inbox</div>'}}}});wrappers.push(wrapper);await flushPromises();return wrapper;
}
async function openWorkspace(wrapper){await wrapper.get('input[type=password]').setValue('123456');await wrapper.get('form').trigger('submit');await flushPromises();}
function privateView(w){return w.findComponent('[data-testid=private-workspace]');}
beforeEach(()=>{
 vi.restoreAllMocks();vi.resetAllMocks();sessionStorage.clear();localStorage.clear();history.replaceState(null,'','/mobile');
 result={sessionToken:'same-token',userId:1,agencyId:10,expiresAt:new Date(Date.now()+3600000).toISOString(),profile};
 requestHandler=async({url})=>{if(url==='/session')return {data:{signedIn:true,userId:1,needsCode:false,workspace:profile.workspace,appLock:profile.appLock}};if(url==='/resume')return locked();return {data:result};};
 mocks.request.mockImplementation(r=>requestHandler(r));mocks.quickPost.mockResolvedValue({});mocks.get.mockResolvedValue({data:profile});
});
afterEach(()=>{for(const w of wrappers)w.unmount();wrappers=[];vi.useRealTimers();});
it('unlocks with the existing account code and manual lock clears the server activity grant without signing out',async()=>{
 const w=await app();await openWorkspace(w);expect(privateView(w).exists()).toBe(true);
 await privateView(w).find('button').trigger('click');await flushPromises();expect(privateView(w).exists()).toBe(false);expect(w.text()).toContain('Welcome back');
 expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({method:'POST',url:'/lock'}));expect(mocks.request.mock.calls.some(([r])=>r.url==='/logout')).toBe(false);
});
it('immediately covers private content on background and resumes the same mounted view without another code or timer reset',async()=>{
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await openWorkspace(w);const vm=privateView(w).vm,deadline=result.expiresAt;
 hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(w.classes()).toContain('privacy-hidden');expect(privateView(w).vm).toBe(vm);expect(w.find('.mobile-privacy-cover').exists()).toBe(true);
 requestHandler=async()=>({data:result});hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();
 expect(w.classes()).not.toContain('privacy-hidden');expect(privateView(w).vm).toBe(vm);expect(privateView(w).props('mobileSession').expiresAt).toBe(deadline);expect(mocks.request.mock.calls.some(([r])=>r.url==='/lock')).toBe(false);
});
it('requires account unlock when the server says the activity window expired while away',async()=>{
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await openWorkspace(w);hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();
 expect(privateView(w).exists()).toBe(false);expect(w.get('input[type=password]').exists()).toBe(true);expect(w.text()).toContain('Your activity timer has ended');
});
it('automatically restores a valid retained grant at startup without challenging for the code',async()=>{
 requestHandler=async({url})=>({data:url==='/session'?{workspace:profile.workspace,appLock:profile.appLock}:result});const w=await app();expect(privateView(w).exists()).toBe(true);expect(w.find('input[type=password]').exists()).toBe(false);expect(mocks.request.mock.calls.some(([r])=>r.url==='/unlock')).toBe(false);
});
it('fresh password or SSO exchange opens immediately with optional setup instead of a PIN acknowledgement',async()=>{
 history.replaceState(null,'','/mobile/callback?code=verified&state=expected');sessionStorage.setItem('auricwell.mobile.pending',JSON.stringify({state:'expected',verifier:'private',callback:'https://auricwell.com/mobile/callback',clientId:'web',createdAt:Date.now()}));mocks.post.mockResolvedValue({data:{...result,newDevice:true,initialAccountCode:'081527'}});
 const w=await app();expect(privateView(w).exists()).toBe(true);expect(w.text()).toContain('Set up access');expect(w.text()).not.toContain('081527');expect(w.find('.mobile-card.account').exists()).toBe(false);
 await w.findAll('button').find(b=>b.text()==='Set up access').trigger('click');await flushPromises();expect(w.get('output').text()).toBe('081527');expect(w.find('select[value=none]').exists()).toBe(false);expect(Object.values(localStorage).join('')).not.toContain('081527');
});
it('retains only the account username for a password-manager-compatible code form, never the code or grant',async()=>{
 const w=await app();await openWorkspace(w);await privateView(w).find('button').trigger('click');await flushPromises();
 expect(w.get('input[name=username]').attributes('autocomplete')).toBe('username');expect(w.get('input[name=password]').attributes('autocomplete')).toBe('current-password');expect(w.get('input[name=username]').element.value).toBe('test@example.invalid');
 expect(Object.values(localStorage)).toEqual(['test@example.invalid']);expect(sessionStorage.length).toBe(0);
});
it('does not retry account-code guesses automatically or erase the entered code after a network failure',async()=>{
 const w=await app();const initial=requestHandler;requestHandler=async r=>{if(r.url==='/unlock')throw {code:'ERR_NETWORK',message:'Network error'};return initial(r);};
 await openWorkspace(w);expect(w.get('input[name=password]').element.value).toBe('123456');expect(mocks.request.mock.calls.filter(([r])=>r.url==='/unlock')).toHaveLength(1);expect(w.text()).toContain('Network error');
 requestHandler=async()=>({data:result});await w.get('form').trigger('submit');await flushPromises();expect(privateView(w).exists()).toBe(true);expect(mocks.request.mock.calls.filter(([r])=>r.url==='/unlock')).toHaveLength(2);
});
it('keeps private content covered after a transient resume failure and permits manual retry',async()=>{
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await openWorkspace(w);hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));requestHandler=async()=>{throw {code:'ERR_NETWORK',message:'Network error'};};hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();
 expect(w.classes()).toContain('privacy-hidden');expect(w.text()).toContain('Try again');requestHandler=async()=>({data:result});await w.get('.mobile-privacy-cover button').trigger('click');await flushPromises();expect(w.classes()).not.toContain('privacy-hidden');
});
it('does not uncover a delayed foreground response after another background transition',async()=>{
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await openWorkspace(w);hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));let finish;requestHandler=()=>new Promise(resolve=>finish=resolve);hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));finish({data:result});await flushPromises();expect(w.classes()).toContain('privacy-hidden');
});
it('keeps an unlock completed in the background covered until a foreground server recheck succeeds',async()=>{
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();let finish;requestHandler=()=>new Promise(resolve=>finish=resolve);await w.get('input[type=password]').setValue('123456');await w.get('form').trigger('submit');hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));finish({data:result});await flushPromises();expect(w.classes()).toContain('privacy-hidden');
 requestHandler=async()=>({data:result});hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(privateView(w).exists()).toBe(true);expect(w.classes()).not.toContain('privacy-hidden');
});
it('covers pagehide even without visibilitychange and rechecks a cached pageshow',async()=>{
 const w=await app();await openWorkspace(w);window.dispatchEvent(new Event('pagehide'));await flushPromises();expect(w.classes()).toContain('privacy-hidden');requestHandler=async()=>({data:result});window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));await flushPromises();expect(w.classes()).not.toContain('privacy-hidden');expect(privateView(w).exists()).toBe(true);
});
it('keeps a background initial load private, then resumes the unexpired device on foreground',async()=>{
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true),w=await app();expect(privateView(w).exists()).toBe(false);expect(mocks.request.mock.calls.filter(([r])=>r.url==='/resume')).toHaveLength(0);
 requestHandler=async()=>({data:result});hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(privateView(w).exists()).toBe(true);expect(w.classes()).not.toContain('privacy-hidden');
});
it('synchronizes server expiry updates from Quick View and locks on the actual deadline',async()=>{
 vi.useFakeTimers();const w=await app();await openWorkspace(w);const deadline=new Date(Date.now()+5000).toISOString();privateView(w).vm.$emit('session-expiry',deadline);await flushPromises();expect(privateView(w).props('mobileSession').expiresAt).toBe(deadline);await vi.advanceTimersByTimeAsync(5001);await flushPromises();expect(privateView(w).exists()).toBe(false);
});
it('invalidated or 30-day-expired grants require primary sign-in rather than another unlock',async()=>{
 requestHandler=async({url})=>{if(url==='/session')return {data:{workspace:profile.workspace,appLock:profile.appLock}};throw {response:{status:401,data:{error:{code:'MOBILE_SIGN_IN_REQUIRED',message:'Primary sign-in is required every 30 days.'}}}};};const w=await app();expect(w.text()).toContain('Welcome to AuricWell');expect(w.text()).toContain('Primary sign-in is required every 30 days');expect(privateView(w).exists()).toBe(false);
});
it('connects one unified workspace without an agency selector, retaining explicit account verification',async()=>{
 history.replaceState(null,'','/mobile/connect?clientId=web&challenge='+('a'.repeat(43))+'&state='+('b'.repeat(43))+'&loginPath=%2Fitsco%2Flogin');const w=await app();expect(w.text()).toContain('Continue as Test');expect(w.find('select').exists()).toBe(false);mocks.post.mockRejectedValue(new Error('synthetic stop before redirect'));await w.findAll('button').find(b=>b.text().includes('Connect to Auricwell')).trigger('click');await flushPromises();expect(mocks.post).toHaveBeenCalledWith('/authorize',expect.objectContaining({expectedUserId:1}));expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('agencyId');
});
it('identifies the mobile account without forcing the SchoolCareBridge school chooser',async()=>{
 requestHandler=async()=>{throw {response:{status:401}};};mocks.quickPost.mockResolvedValue({data:{needsOrgChoice:true,orgOptions:[{id:20,name:'Ambiguous school',slug:'synthetic-school'}]}});const w=await app();await w.get('input[autocomplete=username]').setValue('staff@example.invalid');await w.get('form').trigger('submit');await flushPromises();expect(mocks.quickPost).toHaveBeenCalledWith('/api/auth/identify',{username:'staff@example.invalid',surface:'auricwell-mobile'});expect(w.text()).toContain('Ambiguous school');
});
it('keeps the device disconnected until existing MFA verification succeeds',async()=>{
 history.replaceState(null,'','/mobile/connect?clientId=web&challenge='+('a'.repeat(43))+'&state='+('b'.repeat(43))+'&loginPath=%2Fitsco%2Flogin');mocks.get.mockRejectedValueOnce({response:{status:403,data:{error:{code:'MFA_REQUIRED'}}}}).mockResolvedValueOnce({data:{id:1,first_name:'Synthetic',last_name:'Parent',email:'parent@example.invalid',role:'client_guardian'}});const w=await app();await vi.waitFor(()=>expect(w.text()).toContain('Existing account verification'));expect(mocks.post).not.toHaveBeenCalled();
 mocks.get.mockResolvedValue({data:{...profile,surface:'family'}});await w.findAll('button').find(b=>b.text().includes('continue connecting')).trigger('click');await flushPromises();expect(w.text()).toContain('Continue as Test');expect(mocks.post).not.toHaveBeenCalled();
});
it('switches internal authorized context before opening another agency note and preserves the source route',async()=>{
 const w=await app();await openWorkspace(w);await w.vm.$router.replace('/mobile/workspace?view=mywork&workTab=started&workAgency=20');requestHandler=async({url})=>{expect(url).toBe('/workspace');return {data:{...result,sessionToken:'agency-20',agencyId:20,profile:{...profile,workspace:{id:20,name:'School'}}}};};privateView(w).vm.$emit('open-workspace-item',{agencyId:20,query:{view:'clinical',workId:'work_20',clientId:'120'}});await flushPromises();expect(w.vm.$route.query).toMatchObject({view:'clinical',workId:'work_20'});expect(privateView(w).props('mobileSession').agencyId).toBe(20);await w.vm.$router.back();await flushPromises();expect(w.vm.$route.query).toMatchObject({view:'mywork',workTab:'started',workAgency:'20'});
});
it('never opens a note when fresh context authorization refuses the agency',async()=>{
 const w=await app();await openWorkspace(w);requestHandler=async()=>{throw {response:{status:403,data:{error:{message:'Workspace access changed'}}}};};privateView(w).vm.$emit('open-workspace-item',{agencyId:20,query:{view:'clinical',noteId:'90'}});await flushPromises();expect(w.get('[role=alert]').text()).toContain('Workspace access changed');expect(w.vm.$route.query.noteId).toBeUndefined();expect(privateView(w).props('mobileSession').sessionToken).toBe('same-token');
});
it('retains the exact secure-comment family destination through normal account unlock',async()=>{
 const family={...profile,surface:'family',user:{...profile.user,role:'client_guardian'},workspace:{...profile.workspace,portal_url:'qa-family'}};result={...result,profile:family};const w=await app('/mobile?secureCommentAppointmentId=101&secureCommentClientId=10&token=do-not-forward');await openWorkspace(w);expect(w.vm.$route.path).toBe('/mobile/family/qa-family/guardian');expect(w.vm.$route.query).toEqual({panel:'appointments',secureCommentAppointmentId:'101',secureCommentClientId:'10',childId:'10'});
});

it('retains known notification count across a same-account replacement token while refreshing in the background',async()=>{
 const initial=requestHandler;requestHandler=async r=>r.url==='/notification-count'?{data:{_total:12}}:initial(r);const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await openWorkspace(w);expect(privateView(w).props('notificationUnread')).toBe(12);
 hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));result={...result,sessionToken:'replacement-same-account'};requestHandler=async r=>{if(r.url==='/notification-count')throw {code:'ERR_NETWORK'};return {data:result};};hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(privateView(w).props('mobileSession').sessionToken).toBe('replacement-same-account');expect(privateView(w).props('notificationUnread')).toBe(12);
});

it('keeps an unknown notification count distinct from an authoritative zero',async()=>{
 const initial=requestHandler;requestHandler=async r=>{if(r.url==='/notification-count')throw {code:'ERR_NETWORK'};return initial(r);};const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false),w=await app();await openWorkspace(w);expect(privateView(w).props('notificationUnread')).toBeNull();
 hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));requestHandler=async r=>({data:r.url==='/notification-count'?{_total:0}:result});hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();expect(privateView(w).props('notificationUnread')).toBe(0);
});
