import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import Task from '../models/Task.model.js';
import { canLogin, isAccessExpired } from '../utils/accessControl.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
import { resolveClaimMdConnection } from './claimMdConnection.service.js';
import { assertLiveClearinghouseAgency } from './syntheticClearinghouseGuard.service.js';
import { syncInsuranceBillingAudience } from './insuranceVerificationTask.service.js';
import { encryptTaskDescriptionText, ENCRYPTED_TASK_DESCRIPTION_PLACEHOLDER } from './taskDescriptionEncryption.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
export function claimAutomationDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}

/** Daily preparation uses the manual submission checks and cannot transmit claims. */
export async function processAutomaticClaim({ agencyId, claimId, user }, deps = {}) {
  const prepare = deps.prepare || (await import('../controllers/claimMdWorkflow.controller.js')).prepareClaimReview;
  const review = deps.review || (await import('./claimContentReview.service.js')).runClaimContentReview;
  let prepared = await prepare(agencyId,claimId);
  if (!['draft','ready'].includes(prepared.claim.claim_lifecycle) || prepared.claim.claimmd_claim_id || prepared.claim.claimmd_submitted_at)
    return { status:'skipped', blockers:[] };
  if (!prepared.documentation?.note?.provider_signed_at)return {status:'awaiting_signatures',blockers:[]};
  if (prepared.aiReview?.status === 'required' && prepared.payload && prepared.documentation?.note?.provider_signed_at) {
    await review({agencyId,claimId,actorUserId:user.id,sourceHash:prepared.sourceHash,
      documentation:prepared.documentation,payload:prepared.payload,insurance:prepared.insurance,contentReviewPolicy:prepared.contentReviewPolicy});
    prepared = await prepare(agencyId,claimId);
  }
  if (!prepared.readiness.ready) return { status:'held',blockers:prepared.readiness.blockers || ['Claim requires billing review'] };
  // Warnings are human work too; do not silently approve an ambiguous AI result.
  if (prepared.aiReview?.findings?.some(finding => !finding.resolution))
    return { status:'held',blockers:prepared.aiReview.findings.filter(f=>!f.resolution).map(f=>f.message) };
  if(prepared.claim.claim_lifecycle==='draft') {
    const [promoted]=await (deps.clinical||clinicalPool).execute("UPDATE clinical_claims SET claim_lifecycle='ready' WHERE id=? AND agency_id=? AND claim_lifecycle='draft' AND billing_revision=? AND claimmd_claim_id IS NULL AND claimmd_submitted_at IS NULL",[claimId,agencyId,prepared.claim.billing_revision]);
    if(!promoted.affectedRows)return {status:'skipped',blockers:[]};
  }
  return {status:'ready',blockers:[]};
}

export async function queueAutomaticClaimIssue({agencyId,claimId,clientId,userId,taskListId,blockers},db=pool) {
  if (!taskListId) throw new Error('Configure the agency billing task list before automatic submissions');
  const description=['The daily billing worker held this claim. Review the current claim, correct the documented issue, and submit manually once every required check passes.',
    ...blockers.map(value=>`• ${value}`),'Never resubmit an uncertain upload without checking its Claim.MD history.'].join('\n');
  const [[existing]]=await db.execute("SELECT id FROM tasks WHERE assigned_to_agency_id=? AND source_ref_type='billing_claim_followup' AND source_ref_id=? ORDER BY id DESC LIMIT 1",[agencyId,String(claimId)]);
  if (existing) {
    const encrypted=encryptTaskDescriptionText(description);
    if(!encrypted)throw new Error('Billing task encryption is unavailable');
    await db.execute(`UPDATE tasks SET urgency='high',status=IF(status IN ('completed','overridden'),'pending',status),completed_at=NULL,
      description=?,description_ciphertext=?,description_iv=?,description_auth_tag=?,description_encryption_key_id=? WHERE id=?`,
      [ENCRYPTED_TASK_DESCRIPTION_PLACEHOLDER,encrypted.ciphertextB64,encrypted.ivB64,encrypted.authTagB64,encrypted.keyId,existing.id]);
    return existing.id;
  }
  const task=await Task.create({taskType:'custom',title:`Review held billing claim #${claimId}`,description,encryptDescription:true,
    assignedToUserId:null,assignedToAgencyId:agencyId,assignedByUserId:userId,taskListId,urgency:'high',categories:['billing','client'],
    sourceRefType:'billing_claim_followup',sourceRefId:String(claimId),metadata:{clientId,claimId,automaticBilling:true}});
  return task.id;
}

/** One durable daily review pass per agency; an advisory lock serializes Cloud Run replicas.
 * Submitted/queued/rejected claims never enter this worker's candidate set. */
export async function runDailyClaimAutomation(deps={}) {
  const db=deps.db||pool,clinical=deps.clinical||clinicalPool,now=deps.now||new Date(),day=claimAutomationDay(now);
  const [agencies]=await db.execute("SELECT id,feature_flags FROM agencies WHERE is_active=1 AND COALESCE(is_archived,0)=0 AND JSON_EXTRACT(feature_flags,'$.dailyClaimAutomation.enabled')=true ORDER BY id");
  const results=[];
  for(const agency of agencies) {
    const flags=parse(agency.feature_flags),config=flags.dailyClaimAutomation;
    if(!getMedicalBillingFlags(agency).medicalBillingEnabled || !config?.approvedByUserId || !flags.insuranceVerificationTasks?.taskListId)continue;
    const user=await (deps.user||User.findById.bind(User))(config.approvedByUserId);
    if(!user || !canLogin(user) || isAccessExpired(user) || !await (deps.allowed||hasSchedulingBillingAccess)(user,agency.id))continue;
    await (deps.liveAgency||assertLiveClearinghouseAgency)(agency.id);
    const connection=await (deps.connection||resolveClaimMdConnection)(agency.id);
    if(connection.mode!=='live')continue;
    const lock=await db.getConnection(),key=`daily-claims:${agency.id}`;
    let acquired=false;
    try {
      const [[got]]=await lock.execute('SELECT GET_LOCK(?,0) AS acquired',[key]);
      if(Number(got.acquired)!==1)continue;
      acquired=true;
      await db.execute('INSERT IGNORE INTO agency_claim_automation_runs (agency_id,run_date,actor_user_id) VALUES (?,?,?)',[agency.id,day,user.id]);
      const [[run]]=await db.execute('SELECT * FROM agency_claim_automation_runs WHERE agency_id=? AND run_date=?',[agency.id,day]);
      if(run.status==='completed')continue;
      const taskListId=Number(flags.insuranceVerificationTasks.taskListId);
      await (deps.syncAudience||syncInsuranceBillingAudience)(agency.id,taskListId,db);
      const [claims]=await clinical.execute(`SELECT c.id,c.client_id FROM clinical_claims c JOIN clinical_notes n ON n.id=c.clinical_note_id AND n.agency_id=c.agency_id
        WHERE c.agency_id=? AND c.id>? AND c.is_deleted=0 AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL
        AND c.claim_lifecycle IN ('draft','ready') AND c.claimmd_claim_id IS NULL AND c.claimmd_submitted_at IS NULL AND c.date_of_service<=?
        AND COALESCE(JSON_EXTRACT(c.metadata_json,'$.hiddenFromQueue'),false)=false ORDER BY c.id LIMIT 25`,[agency.id,run.last_claim_id,day]);
      for(const claim of claims) {
        let outcome;
        try {outcome=await (deps.process||processAutomaticClaim)({agencyId:agency.id,claimId:claim.id,user},deps);}
        catch(error){outcome={status:'held',blockers:[error.message || 'Automatic claim review failed']};}
        if(outcome.status==='held')await (deps.queueIssue||queueAutomaticClaimIssue)({agencyId:agency.id,claimId:claim.id,clientId:claim.client_id,userId:user.id,taskListId,blockers:outcome.blockers},db);
        if(outcome.status==='ready')await db.execute("UPDATE tasks SET status='completed',completed_at=NOW() WHERE assigned_to_agency_id=? AND source_ref_type='billing_claim_followup' AND source_ref_id=? AND status NOT IN ('completed','overridden')",[agency.id,String(claim.id)]);
        await db.execute('UPDATE agency_claim_automation_runs SET last_claim_id=?,submitted_count=submitted_count+?,held_count=held_count+? WHERE agency_id=? AND run_date=?',
          [claim.id,outcome.status==='submitted'?1:0,outcome.status==='held'?1:0,agency.id,day]);
        results.push({agencyId:agency.id,claimId:claim.id,status:outcome.status});
      }
      if(claims.length<25)await db.execute("UPDATE agency_claim_automation_runs SET status='completed',completed_at=NOW() WHERE agency_id=? AND run_date=?",[agency.id,day]);
    } finally {if(acquired)await lock.execute('SELECT RELEASE_LOCK(?)',[key]);lock.release();}
  }
  return results;
}
