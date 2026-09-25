import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import {canLogin,isAccessExpired} from '../utils/accessControl.js';
import { billingError, positiveId, auditBilling } from './familyBillingPolicy.service.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
import { getClaimMdBillingProfile, resolveClaimMdBillingProfile, listClaimMdBillingProfiles } from './claimMdBillingProfile.service.js';
import { resolveClaimMdConnection, requireClaimMdTransmission } from './claimMdConnection.service.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { coverageFingerprint } from './coverageVerification.service.js';
import { accountEligibilityLimit, runMeteredCoverageCheck } from './eligibilityUsage.service.js';

export const AUTOMATION_CADENCES=['monthly','weekly','before_visit'];
export const automationDate = (date,timezone='America/Denver') => new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function eligibilityPeriod(cadence,date) {
  if(!AUTOMATION_CADENCES.includes(cadence))throw billingError(400,'Choose a verification frequency');
  if(cadence==='monthly')return date.slice(0,7);
  if(cadence==='before_visit')return date;
  const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
}
export function automaticEligibilityKey({agencyId,clientId,slot,fingerprint,period,profile}) {
  return `auto:${crypto.createHash('sha256').update(JSON.stringify([agencyId,clientId,slot,fingerprint,period,profile.officeId,profile.billingNpi,profile.practice.tax_id])).digest('hex')}`;
}
export function validateAutomationPolicy(input) {
  if(typeof input.enabled!=='boolean'||!AUTOMATION_CADENCES.includes(input.cadence)||!Number.isSafeInteger(input.monthlyLimit)||input.monthlyLimit<1||input.monthlyLimit>1000000||!Number.isSafeInteger(input.revision)||input.revision<0)throw billingError(400,'Choose a frequency and monthly limit (1–1,000,000), then refresh before saving');
  const reference=String(input.readinessReference||'').trim();
  if(reference.length<5||reference.length>1000)throw billingError(400,'Record the payer eligibility setup reference (5–1,000 characters)');
  if(input.enabled&&input.readinessConfirmed!==true)throw billingError(400,'Confirm eligibility setup and responsibility for reviewing responses');
  return reference;
}
export async function saveEligibilityAutomation(input) {
  const reference=validateAutomationPolicy(input),db=await pool.getConnection();
  try {
    await db.beginTransaction();await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[input.agencyId]);
    const [[previous]]=await db.execute('SELECT revision FROM agency_eligibility_automation WHERE agency_id=? FOR UPDATE',[input.agencyId]);
    if(Number(previous?.revision||0)!==input.revision)throw billingError(409,'Eligibility settings changed; refresh before saving');
    await db.execute(`INSERT INTO agency_eligibility_automation (agency_id,enabled,cadence,monthly_limit,reviewer_user_id,readiness_reference,revision) VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),cadence=VALUES(cadence),monthly_limit=VALUES(monthly_limit),reviewer_user_id=VALUES(reviewer_user_id),readiness_reference=VALUES(readiness_reference),revision=VALUES(revision)`,[input.agencyId,input.enabled,input.cadence,input.monthlyLimit,input.actorUserId,reference,input.revision+1]);
    await auditBilling({agencyId:input.agencyId,userId:input.actorUserId,action:input.enabled?'eligibility_automation_enabled':'eligibility_automation_paused',objectId:input.agencyId},db);
    await db.commit();return {revision:input.revision+1};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
const activeClientSql="c.status='ACTIVE' AND c.compliance_archived_at IS NULL AND (cs.id IS NULL OR LOWER(cs.status_key) IN ('current','active'))";
export async function enrollEligibilityClients(input) {
  if(!Array.isArray(input.clientIds)||!input.clientIds.length||input.clientIds.length>100||typeof input.enabled!=='boolean')throw billingError(400,'Select 1–100 clients and an enrollment state');
  const ids=[...new Set(input.clientIds.map(positiveId))],officeId=positiveId(input.officeId);
  if(input.enabled)await getClaimMdBillingProfile(input.agencyId,officeId);
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    for(const id of ids) {
      const [[client]]=await db.execute(`SELECT c.id,(${activeClientSql}) AS eligible FROM clients c LEFT JOIN client_statuses cs ON cs.id=c.client_status_id WHERE c.id=? AND c.agency_id=? ${input.enabled?'AND c.billing_insurance_payload IS NOT NULL':''} FOR UPDATE`,[id,input.agencyId]);
      if(!client||input.enabled&&!client.eligible)throw billingError(409,'Choose current, active clients with insurance in this agency');
      await db.execute(`INSERT INTO client_eligibility_automation (agency_id,client_id,billing_office_location_id,enabled,updated_by_user_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE billing_office_location_id=VALUES(billing_office_location_id),enabled=VALUES(enabled),updated_by_user_id=VALUES(updated_by_user_id)`,[input.agencyId,id,officeId,input.enabled,input.actorUserId]);
    }
    await auditBilling({agencyId:input.agencyId,userId:input.actorUserId,action:input.enabled?'eligibility_clients_enrolled':'eligibility_clients_paused',objectId:input.agencyId},db);
    await db.commit();return {updated:ids.length};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function eligibilityAutomationOverview(agencyId,{after=0}={}) {
  const [[policy]]=await pool.execute('SELECT * FROM agency_eligibility_automation WHERE agency_id=?',[agencyId]);
  const [clients]=await pool.execute(`SELECT c.id,c.initials,c.primary_insurer_name,(${activeClientSql}) AS eligible,e.enabled,e.billing_office_location_id,e.last_checked_at,e.last_status FROM clients c LEFT JOIN client_statuses cs ON cs.id=c.client_status_id LEFT JOIN client_eligibility_automation e ON e.agency_id=c.agency_id AND e.client_id=c.id WHERE c.agency_id=? AND c.id>? AND (c.billing_insurance_payload IS NOT NULL OR e.client_id IS NOT NULL) ORDER BY c.id LIMIT 101`,[agencyId,after]);
  const [[totals]]=await pool.execute(`SELECT COUNT(*) AS enrolled FROM client_eligibility_automation WHERE agency_id=? AND enabled=1`,[agencyId]);
  const [usage]=await pool.execute("SELECT source,status,COUNT(*) AS count FROM claimmd_eligibility_usage WHERE agency_id=? AND usage_month=DATE_FORMAT(UTC_DATE(),'%Y-%m') GROUP BY source,status",[agencyId]);
  const [recent]=await pool.execute('SELECT u.id,u.client_id,u.source,u.status,u.created_at,c.policy_slot,c.service_date FROM claimmd_eligibility_usage u LEFT JOIN client_coverage_checks c ON c.id=u.coverage_check_id AND c.agency_id=u.agency_id WHERE u.agency_id=? ORDER BY u.id DESC LIMIT 30',[agencyId]);
  let accountLimit=null,connectionReady=false;
  try{const connection=await resolveClaimMdConnection(agencyId);accountLimit=accountEligibilityLimit(connection.connectionId);requireClaimMdTransmission(connection);connectionReady=true;}catch{}
  return {policy:policy||null,clients:clients.slice(0,100),nextAfter:clients.length>100?clients[99].id:null,totals,usage,recent,offices:await listClaimMdBillingProfiles(agencyId),accountLimit,connectionReady,workerEnabled:process.env.CLAIM_MD_ELIGIBILITY_AUTOMATION_ENABLED==='true'};
}

async function actorAllowed(policy) {
  const user=await User.findById(policy.reviewer_user_id);
  return !!user&&canLogin(user)&&!isAccessExpired(user)&&!['ARCHIVED','INACTIVE_EMPLOYEE','TERMINATED_PENDING','TERMINATED'].includes(String(user.status).toUpperCase())&&await hasSchedulingBillingAccess(user,policy.agency_id);
}
async function candidates(policy,db) {
  const [rows]=await db.execute(`SELECT e.* FROM client_eligibility_automation e JOIN clients c ON c.agency_id=e.agency_id AND c.id=e.client_id LEFT JOIN client_statuses cs ON cs.id=c.client_status_id WHERE e.agency_id=? AND e.enabled=1 AND e.client_id>? AND c.billing_insurance_payload IS NOT NULL AND ${activeClientSql} ORDER BY e.client_id LIMIT 25`,[policy.agency_id,policy.scan_after_client_id]);
  return rows;
}
async function targets(policy,client,now) {
  if(policy.cadence!=='before_visit')return [{serviceDate:automationDate(now),profile:await getClaimMdBillingProfile(policy.agency_id,client.billing_office_location_id)}];
  const [sessions]=await clinicalPool.execute("SELECT id,scheduled_start_at,source_timezone FROM clinical_sessions WHERE agency_id=? AND client_id=? AND encounter_status='scheduled' AND scheduled_start_at>=? AND scheduled_start_at<DATE_ADD(?,INTERVAL 24 HOUR) ORDER BY scheduled_start_at,id LIMIT 20",[policy.agency_id,client.client_id,now,now]);
  const result=[];
  for(const s of sessions)result.push({serviceDate:automationDate(new Date(s.scheduled_start_at),s.source_timezone||'America/Denver'),profile:await resolveClaimMdBillingProfile(policy.agency_id,s.id)});
  return result;
}
/** A page per agency per tick; durable request keys provide cross-replica dedupe.
 * No automatic review attestation, collection release, or blind network retry.
 */
export async function runEligibilityAutomation(deps={}) {
  if((deps.env||process.env).CLAIM_MD_ELIGIBILITY_AUTOMATION_ENABLED!=='true')return [];
  const db=deps.db||pool,now=deps.now||new Date();
  const [policies]=await db.execute('SELECT p.*,a.feature_flags FROM agency_eligibility_automation p JOIN agencies a ON a.id=p.agency_id WHERE p.enabled=1 AND a.is_active=1 ORDER BY p.agency_id');
  const results=[];
  for(const policy of policies) {
    const summary={agencyId:policy.agency_id,returned:0,needsReview:0,alreadyRecorded:0};
    try {
      if(!getMedicalBillingFlags(policy).medicalBillingEnabled||!await (deps.actorAllowed||actorAllowed)(policy))throw billingError(409,'Reviewer or agency billing access needs attention');
      const connection=await (deps.connection||resolveClaimMdConnection)(policy.agency_id);requireClaimMdTransmission(connection);
      if(accountEligibilityLimit(connection.connectionId,deps.env||process.env)==null)throw billingError(409,'Set the shared account eligibility limit');
      const clients=await (deps.candidates||candidates)(policy,db);
      for(const client of clients) {
        const before={...summary};
        try {
          const insurance=await (deps.readInsurance||readClientInsurance)(client.client_id,policy.agency_id,db),fingerprint=coverageFingerprint(insurance);
          for(const target of await (deps.targets||targets)(policy,client,now))for(const slot of insurance?.secondary?['primary','secondary']:['primary']) {
            const policyData=insurance?.[slot];
            if(policyData?.effectiveDate&&policyData.effectiveDate>target.serviceDate||policyData?.terminationDate&&policyData.terminationDate<target.serviceDate){summary.needsReview++;continue;}
            const requestKey=automaticEligibilityKey({agencyId:policy.agency_id,clientId:client.client_id,slot,fingerprint,period:`${policy.cadence}:${eligibilityPeriod(policy.cadence,target.serviceDate)}`,profile:target.profile});
            // Recheck per-client pause state immediately before each external request.
            const [[current]]=await db.execute('SELECT enabled FROM client_eligibility_automation WHERE agency_id=? AND client_id=?',[policy.agency_id,client.client_id]);
            if(!current?.enabled)break;
            const [[prior]]=await db.execute('SELECT id FROM claimmd_eligibility_usage WHERE agency_id=? AND client_id=? AND request_key=?',[policy.agency_id,client.client_id,requestKey]);
            if(prior){summary.alreadyRecorded++;continue;}
            try {
              await (deps.check||runMeteredCoverageCheck)({agencyId:policy.agency_id,clientId:client.client_id,slot,...target,requestKey,expectedFingerprint:fingerprint,actorUserId:policy.reviewer_user_id,connection,source:'automatic'},deps);
              summary.returned++;
            }catch{summary.needsReview++;}
          }
        }catch{summary.needsReview++;}
        await db.execute('UPDATE client_eligibility_automation SET last_checked_at=?,last_status=? WHERE agency_id=? AND client_id=?',[now,summary.needsReview>before.needsReview?'setup_or_response_review':summary.returned>before.returned?'response_returned':summary.alreadyRecorded>before.alreadyRecorded?'already_recorded':'waiting_for_visit',policy.agency_id,client.client_id]);
      }
      await db.execute('UPDATE agency_eligibility_automation SET scan_after_client_id=?,last_run_at=?,last_run_status=? WHERE agency_id=?',[clients.length===25?clients.at(-1).client_id:0,now,summary.needsReview?'review_required':'completed',policy.agency_id]);
    }catch{summary.needsReview++;await db.execute("UPDATE agency_eligibility_automation SET last_run_at=?,last_run_status='setup_required' WHERE agency_id=?",[now,policy.agency_id]);}
    results.push(summary);
  }
  return results;
}
