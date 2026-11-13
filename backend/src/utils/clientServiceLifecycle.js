export const SERVICE_STATUSES = Object.freeze({active:'Active services',discontinued:'Discontinued services',completed:'Completed services',terminated:'Terminated services',canceled:'Canceled services'});
export const SERVICE_CLOSURE_REASONS=Object.freeze({client_choice:'Services were discontinued at your request.',care_completed:'This course of services has been completed.',discontinued_contact:'Services were discontinued because we were unable to re-establish contact.',provider_transition:'Services with this provider have ended.',other:'Services with this provider have ended. Contact the team if you have questions.'});
export const portalServiceStatus=service=>serviceStatus(service)==='terminated'&&service.closure_reason==='discontinued_contact'?'discontinued':serviceStatus(service);
export function serviceStatus(service={}) {
  const saved=Object.hasOwn(SERVICE_STATUSES,service.service_status)?service.service_status:'active';
  return Number(service.is_active)===1?saved:saved==='active'?'discontinued':saved;
}
export function terminalProfile(client={}) {
  return ['terminated','archived','dead'].includes(String(client.client_status_key||client.status_key||'').toLowerCase())
    ||['ARCHIVED','TERMINATED'].includes(client.status)||String(client.client_status_label||'').toLowerCase().includes('terminated');
}
export function servicePortalAccess(client,services=[],serviceId=null) {
  const selected=serviceId?services.find(s=>Number(s.id)===Number(serviceId)):null;
  const status=terminalProfile(client)?(selected&&serviceStatus(selected)!=='active'?portalServiceStatus(selected):'terminated'):selected?portalServiceStatus(selected):services.length&&!services.some(s=>serviceStatus(s)==='active')?portalServiceStatus(services[0]):'active';
  return {limited:status!=='active',status,statusLabel:SERVICE_STATUSES[status],reason:selected?.client_end_reason||null,endedAt:selected?.ended_at||null,serviceId:selected?.id||null};
}
export function decorateService(service){const status=serviceStatus(service),portalStatus=portalServiceStatus(service);return {...service,service_status:status,status_label:SERVICE_STATUSES[status],portal_status:portalStatus,portal_status_label:SERVICE_STATUSES[portalStatus],portal_limited:status!=='active'};}
