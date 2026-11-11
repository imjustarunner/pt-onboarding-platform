import {beforeEach,expect,it,vi} from 'vitest';
const intercepted=vi.hoisted(()=>({request:null}));
vi.mock('axios',()=>({default:{create:()=>({interceptors:{request:{use:handler=>{intercepted.request=handler;}},response:{use:vi.fn()}}})}}));
let handoff;
beforeEach(async()=>{
 vi.resetModules();localStorage.clear();sessionStorage.clear();
 window.history.replaceState(null,'','/');
 handoff=await import('../mobileMainHandoff.js');
});
function prepare(path='/admin/clients/55?mobileHandoff=1&mobileHandoffAgency=2'){
 window.history.replaceState(null,'',path);return handoff.prepareMobileMainHandoff();
}
function completeFixture(){
 const data={id:7,role:'provider',requiresPasswordChange:true,authMethod:'mobile',loginBootstrap:{sessionId:'mobile-main-session',authMethod:'mobile',agencies:[{id:2,name:'Verified target'},{id:3,name:'Another practice'}],security:{policy:{useLockScreen:true},session:{phase:'active',expiresAt:'2026-11-11T15:05:00Z'}}}};
 const api={get:vi.fn(async()=>({data}))},authStore={clearAuth:vi.fn(),setAuth:vi.fn()},agencyStore={setCurrentAgency:vi.fn(),applyLoginAgencies:vi.fn(),chooseOrganization:vi.fn()},startActivityTracking=vi.fn();
 return {data,api,authStore,agencyStore,startActivityTracking,handoff:{agencyId:2,path:'/admin/clients/55'}};
}
it('consumes only the public navigation marker before store initialization and retains saved work',()=>{
 for(const key of ['authToken','user','sessionId','currentAgency','userAgencies','pt_chosen_organization'])localStorage.setItem(key,'old-account');
 for(const key of ['__pt_demo_window_token__','__pt_demo_window_user__','__pt_demo_window_agency__','__pt_demo_window_path__','__pt_platform_mode__'])sessionStorage.setItem(key,'old-demo');
 localStorage.setItem('clinical-note-draft','Keep this draft');localStorage.setItem('appearance','large');
 const result=prepare('/itsco/admin/clients/55?mobileHandoff=1&mobileHandoffAgency=2#section');
 expect(result).toEqual({agencyId:2,path:'/itsco/admin/clients/55#section'});expect(window.location.search).toBe('');
 expect(localStorage.getItem('authToken')).toBeNull();expect(localStorage.getItem('currentAgency')).toBeNull();expect(sessionStorage.getItem('__pt_demo_window_token__')).toBeNull();
 expect(localStorage.getItem('clinical-note-draft')).toBe('Keep this draft');expect(localStorage.getItem('appearance')).toBe('large');expect(handoff.mobileMainCookieSessionOnly()).toBe(true);
});
it.each(['/login?mobileHandoff=1&mobileHandoffAgency=2','/my-schedule?mobileHandoff=0&mobileHandoffAgency=2','/my-schedule?mobileHandoff=1','/my-schedule?mobileHandoff=1&mobileHandoffAgency=invalid','/my-schedule?mobileHandoff=1&mobileHandoff=1&mobileHandoffAgency=2'])('does not replace ordinary auth or public sign-in for an invalid marker %s',path=>{
 localStorage.setItem('authToken','existing');expect(prepare(path)).toBeNull();expect(localStorage.getItem('authToken')).toBe('existing');expect(handoff.mobileMainCookieSessionOnly()).toBe(false);
});
it('accepts canonical path-based full schedule navigation',()=>{expect(prepare('/parent/child/my-schedule?mobileHandoff=1&mobileHandoffAgency=2')).toMatchObject({agencyId:2,path:'/parent/child/my-schedule'});});
it('uses only the verified cookie, selects its member agency and retains ordinary password/MFA policy',async()=>{
 const f=completeFixture();expect(await handoff.completeMobileMainHandoff(f)).toBe('verified');
 expect(f.api.get).toHaveBeenCalledWith('/users/me',{params:{loginBootstrap:'1'},cookieAuthOnly:true,skipAuthRedirect:true,skipGlobalLoading:true,timeout:20000});
 expect(f.authStore.clearAuth).toHaveBeenCalledOnce();expect(f.authStore.setAuth).toHaveBeenCalledWith(null,expect.objectContaining({id:7,authMethod:'mobile',requiresPasswordChange:true}),'mobile-main-session');
 expect(f.authStore.setAuth.mock.calls[0][1]).not.toHaveProperty('loginBootstrap');expect(f.agencyStore.chooseOrganization).toHaveBeenCalledWith({id:2,name:'Verified target'});
 expect(f.startActivityTracking).toHaveBeenCalledWith({bootstrap:{...f.data.loginBootstrap.security,userId:7,sessionId:'mobile-main-session'}});
});
it.each(['google','password',null])('does not authenticate a query marker against an unrelated %s cookie',async method=>{
 const f=completeFixture();f.data.loginBootstrap.authMethod=method;await expect(handoff.completeMobileMainHandoff(f)).rejects.toThrow('Reopen');expect(f.authStore.setAuth).not.toHaveBeenCalled();expect(f.startActivityTracking).not.toHaveBeenCalled();
});
it('rejects target agencies missing from verified memberships and preserves an expired-cookie denial',async()=>{
 const f=completeFixture();f.handoff.agencyId=99;await expect(handoff.completeMobileMainHandoff(f)).rejects.toThrow('Reopen');expect(f.authStore.setAuth).not.toHaveBeenCalled();
 const expired=completeFixture();expired.api.get.mockRejectedValue({response:{status:401}});await expect(handoff.completeMobileMainHandoff(expired)).rejects.toMatchObject({response:{status:401}});expect(expired.authStore.setAuth).not.toHaveBeenCalled();
});
it('storage-denied stale bearer tokens cannot override the handoff cookie while explicit agency context remains usable',async()=>{
 localStorage.setItem('authToken','old-bearer');sessionStorage.setItem('__pt_demo_window_token__','old-demo');
 window.history.replaceState(null,'','/my-schedule?mobileHandoff=1&mobileHandoffAgency=2');
 const denied={removeItem:()=>{throw new Error('Storage denied');}};
 handoff.prepareMobileMainHandoff({storage:denied,session:denied});await import('../../services/api.js');
 const request=intercepted.request({url:'/users/me',method:'get',headers:{},skipGlobalLoading:true});expect(request.headers.Authorization).toBeUndefined();
 const scoped=intercepted.request({url:'/clinical-notes',method:'get',headers:{'X-Agency-Id':'2'},skipGlobalLoading:true});expect(scoped.headers['X-Agency-Id']).toBe('2');expect(scoped.headers.Authorization).toBeUndefined();
});
