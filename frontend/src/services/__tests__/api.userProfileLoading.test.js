import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({handler:null}));
vi.mock('axios',()=>({default:{create:()=>({interceptors:{request:{use:handler=>{m.handler=handler;}},response:{use:vi.fn()}}})}}));
import '../api.js';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();window.history.replaceState({},'','/practice/admin/users/20');});
it.each(['/users/20/communications','/users/20/preferences','/activity-log/user/20','/clients/4/clinical-responses'])('keeps %s inline on a user profile',async url=>{
 const config=await m.handler({url,method:'get',headers:{}});expect(config.skipGlobalLoading).toBe(true);expect(config.__globalLoadingId).toBeUndefined();
});
