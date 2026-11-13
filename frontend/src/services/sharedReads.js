// Share only pending JSON reads; never cache a completed response or a mutation.
export const isPayrollWorkspacePath=path=>/\/admin\/payroll(?:\/|$)/.test(String(path || '')) || /^\/(?:fundthred\/)?noteworthy\/app(?:\/|$)/.test(String(path || ''));
const sharedPath=path=>/\/(?:office-schedule\/locations\/\d+\/weekly-grid|users\/\d+\/schedule-summary|availability\/providers\/\d+\/school-weekdays|company-events|users\/\d+\/preferences|secure-session-comments\/today|family-billing\/insurance-cards\/review-queue|availability\/admin\/skill-builders\/options|communications\/center-summary|payroll\/me\/indirect-time-session)$/.test(path);
export function sharedReadScope() {
  try {
    const user=JSON.parse(localStorage.getItem('user') || 'null');
    const session=localStorage.getItem('sessionId'),token=localStorage.getItem('authToken');
    if(!user?.id && !session && !token)return null;
    return JSON.stringify([user?.id,user?.role,session,token,JSON.parse(localStorage.getItem('currentAgency') || 'null')?.id,sessionStorage.getItem('__pt_demo_window_token__'),sessionStorage.getItem('__pt_demo_window_agency__')]);
  }catch{return null;}
}
const readGroup=path=>{
  if(/\/(?:office-schedule|office-slots|appointments|company-events)(?:\/|$)|\/users\/\d+\/schedule-(?:events|summary)(?:\/|$)|\/availability\//.test(path))return 'scheduling';
  const preferences=path.match(/\/users\/(\d+)\/preferences(?:\/|$)/);
  if(preferences)return `preferences:${preferences[1]}`;
  for(const group of ['/secure-session-comments','/family-billing/insurance-cards','/availability/admin/skill-builders','/communications','/payroll/me/indirect-time-session'])if(path.includes(group+'/') || path.endsWith(group))return group;
  return null;
};
export function createSharedReadAdapter(adapter,uriFor,scopeFor=()=>true) {
  const pending=new Map();
  return config=>{
    const scope=scopeFor(config);
    const url=String(config.url || '').split('?')[0],method=String(config.method || 'get').toLowerCase(),group=readGroup(url);
    if(!['get','head'].includes(method) && group) {
      // A refresh after a write must never join a read started before that write.
      const invalidate=()=>{for(const[key,entry]of pending)if(entry.group===group)pending.delete(key);};
      invalidate();return Promise.resolve().then(()=>adapter(config)).finally(invalidate);
    }
    if(scope===null || String(config.method || 'get').toLowerCase()!=='get' || !sharedPath(url) || config.signal || config.cancelToken || (config.responseType && config.responseType!=='json'))return adapter(config);
    const headers=Object.entries(config.headers?.toJSON?.() || config.headers || {}).map(([k,v])=>[k.toLowerCase(),v]).sort(([a],[b])=>a.localeCompare(b));
    // Final request headers include the actual agency, authentication, and demo context.
    const key=JSON.stringify([scope,config.baseURL,uriFor(config),headers,config.timeout,config.withCredentials,config.responseType]);
    let entry=pending.get(key),request=entry?.request;
    if(!request){request=Promise.resolve().then(()=>adapter(config)).finally(()=>{if(pending.get(key)?.request===request)pending.delete(key);});pending.set(key,{request,group});}
    return request.then(response=>({...response,config,data:response.data && typeof response.data==='object'?JSON.parse(JSON.stringify(response.data)):response.data}),error=>{const own=Object.defineProperties(Object.create(Object.getPrototypeOf(error)),Object.getOwnPropertyDescriptors(error));own.config=config;if(error.response)own.response={...error.response,config};throw own;});
  };
}
