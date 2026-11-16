import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({request:null,begin:vi.fn(()=>1)}));
vi.mock('axios',()=>({default:{create:()=>({interceptors:{request:{use:handler=>{m.request=handler;}},response:{use:vi.fn()}}})}}));
vi.mock('../../utils/pageLoader',()=>({begin:m.begin,end:vi.fn()}));
vi.mock('../../utils/sessionTimeoutBranding',()=>({isSessionEndedRedirecting:()=>false,isSessionEndedPath:()=>false}));
vi.mock('../../utils/loginRedirect',()=>({getLoginUrlForRedirect:()=>'/login'}));
import '../api.js';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();m.begin.mockClear();});
afterEach(()=>vi.unstubAllGlobals());
function location(pathname,agency={id:6,slug:'nlu'}){
 vi.stubGlobal('window',{location:{hostname:'app.itsco.health',pathname,href:pathname},dispatchEvent:vi.fn()});
 localStorage.setItem('currentAgency',JSON.stringify(agency));
}
it.each(['/nlu/admin/hiring/start-pre-hire/42','/nlu-qa-demo/admin/hiring/start-pre-hire/42','/admin/hiring/start-pre-hire/42'])('keeps draft saves, preview and nested editor reads inline on %s',async path=>{
 location(path);
 for(const [method,url] of [['put','/hiring/candidates/42/prehire-draft'],['post','/contracts/candidates/42/preview'],['get','/onboarding-packages/7']]){
  const result=await m.request({method,url,headers:{},data:{draft:{schedule:'Mondays'}}});
  expect(result.skipGlobalLoading).toBe(true);
  expect(result.headers['X-Agency-Id']).toBe('6');
 }
 expect(m.begin).not.toHaveBeenCalled();
});
it.each(['/itsco/admin/hiring/start-pre-hire/42','/admin/hiring/start-pre-hire/42'])('preserves ITSCO hiring loading behavior on %s',async path=>{
 location(path,{id:2,slug:'itsco'});
 const result=await m.request({method:'put',url:'/hiring/candidates/42/prehire-draft',headers:{}});
 expect(result.skipGlobalLoading).not.toBe(true);expect(m.begin).toHaveBeenCalledOnce();
});
it('does not suppress unrelated NLU page loading',async()=>{
 location('/nlu/admin/hiring');
 await m.request({method:'get',url:'/hiring/candidates',headers:{}});
 expect(m.begin).toHaveBeenCalledOnce();
});
it('supports shared-app entry when the saved organization supplies only its ID or portal URL',async()=>{
 for(const agency of [{id:6},{id:453,portal_url:'nlu-qa-demo'}]){
  location('/admin/hiring/start-pre-hire/42',agency);
  const result=await m.request({method:'put',url:'/hiring/candidates/42/prehire-draft',headers:{}});
  expect(result.skipGlobalLoading).toBe(true);
 }
 expect(m.begin).not.toHaveBeenCalled();
});
