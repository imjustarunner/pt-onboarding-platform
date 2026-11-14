export const LIMITED_SERVICE_PANELS=['past_providers','overview','history','appointments','billing','payment_methods','documents','account','help','records','signout'];
export function endedServiceAccess(profile,service){
 const terminal=['terminated','archived','dead'].includes(String(profile?.client_status_key||'').toLowerCase())||['ARCHIVED','TERMINATED'].includes(profile?.status);
 const selected=service?.portal_status||(service?.closure_reason==='discontinued_contact'?'discontinued':service?.service_status)||(service?.is_active!=null&&Number(service.is_active)!==1?'discontinued':profile?.portal_access?.status||'active');
 const status=terminal&&selected==='active'?'terminated':selected;
 return {limited:terminal||status!=='active'||service?.portal_limited===true,status,statusLabel:status==='terminated'&&selected==='active'?'Terminated services':service?.portal_status_label||service?.status_label||({active:'Active services',discontinued:'Discontinued services',terminated:'Terminated services',canceled:'Canceled services',completed:'Completed services'})[status]||profile?.portal_access?.statusLabel,reason:service?.client_end_reason||profile?.portal_access?.reason||null,endedAt:service?.ended_at||profile?.portal_access?.endedAt||null};
}
