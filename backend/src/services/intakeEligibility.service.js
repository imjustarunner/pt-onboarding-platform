import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import { canLogin, isAccessExpired } from '../utils/accessControl.js';
import { policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
import { readClientInsurance, writeClientInsurance } from './clientInsurance.service.js';
import { coverageFingerprint, buildEligibilityRequest } from './coverageVerification.service.js';
import { resolveClaimMdConnection, requireClaimMdEligibility } from './claimMdConnection.service.js';
import { getClaimMdBillingProfile } from './claimMdBillingProfile.service.js';
import { runMeteredCoverageCheck } from './eligibilityUsage.service.js';
import { queueInsuranceVerificationSafely } from './insuranceVerificationTask.service.js';
import { applyEligibilityProfileResults } from './eligibilityProfile.service.js';
import { observeClaimMdData } from './claimMdDataMonitor.service.js';

const parse = v => typeof v === 'string' ? JSON.parse(v || '{}') : v || {};
export function intakeLookupModes(insurance, slot) {
  const policy = insurance?.[slot];
  const colorado = policy?.eligibilityPayerId === 'SKCO0' && policyIsMedicaid(policy);
  return colorado ? (policy.memberId ? ['member_id','demographics'] : ['demographics']) : ['member_id'];
}
export function shouldTryDemographics(result) {
  const errors = result?.summary?.payerErrors || [];
  return errors.length > 0 && errors.every(e => String(e.error_code) === '75');
}
export function intakeEligibilityKey({agencyId,clientId,fingerprint,slot,mode,jobId}) {
  return `intake:${crypto.createHash('sha256').update(JSON.stringify([agencyId,clientId,fingerprint,slot,mode,jobId])).digest('hex')}`;
}
export function coloradoEligibilityPolicy(policy, patient, config) {
  if (!policyIsMedicaid(policy) || policy?.eligibilityPayerId || config.medicaidState !== 'CO') return policy;
  const colorado = /health first colorado|colorado.*medicaid/i.test(policy.insurerName || '') || String(patient?.state).toUpperCase() === 'CO' || (!patient?.state && (!policy.insurerName || /^medicaid$/i.test(policy.insurerName)));
  return colorado ? {...policy,eligibilityPayerId:'SKCO0'} : policy;
}

export function needsMedicaidDiscovery(insurance, config) {
  return config?.medicaidState === 'CO' && (!insurance?.patient?.state || String(insurance.patient.state).toUpperCase() === 'CO')
    && ![insurance?.primary, insurance?.secondary].some(p => p?.insurerName || p?.payerId || p?.eligibilityPayerId || p?.memberId || policyIsMedicaid(p));
}

export async function automaticEligibilityPayerReady({agencyId,payerId,profile,connection},deps={}) {
  const [[payer]]=await (deps.db||pool).execute(`SELECT d.directory_snapshot_json FROM medical_payer_setup_requests r JOIN medical_payer_setup_details d ON d.request_id=r.id WHERE r.agency_id=? AND d.claimmd_payer_id=? AND d.directory_status='id_match' ORDER BY d.directory_checked_at DESC LIMIT 1`,[agencyId,payerId]);
  const support=parse(payer?.directory_snapshot_json).eligibility;
  if(support==='yes')return true;
  if(support!=='enrollment')return false;
  const taxHash=crypto.createHash('sha256').update(String(profile.practice.tax_id||'').replace(/\D/g,'')).digest('hex');
  const [[enrollment]]=await (deps.clinicalDb||clinicalPool).execute(`SELECT status FROM claimmd_enrollments WHERE agency_id=? AND connection_id=? AND billing_office_location_id=? AND payer_id=? AND enrollment_type='elig' AND provider_npi=? AND tax_id_hash=?`,[agencyId,connection.connectionId,profile.officeId,payerId,profile.billingNpi,taxHash]);
  return ['approved','active','completed','no_enrollment_required'].includes(String(enrollment?.status||'').toLowerCase());
}

export function intakeEligibilityInputs(insurance, config, profile, serviceDate) {
  const prepared = { ...insurance, primary: coloradoEligibilityPolicy(insurance?.primary, insurance?.patient, config),
    secondary: insurance?.secondary ? coloradoEligibilityPolicy(insurance.secondary, insurance.patient, config) : null };
  const readySlots = [], missing = [];
  for (const slot of prepared.secondary ? ['primary', 'secondary'] : ['primary']) {
    try {
      buildEligibilityRequest({ insurance: prepared, slot, serviceDate, profile, lookupMode: intakeLookupModes(prepared, slot)[0], medicaidDiscovery: needsMedicaidDiscovery(prepared, config) });
      readySlots.push(slot);
    } catch (error) {
      if (![400,409].includes(error.status)) throw error;
      missing.push({ slot, message: error.message });
    }
  }
  return { readySlots, missing };
}

/** Persist first, transmit only from the worker. Intake remains usable during a
 * payer outage. A shared billing task exists even if the worker cannot start. */
export async function enqueueIntakeEligibility({agencyId,clientId,submissionId,insuranceCardsMissing=false}, db=pool) {
  const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id=?',[agencyId]);
  const config = parse(agency?.feature_flags).intakeEligibilityAutomation;
  const insurance = await readClientInsurance(clientId,agencyId,db);
  if (!insurance?.primary) return null;
  let jobId=null;
  const persistJob = async status => {
    const fingerprint=coverageFingerprint(insurance);
    const [[existing]]=await db.execute('SELECT id FROM intake_eligibility_jobs WHERE agency_id=? AND client_id=? AND insurance_fingerprint=? ORDER BY id LIMIT 1',[agencyId,clientId,fingerprint]);
    if(existing)return {duplicate:true,id:existing.id};
    const [[checked]]=await db.execute("SELECT id FROM client_coverage_checks WHERE agency_id=? AND client_id=? AND insurance_fingerprint=? AND status='returned' ORDER BY id DESC LIMIT 1",[agencyId,clientId,fingerprint]);
    if(checked)return {duplicate:true,id:null};
    const [result]=await db.execute('INSERT IGNORE INTO intake_eligibility_jobs (agency_id,client_id,submission_id,insurance_fingerprint,status) VALUES (?,?,?,?,?)',[agencyId,clientId,submissionId||0,fingerprint,status]);
    return {duplicate:!result.affectedRows,id:result.insertId||null};
  };
  let automaticEligibility = { status: 'disabled', missing: [] };
  if (config?.enabled && getMedicalBillingFlags(agency).medicalBillingEnabled) {
    let profile;
    try { profile = await getClaimMdBillingProfile(agencyId,config.officeId); }
    catch (error) {
      await persistJob('review_required');
      await queueInsuranceVerificationSafely({agencyId,clientId,reason:'eligibility_error'},db);
      return { status:'waiting_for_information',jobId:null,missing:[{slot:'primary',message:error.message}] };
    }
    const serviceDate = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const inputs = intakeEligibilityInputs(insurance,config,profile,serviceDate);
    automaticEligibility = { status: inputs.readySlots.length ? 'queued' : 'waiting_for_information', ...inputs };
    const job=await persistJob(inputs.readySlots.length?'pending':'review_required');
    if(job.duplicate && inputs.readySlots.length)automaticEligibility.status='already_queued';
    jobId=job.id;
  }
  // A transaction connection cannot acquire a second connection for task locking.
  // The worker's existing missing-task recovery creates its urgent to-do after commit.
  if(typeof db.getConnection==='function')await queueInsuranceVerificationSafely({agencyId,clientId,reason:insuranceCardsMissing?'missing_card':'verification_pending'},db);
  return { ...automaticEligibility, jobId };
}

async function actorAllowed(policy) {
  const user=await User.findById(policy.reviewer_user_id);
  return !!user && canLogin(user) && !isAccessExpired(user) && !['ARCHIVED','INACTIVE_EMPLOYEE','TERMINATED_PENDING','TERMINATED'].includes(String(user.status).toUpperCase()) && await hasSchedulingBillingAccess(user,policy.agency_id);
}

async function configurePayers(job,config,db) {
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[job.client_id,job.agency_id]);
    let insurance=await readClientInsurance(job.client_id,job.agency_id,connection);
    if(coverageFingerprint(insurance)!==job.insurance_fingerprint) {await connection.rollback();return null;}
    const primary=coloradoEligibilityPolicy(insurance.primary,insurance.patient,config);
    const secondary=insurance.secondary?coloradoEligibilityPolicy(insurance.secondary,insurance.patient,config):null;
    if(primary!==insurance.primary || secondary!==insurance.secondary) insurance=await writeClientInsurance({...insurance,agencyId:job.agency_id,clientId:job.client_id,primary,secondary,verifiedForClaims:false,queueEligibility:false},connection);
    await connection.commit();return insurance;
  } catch(e) {await connection.rollback();throw e;} finally {connection.release();}
}

export async function processIntakeEligibility(job,policy,config,deps={}) {
  const db=deps.db||pool;
  const insurance=await (deps.configurePayers||configurePayers)(job,config,db);
  if(!insurance) return 'superseded';
  const connection=await (deps.connection||resolveClaimMdConnection)(job.agency_id);
  requireClaimMdEligibility(connection,job.agency_id,deps.env||process.env);
  const profile=await (deps.profile||getClaimMdBillingProfile)(job.agency_id,config.officeId);
  const fingerprint=coverageFingerprint(insurance),serviceDate=job.care_start_at?new Intl.DateTimeFormat('en-CA',{timeZone:job.care_time_zone||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(job.care_start_at)):new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(deps.now||new Date());
  let needsReview=false;
  const discoveries=[];
  const medicaidDiscovery=needsMedicaidDiscovery(insurance,config);
  for(const slot of insurance.secondary?['primary','secondary']:['primary']) {
    const p=insurance[slot];
    if(p.effectiveDate && p.effectiveDate>serviceDate || p.terminationDate && p.terminationDate<serviceDate) {needsReview=true;continue;}
    try {
      const payload=buildEligibilityRequest({insurance,slot,serviceDate,profile,lookupMode:intakeLookupModes(insurance,slot)[0],medicaidDiscovery});
      // Unsupported and unresolved directory routes go to billing without spending
      // a transaction. Enrollment-required routes also need confirmed setup.
      if(!await (deps.payerReady||automaticEligibilityPayerReady)({agencyId:job.agency_id,payerId:payload.payerid,profile,connection},{...deps,db})) {needsReview=true;continue;}
    }
    catch(error) { if(![400,409].includes(error.status)) throw error; needsReview=true; continue; }
    let result;
    for(const mode of medicaidDiscovery?['demographics']:intakeLookupModes(insurance,slot)) {
      if(result && !shouldTryDemographics(result)) break;
      const requestKey=intakeEligibilityKey({agencyId:job.agency_id,clientId:job.client_id,fingerprint,slot,mode,jobId:job.id});
      // A duplicate, timeout or interrupted transmission is never blindly retried.
      const [[prior]]=await db.execute('SELECT id FROM claimmd_eligibility_usage WHERE agency_id=? AND client_id=? AND request_key=?',[job.agency_id,job.client_id,requestKey]);
      if(prior) {needsReview=true;break;}
      result=await (deps.check||runMeteredCoverageCheck)({agencyId:job.agency_id,clientId:job.client_id,slot,serviceDate,requestKey,actorUserId:policy.reviewer_user_id,profile,connection,expectedFingerprint:fingerprint,lookupMode:mode,medicaidDiscovery,source:'automatic'},deps);
    }
    if(!result || result.summary?.status!=='active_reported' || result.summary?.identityMatches!==true || result.summary?.otherCoverageReported) needsReview=true;
    if(result) discoveries.push({slot,result});
  }
  if(discoveries.length) {
    try { await (deps.applyProfile||applyEligibilityProfileResults)({agencyId:job.agency_id,clientId:job.client_id,expectedFingerprint:fingerprint,results:discoveries,actorUserId:policy.reviewer_user_id},{db}); }
    catch(error) { await observeClaimMdData({agencyId:job.agency_id,endpoint:'eligdata',failure:'profile_import_failed'}); throw error; }
  }
  // Billing owns final coverage coordination, including policies without cards.
  await (deps.queueTask||queueInsuranceVerificationSafely)({agencyId:job.agency_id,clientId:job.client_id,actorUserId:policy.reviewer_user_id,reason:needsReview?'eligibility_unresolved':'coverage_coordination'},db);
  return needsReview?'review_required':'completed';
}

export async function runIntakeEligibilityJobs(deps={}) {
  if((deps.env||process.env).CLAIM_MD_INTAKE_ELIGIBILITY_ENABLED!=='true') return [];
  const db=deps.db||pool;
  // Recover a task creation interrupted after the durable job was written.
  const [missingTasks]=await db.execute(`SELECT j.agency_id,j.client_id FROM intake_eligibility_jobs j JOIN agencies a ON a.id=j.agency_id JOIN clients c ON c.id=j.client_id AND c.agency_id=j.agency_id
    WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND c.compliance_archived_at IS NULL AND c.status NOT IN ('ARCHIVED','INACTIVE','TERMINATED') AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.assigned_to_agency_id=j.agency_id AND t.source_ref_type='insurance_verification' AND BINARY t.source_ref_id=BINARY CAST(j.client_id AS CHAR))
    GROUP BY j.agency_id,j.client_id LIMIT 25`);
  for(const job of missingTasks) await (deps.queueTask||queueInsuranceVerificationSafely)({agencyId:job.agency_id,clientId:job.client_id,reason:'verification_pending'},db);
  // A crash may occur after transmission. The pre-existing billing task remains;
  // interrupted jobs need investigation instead of a second paid lookup.
  await db.execute("UPDATE intake_eligibility_jobs SET status='review_required' WHERE status='processing' AND updated_at<DATE_SUB(NOW(),INTERVAL 30 MINUTE)");
  const [jobs]=await db.execute(`SELECT j.*,ci.start_at AS care_start_at,ci.time_zone AS care_time_zone,a.feature_flags,p.reviewer_user_id,p.enabled AS automation_enabled FROM intake_eligibility_jobs j
    JOIN agencies a ON a.id=j.agency_id JOIN agency_eligibility_automation p ON p.agency_id=j.agency_id
    LEFT JOIN intake_submissions cs ON cs.id=j.submission_id LEFT JOIN care_invitations ci ON ci.intake_link_id=cs.intake_link_id AND ci.agency_id=j.agency_id
    JOIN clients c ON c.id=j.client_id AND c.agency_id=j.agency_id
    WHERE j.status='pending' AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND p.enabled=1
      AND c.compliance_archived_at IS NULL AND c.status NOT IN ('ARCHIVED','INACTIVE','TERMINATED') ORDER BY j.id LIMIT 25`);
  const results=[];
  for(const job of jobs) {
    const config=parse(job.feature_flags).intakeEligibilityAutomation;
    if(!config?.enabled || !getMedicalBillingFlags(job).medicalBillingEnabled || !await (deps.actorAllowed||actorAllowed)(job)) continue;
    const [claim]=await db.execute("UPDATE intake_eligibility_jobs SET status='processing' WHERE id=? AND status='pending'",[job.id]);
    if(!claim.affectedRows) continue;
    let status='review_required';
    try {status=await processIntakeEligibility(job,job,config,deps);}
    catch {await (deps.queueTask||queueInsuranceVerificationSafely)({agencyId:job.agency_id,clientId:job.client_id,reason:'eligibility_error'},db);}
    await db.execute('UPDATE intake_eligibility_jobs SET status=? WHERE id=?',[status,job.id]);
    results.push({jobId:job.id,status});
  }
  const {runDailyClaimAutomation}=await import('./dailyClaimAutomation.service.js');
  await runDailyClaimAutomation(deps);
  return results;
}
