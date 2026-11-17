import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import {TreatmentPlanAckLink} from '../models/TreatmentPlanAckLink.model.js';
import {familyNotificationDeliveryGate} from './familyNotificationChoices.service.js';
import {clientEmailContext,sendClientPortalEmail} from './clientPortalEmail.service.js';
import {portalUrlWithLocale} from './familyPortalLocale.service.js';

export function planReviewEmail(locale,url){
 const es=locale==='es';
 return {subject:es?'Su plan está listo para revisar':'Your plan is ready to review',linkUrl:url,linkLabel:es?'Revisar y aprobar el plan':'Review and approve your plan',
  text:es?`Hay un plan de tratamiento disponible en su portal seguro. Inicie sesión para revisarlo y dar su aprobación.\n\n${url}`:`A treatment plan is available in your secure portal. Sign in to review it and add your approval.\n\n${url}`};
}
/** Called under the plan publication lock. An uncertain or queued send is never repeated. */
export async function deliverGuardianPlanNotice({plan,guardian,link,locale='en'},deps={}){
 if(link.status==='signed')return {complete:true};
 const previous=link.meta_json?.emailDelivery;
 if(previous?.status==='sent')return {complete:true};
 if(previous?.status==='queued'&&previous.communicationId){
  const db=deps.db||(await import('../config/database.js')).default;
  const [[communication]]=await db.execute('SELECT delivery_status FROM user_communications WHERE id=? AND agency_id=? AND client_id=? AND user_id=?',[previous.communicationId,plan.agency_id,plan.client_id,guardian.guardian_user_id]);
  if(['sent','delivered'].includes(communication?.delivery_status)){await (deps.update||TreatmentPlanAckLink.updateFields.bind(TreatmentPlanAckLink))(link.id,{meta:{...link.meta_json,emailDelivery:{...previous,status:'sent'}}});return {complete:true};}
 }
 if(['sending','unknown','queued'].includes(previous?.status))return {complete:false};
 const to=String(guardian.email||'').trim();
 if(!to||Number(guardian.is_active)!==1||!['client','client_guardian'].includes(guardian.role)||guardian.terminated_at||Number(guardian.is_archived)===1)return {complete:false};
 if(guardian.status_expires_at&&new Date(guardian.status_expires_at)<=new Date())return {complete:false};
 const gate=await (deps.gate||familyNotificationDeliveryGate)({agencyId:plan.agency_id,clientId:plan.client_id,to,templateType:'guardian_plan_review',notificationCategory:'documents'});
 if(!gate.allowed)return {complete:false};
 const context=await (deps.context||clientEmailContext)({agencyId:plan.agency_id,clientId:plan.client_id});
 const url=new URL(context.url('guardian'));url.searchParams.set('clientId',String(plan.client_id));
 const deliveryMeta={attemptedAt:new Date().toISOString(),recipientHash:crypto.createHash('sha256').update(to.toLowerCase()).digest('hex')};
 const save=async status=>{await (deps.update||TreatmentPlanAckLink.updateFields.bind(TreatmentPlanAckLink))(link.id,{meta:{...link.meta_json,emailDelivery:{...deliveryMeta,...status}}});};
 await save({status:'sending'});
 let result;
 try{result=await (deps.send||sendClientPortalEmail)({agencyId:plan.agency_id,clientId:plan.client_id,context,to,userId:guardian.guardian_user_id,
  ...planReviewEmail(locale,portalUrlWithLocale(url.toString(),locale)),templateType:'guardian_plan_review',notificationCategory:'documents',source:'auto',generatedByUserId:null});}
 catch{await save({status:'unknown'});return {complete:false};}
 const queued=!!(result?.queued||result?.pendingApproval);
 const sent=!!result?.id&&!result.blocked&&!result.skipped&&!queued;
 await save({status:sent?'sent':queued?'queued':'blocked',communicationId:result?.id||null});
 return {complete:sent};
}
/** Persisted intent survives missing portal accounts, email and transient publishing failures. */
export async function queueGuardianPlanDelivery(plan,db=clinicalPool){
 if(!plan||!['active','final','finalized'].includes(plan.status))return;
 await db.execute("UPDATE clinical_treatment_plans SET client_ack_status='awaiting_portal' WHERE id=? AND agency_id=? AND client_id=? AND status IN ('active','final','finalized')",[plan.id,plan.agency_id,plan.client_id]);
}
export async function retryPendingGuardianPlans({db=clinicalPool,load=ClinicalTreatmentPlan.findById.bind(ClinicalTreatmentPlan),share=null}={}){
 const [rows]=await db.execute("SELECT id FROM clinical_treatment_plans WHERE status IN ('active','final','finalized') AND client_ack_status='awaiting_portal' ORDER BY COALESCE(updated_at,created_at),id LIMIT 25");
 const publish=share||(await import('./guardianPlanProgress.service.js')).shareGuardianPlanRevision;
 for(const row of rows){try{const plan=await load(row.id);if(plan?.client_ack_status==='awaiting_portal')await publish({plan,actorUserId:null});}catch(error){console.warn('[guardian-plan-delivery] Pending publication requires retry',error?.code||'unavailable');}}
 return {checked:rows.length};
}
