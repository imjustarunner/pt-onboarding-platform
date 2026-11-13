import {beforeEach,it,expect,vi} from 'vitest';
import {createSharedReadAdapter,isPayrollWorkspacePath,sharedReadScope} from '../sharedReads';
const config=(extra={})=>({method:'get',url:'/secure-session-comments/today',baseURL:'/api',params:{timeZone:'America/Denver'},headers:{Authorization:'synthetic-account-a','X-Agency-ID':'2'},...extra});
const uri=c=>c.url+JSON.stringify(c.params || {});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
it('shares a burst of identical reads, isolates each response, and fetches again after completion',async()=>{
 let finish;const network=vi.fn(()=>new Promise(resolve=>{finish=resolve}));const read=createSharedReadAdapter(network,uri);const a=config(),b=config();const one=read(a),two=read(b);await Promise.resolve();expect(network).toHaveBeenCalledTimes(1);finish({data:{appointments:[{id:1}]},status:200});const[x,y]=await Promise.all([one,two]);x.data.appointments[0].id=9;expect(y.data.appointments[0].id).toBe(1);expect(x.config).toBe(a);expect(y.config).toBe(b);
 network.mockResolvedValue({data:{appointments:[]}});await read(config());expect(network).toHaveBeenCalledTimes(2);
});
it('does not share another account, agency, query, credential mode, or login session',async()=>{
 const network=vi.fn(async()=>({data:{}}));let scope='session-a';const read=createSharedReadAdapter(network,uri,()=>scope);
 const requests=[read(config()),read(config({headers:{Authorization:'synthetic-account-b','X-Agency-ID':'2'}})),read(config({headers:{Authorization:'synthetic-account-a','X-Agency-ID':'6'}})),read(config({params:{timeZone:'UTC'}})),read(config({withCredentials:false}))];scope='session-b';requests.push(read(config()));await Promise.all(requests);expect(network).toHaveBeenCalledTimes(6);
});
it('never shares mutations, cancelable requests, downloads, unknown endpoints or unidentified sessions',async()=>{
 const network=vi.fn(async()=>({data:{}})),read=createSharedReadAdapter(network,uri);
 for(const patch of [{method:'patch'},{signal:new AbortController().signal},{cancelToken:{}},{responseType:'arraybuffer'},{url:'/payroll/import-rows/9'}])await Promise.all([read(config(patch)),read(config(patch))]);
 const unknown=createSharedReadAdapter(network,uri,()=>null);await Promise.all([unknown(config()),unknown(config())]);expect(network).toHaveBeenCalledTimes(12);
});
it('keeps failure configuration per caller and retries a later read',async()=>{
 const error=Object.assign(new Error('Network failed'),{response:{status:503}});const network=vi.fn().mockRejectedValueOnce(error).mockResolvedValue({data:{}});const read=createSharedReadAdapter(network,uri),a=config(),b=config();const result=await Promise.allSettled([read(a),read(b)]);expect(result[0].reason.message).toBe('Network failed');expect(result[0].reason.config).toBe(a);expect(result[1].reason.config).toBe(b);await read(config());expect(network).toHaveBeenCalledTimes(2);
});
it('scopes cookie-based reads to the signed-in user and session and recognizes only payroll routes',()=>{
 expect(sharedReadScope()).toBeNull();localStorage.setItem('user',JSON.stringify({id:1,role:'admin'}));localStorage.setItem('sessionId','one');localStorage.setItem('currentAgency',JSON.stringify({id:2}));const first=sharedReadScope();localStorage.setItem('currentAgency',JSON.stringify({id:2,name:'Hydrated name'}));expect(sharedReadScope()).toBe(first);localStorage.setItem('sessionId','two');expect(sharedReadScope()).not.toBe(first);
 expect(isPayrollWorkspacePath('/nlu/admin/payroll/wizard/12')).toBe(true);expect(isPayrollWorkspacePath('/itsco/admin/payroll')).toBe(true);expect(isPayrollWorkspacePath('/admin/payroll-settings')).toBe(false);
});

it('works as an Axios adapter after real request and response transformations',async()=>{
 const {default:axios}=await import('axios');let finish;const network=vi.fn(()=>new Promise(resolve=>{finish=resolve})),http=axios.create();http.defaults.adapter=createSharedReadAdapter(network,c=>http.getUri(c));
 const first=http.get('/users/7/preferences',{params:{agencyId:2}}),second=http.get('/users/7/preferences',{params:{agencyId:2}});await Promise.resolve();expect(network).toHaveBeenCalledTimes(1);finish({data:'{"timezone":"America/Denver"}',status:200,headers:{},statusText:'OK'});const[a,b]=await Promise.all([first,second]);expect(a.data.timezone).toBe('America/Denver');expect(b.data.timezone).toBe('America/Denver');
});

it('never reuses a read that started before a related write completed',async()=>{
 const finishes=[];const network=vi.fn(c=>c.method==='get'?new Promise(resolve=>finishes.push(resolve)):Promise.resolve({data:{ok:true}}));const read=createSharedReadAdapter(network,uri),path='/payroll/me/indirect-time-session';const old=read(config({url:path}));await Promise.resolve();await read(config({method:'post',url:path+'/clock-out'}));const fresh=read(config({url:path}));await Promise.resolve();expect(network).toHaveBeenCalledTimes(3);finishes[1]({data:{active:false}});expect((await fresh).data.active).toBe(false);finishes[0]({data:{active:true}});await old;
});
it('keeps sharing unrelated background reads while a payroll row is saved',async()=>{
 let finish;const network=vi.fn(c=>c.method==='get'?new Promise(resolve=>{finish=resolve}):Promise.resolve({data:{ok:true}}));const read=createSharedReadAdapter(network,uri);const first=read(config());await Promise.resolve();await read(config({method:'patch',url:'/payroll/import-rows/4'}));const second=read(config());await Promise.resolve();expect(network).toHaveBeenCalledTimes(2);finish({data:{}});await Promise.all([first,second]);
});

it.each(['/office-schedule/locations/1/weekly-grid','/availability/providers/501/school-weekdays','/company-events'])('coalesces duplicate navigation reads: %s',async url=>{
 let finish;const network=vi.fn(()=>new Promise(resolve=>{finish=resolve}));const read=createSharedReadAdapter(network,uri);
 const requests=[read(config({url,params:{weekStart:'2026-11-23'}})),read(config({url,params:{weekStart:'2026-11-23'}})),read(config({url,params:{weekStart:'2026-11-23'}}))];
 await Promise.resolve();expect(network).toHaveBeenCalledTimes(1);finish({data:{slots:[]}});await Promise.all(requests);
});
it('refreshes the office grid after a booking instead of joining an older read',async()=>{
 const finishes=[];const network=vi.fn(c=>c.method==='get'?new Promise(resolve=>finishes.push(resolve)):Promise.resolve({data:{ok:true}}));const read=createSharedReadAdapter(network,uri);
 const old=read(config({url:'/office-schedule/locations/1/weekly-grid'}));await Promise.resolve();await read(config({method:'post',url:'/office-schedule/booking-requests'}));
 const fresh=read(config({url:'/office-schedule/locations/1/weekly-grid'}));await Promise.resolve();expect(network).toHaveBeenCalledTimes(3);finishes.forEach(f=>f({data:{}}));await Promise.all([old,fresh]);
});
