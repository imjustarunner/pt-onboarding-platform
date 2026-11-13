import pool from '../config/database.js';
import {isAuricwellQaAgency,allowQaExchangeRecipient} from '../utils/auricwellQaPolicy.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
export function normalizeQaContactScope(body={},workflowId) {
  if(Object.keys(body).some(key=>!['agencyId','clientId','providerUserId','elapsedHours'].includes(key)))fail(400,'Only the exact QA client, provider and48/96-hour stage may be supplied.');
  const scope={agencyId:Number(body.agencyId),clientId:Number(body.clientId),providerUserId:Number(body.providerUserId),workflowId:Number(workflowId)};
  if(scope.agencyId!==450||![scope.clientId,scope.providerUserId,scope.workflowId].every(positive)||![48,96].includes(Number(body.elapsedHours)))fail(400,'Choose one QA450 workflow and elapsedHours48 or96.');
  return {scope,elapsedHours:Number(body.elapsedHours)};
}
/** No request flag can turn a real tenant/client/provider into a QA fixture. */
export async function requireQaContactScope(actorUserId,scope,db=pool) {
  const [[row]]=await db.execute(`SELECT qa.id,qa.slug,qa.feature_flags,w.id AS workflow_id,w.initial_sent_at,w.second_contact_at,w.final_contact_at,
    provider.id AS provider_id,provider.email AS provider_email,provider.role AS provider_role,provider.is_demo AS provider_demo,
    JSON_UNQUOTE(JSON_EXTRACT(initial_message.to_json,'$[0].email')) AS initial_recipient_email
    FROM school_contact_workflows w JOIN clients c ON c.id=w.client_id AND c.agency_id=w.agency_id
    JOIN agencies qa ON qa.id=w.agency_id
    JOIN users actor ON actor.id=? AND actor.is_active=1 AND COALESCE(actor.is_archived,0)=0 AND actor.terminated_at IS NULL AND actor.status IN ('ACTIVE','ACTIVE_EMPLOYEE') AND actor.role IN ('admin','super_admin','superadmin')
    JOIN user_agencies membership ON membership.user_id=actor.id AND membership.agency_id=qa.id AND membership.is_active=1
    JOIN users provider ON provider.id=w.provider_user_id AND provider.is_active=1 AND COALESCE(provider.is_archived,0)=0 AND provider.terminated_at IS NULL AND provider.status='ACTIVE_EMPLOYEE' AND provider.is_demo=1
    JOIN user_agencies provider_member ON provider_member.user_id=provider.id AND provider_member.agency_id=qa.id AND provider_member.is_active=1
    JOIN school_contact_workflow_steps initial_step ON initial_step.workflow_id=w.id AND initial_step.step_key='initial_email' AND initial_step.status='sent' AND initial_step.message_id IS NOT NULL
    JOIN communication_messages initial_message ON initial_message.id=initial_step.message_id AND initial_message.conversation_id=w.conversation_id
      AND initial_message.author_user_id=provider.id AND initial_message.direction='outbound' AND initial_message.send_status IN ('sent','delivered')
    WHERE qa.id=450 AND qa.is_active=1 AND COALESCE(qa.is_archived,0)=0 AND c.is_demo=1 AND COALESCE(c.session_sms_opt_in,0)=0
      AND w.agency_id=? AND w.client_id=? AND w.provider_user_id=? AND w.id=? AND w.initial_sent_at IS NOT NULL LIMIT 1`,
  [Number(actorUserId),scope.agencyId,scope.clientId,scope.providerUserId,scope.workflowId]);
  if(!row||!isAuricwellQaAgency(row)||!allowQaExchangeRecipient(row,{id:row.provider_id,email:row.provider_email,role:row.provider_role,is_demo:row.provider_demo}))fail(403,'This action requires an active QA450 administrator, Demo client/provider, email-only fixture and its ordinarily sent introduction.');
  return row;
}
