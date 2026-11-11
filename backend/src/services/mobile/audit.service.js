import {logAuditEvent} from '../auditEvent.service.js';
const actions=new Set(['connected','unlocked','locked','lock_configured','signed_out','workspace_changed','primary_expired']);
/** Link the existing central request/read evidence to this verified device actor. */
export async function identifyMobileContext(req,context){
 if(!context?.user?.id||!context?.device?.id)return;
 req.mobileAuditContext=context;
 await req.auditIdentify?.({...context.user,sessionId:`mobile:${Number(context.device.id)}`});
}
/** Lifecycle metadata only: never include codes, tokens, message text, or PHI. */
export function createMobileActionAudit({log=logAuditEvent}={}){
 return async(req,action,context=req.mobileAuditContext)=>{
  if(!actions.has(action)||!context?.user?.id||!context?.device?.id)return;
  return log(req,{actionType:`mobile_${action}`,userId:Number(context.user.id),agencyId:Number(context.workspace?.id||context.device.agency_id)||null,targetType:'mobile_device_session',targetId:Number(context.device.id),metadata:{surface:'mobile',appClient:String(context.device.client_id||'').slice(0,40)}});
 };
}
export const auditMobileAction=createMobileActionAudit();
