// This marker contains navigation state only. The server-verified HttpOnly
// cookie is the credential; a query parameter never authenticates anyone.
let cookieSessionOnly=false;
export const mobileMainCookieSessionOnly=()=>cookieSessionOnly;
const localKeys=['authToken','user','sessionId','currentAgency','userAgencies','pt_chosen_organization'];
const sessionKeys=['__pt_demo_window_token__','__pt_demo_window_user__','__pt_demo_window_agency__','__pt_demo_window_path__','__pt_platform_mode__','justLoggedIn','justLoggedInAt'];

/** Run before creating auth/agency stores or starting Router. Retain drafts and preferences. */
export function prepareMobileMainHandoff({location=window.location,history=window.history,storage=localStorage,session=sessionStorage}={}){
 const url=new URL(location.href);
 if(url.searchParams.getAll('mobileHandoff').length!==1||url.searchParams.get('mobileHandoff')!=='1'||
  !/^(?:\/[a-z0-9-]+){0,2}\/(?:admin\/clients\/[1-9]\d*|my-schedule)\/?$/i.test(url.pathname))return null;
 const agencyRaw=url.searchParams.get('mobileHandoffAgency');
 const agencyId=/^[1-9]\d*$/.test(agencyRaw||'')?Number(agencyRaw):null;
 if(!Number.isSafeInteger(agencyId))return null;
 cookieSessionOnly=true;
 for(const key of localKeys){try{storage.removeItem(key);}catch{/* Cookie-only requests also prevent a storage-denied stale bearer. */}}
 for(const key of sessionKeys){try{session.removeItem(key);}catch{/* Optional browser storage. */}}
 url.searchParams.delete('mobileHandoff');url.searchParams.delete('mobileHandoffAgency');
 const path=`${url.pathname}${url.search}${url.hash}`;
 history.replaceState(history.state,'',path);
 return {agencyId,path};
}

/** Validate the new cookie before importing any protected main-app workspace. */
export async function completeMobileMainHandoff({api,authStore,agencyStore,handoff,startActivityTracking}){
 if(!handoff)return 'skipped';
 authStore.clearAuth();
 const {data}=await api.get('/users/me',{params:{loginBootstrap:'1'},cookieAuthOnly:true,skipAuthRedirect:true,skipGlobalLoading:true,timeout:20000});
 const {loginBootstrap,...user}=data||{};
 const agencies=Array.isArray(loginBootstrap?.agencies)?loginBootstrap.agencies:[];
 const agency=agencies.find(entry=>Number(entry.id)===handoff.agencyId);
 if(!Number.isSafeInteger(Number(user.id))||Number(user.id)<1||loginBootstrap?.authMethod!=='mobile'||!loginBootstrap?.sessionId||!agency)throw new Error('Reopen the main app from AuricWell.');
 authStore.setAuth(null,user,loginBootstrap.sessionId);
 agencyStore.setCurrentAgency(null);agencyStore.applyLoginAgencies(agencies);agencyStore.setCurrentAgency(agency);
 // Save only the verified member workspace explicitly opened from mobile.
 agencyStore.chooseOrganization?.(agency);
 await startActivityTracking({bootstrap:{...loginBootstrap.security,userId:user.id,sessionId:loginBootstrap.sessionId}});
 return 'verified';
}
