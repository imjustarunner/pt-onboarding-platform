import {assistantError,ASSISTANT_OWNER_EMAIL} from './assistantTeamPolicy.js';
import { requireStaffPlanActor } from '../utils/planStaffAccess.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
export async function assertHumanAssistantReviewer(actor,proposal,db){
 const [[user]]=await db.execute('SELECT id,role,email,is_active,is_archived,is_assistant_account FROM users WHERE id=?',[Number(actor?.id)||0]);
 if(!user||!user.is_active||user.is_archived||user.is_assistant_account||user.role==='assistant')throw assistantError(403,'HUMAN_REVIEW_REQUIRED','An authorized human reviewer is required.');
 let member=null;
 if(user.role!=='super_admin'){
  [[member]]=await db.execute('SELECT user_id,has_payroll_access,has_billing_access FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[user.id,proposal.agency_id]);if(!member)throw assistantError(403,'HUMAN_REVIEW_SCOPE','This recommendation belongs to another agency.');
 }
 const granted=value=>[true,1,'1'].includes(value);
 const payroll=String(proposal.task_kind).startsWith('payroll.'),billing=proposal.task_kind==='billing.review';
 if(user.role!=='super_admin'&&((payroll&&!granted(member?.has_payroll_access))||(billing&&!granted(member?.has_billing_access))))throw assistantError(403,'HUMAN_REVIEW_SCOPE','This recommendation requires the agency’s delegated payroll or billing access.');
 if(['clinical.review','compliance.review'].includes(proposal.task_kind)){
  requireStaffPlanActor(user);
  if(!['super_admin','admin','supervisor','provider','provider_plus','clinical_practice_assistant'].includes(user.role))throw assistantError(403,'CLINICAL_REVIEW_REQUIRED','Clinical content requires an authorized clinical reviewer.');
  const [[agency]]=await db.execute('SELECT id,feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[proposal.agency_id]);
  if(!agency||!getMedicalBillingFlags(agency).clinicalChartEnabled)throw assistantError(403,'CLINICAL_REVIEW_UNAVAILABLE','Clinical chart access is not enabled for this agency.');
  // Providers cannot read another provider's chart simply through a bot proposal.
  if(['provider','provider_plus','clinical_practice_assistant','supervisor'].includes(user.role)){
   const [[assigned]]=await db.execute(`SELECT c.id FROM clients c WHERE c.id=? AND c.agency_id=? AND (
    c.provider_id=?
    OR EXISTS(SELECT 1 FROM client_provider_assignments cpa WHERE cpa.client_id=c.id AND cpa.provider_user_id=? AND cpa.is_active=1)
    OR EXISTS(SELECT 1 FROM supervisor_assignments sa WHERE sa.supervisor_id=? AND sa.agency_id=c.agency_id
      AND sa.supervisor_type IN ('clinical','billing') AND (
        sa.supervisee_id=c.provider_id
        OR EXISTS(SELECT 1 FROM client_provider_assignments supervised_cpa
          WHERE supervised_cpa.client_id=c.id AND supervised_cpa.provider_user_id=sa.supervisee_id AND supervised_cpa.is_active=1)
      ))
   ) LIMIT 1`,[proposal.source_id,proposal.agency_id,user.id,user.id,user.id]);
   if(!assigned)throw assistantError(403,'CLINICAL_REVIEW_SCOPE','This chart is outside your review assignment.');
  }
 }else if(String(user.email).toLowerCase()!==ASSISTANT_OWNER_EMAIL&&!['super_admin','admin','support'].includes(user.role)&&!((payroll||billing)&&user.role==='staff'))throw assistantError(403,'HUMAN_REVIEW_SCOPE','An authorized operational reviewer is required.');
 return user;
}
