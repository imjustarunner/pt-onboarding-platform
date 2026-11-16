import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({handler:null}));
vi.mock('axios',()=>({default:{create:()=>({interceptors:{request:{use:handler=>{m.handler=handler;}},response:{use:vi.fn()}}})}}));
import '../api.js';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('currentAgency',JSON.stringify({id:2}));});
const config=()=>({url:'/clients/12/chart-import/drafts',method:'get',headers:{},skipGlobalLoading:true});
it('preserves the explicit chart agency when walking into a different tenant',async()=>{
 const request=config();request.headers['X-Agency-Id']='3';expect((await m.handler(request)).headers['X-Agency-Id']).toBe('3');
});
it('uses the active agency when the caller did not specify a chart context',async()=>{
 expect((await m.handler(config())).headers['X-Agency-Id']).toBe('2');
});
it('recognizes case-insensitive explicit headers and cookie-only authentication',async()=>{
 const lower=config();lower.headers['x-agency-id']='3';expect((await m.handler(lower)).headers['X-Agency-Id']).toBe('3');
 const cookie=config();cookie.cookieAuthOnly=true;expect((await m.handler(cookie)).headers['X-Agency-Id']).toBeUndefined();
});
