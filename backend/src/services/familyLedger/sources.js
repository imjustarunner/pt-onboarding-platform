import { encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { insuranceFingerprint } from './readiness.js';
import { auditBilling } from '../familyBillingPolicy.service.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import {quoteBookingPackage} from '../bookingPackagePricing.service.js';
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import { billingError, requireResponsiblePayer, positiveId } from '../familyBillingPolicy.service.js';
import { createReceivable,findReceivable,sourcePayload,closeZeroClaimResponsibility,applyFinalClaimResponsibility } from './receivables.js';
import { transaction,parseJson,dateOnly,key,requireClient,cents } from './policy.js';
export function sourceDomain(type){let value=String(type||'').toLowerCase();value=({life_coach:'coaching',consultant:'consulting',therapy:'mental_health'})[value]||value;return ['tutoring','coaching','consulting','mentorship','mental_health','clinical'].includes(value)?value:'unknown';}
export async function importSessionCharge({agencyId,chargeId,actorUserId}){
  return transaction(async db=>{
    const [rows]=await db.execute('SELECT c.*,s.payment_mode,ls.service_type FROM learning_session_charges c LEFT JOIN learning_program_sessions s ON s.id=c.learning_program_session_id LEFT JOIN learning_services ls ON ls.id=s.learning_service_id AND ls.agency_id=c.agency_id WHERE c.id=? AND c.agency_id=? FOR UPDATE',[chargeId,agencyId]);const charge=rows[0];
    if(!charge)throw billingError(404,'Session charge not found');
    const [existing]=await db.execute("SELECT * FROM family_receivables WHERE agency_id=? AND source_type='learning_charge' AND source_key=?",[agencyId,String(charge.id)]);if(existing.length)return existing[0];
    if(!['PENDING','FAILED','AUTHORIZED'].includes(charge.charge_status)||Number(charge.total_cents)<1||['TOKEN','SUBSCRIPTION'].includes(charge.payment_mode))throw billingError(409,'This charge is settled, covered, or not collectible');
    const [attempts]=await db.execute("SELECT id FROM learning_payments WHERE agency_id=? AND learning_session_charge_id=? AND payment_status NOT IN ('VOIDED','REFUNDED','FAILED') LIMIT 1",[agencyId,charge.id]);if(attempts.length)throw billingError(409,'Reconcile the existing payment attempt before importing this charge');
    return createReceivable({agencyId,clientId:charge.client_id,sourceType:'learning_charge',sourceKey:String(charge.id),serviceDomain:sourceDomain(charge.service_type),amountCents:Number(charge.total_cents),dueDate:charge.due_at||undefined,serviceDate:charge.service_date||undefined,actorUserId,payload:{chargeId:charge.id}},db);
  });
}
export async function syncSessionBalances({agencyId,actorUserId,clientId=null}){
  const [rows]=await pool.execute("SELECT c.id FROM learning_session_charges c WHERE c.agency_id=? AND c.charge_status IN ('PENDING','FAILED','AUTHORIZED') AND c.total_cents>0"+(clientId?' AND c.client_id=?':'')+" AND NOT EXISTS(SELECT 1 FROM family_receivables r WHERE r.agency_id=c.agency_id AND r.source_type='learning_charge' AND r.source_key=CAST(c.id AS CHAR)) ORDER BY c.id LIMIT 200",clientId?[agencyId,clientId]:[agencyId]);
  const results=[];for(const row of rows){try{const r=await importSessionCharge({agencyId,actorUserId,chargeId:row.id});results.push({chargeId:row.id,receivableId:r.id});}catch(e){if(e.status!==409)throw e;results.push({chargeId:row.id,review:e.message});}}return results;
}
export async function setClaimResponsibility({agencyId,claimId,clientId,amountCents,responsibilityType,verificationBasis='benefit',reason,actorUserId,dueDate,remittancePostingId=null}){
  // The verified final-posting form defaults an empty responsibility to zero.
  if (verificationBasis === 'era') { amountCents = amountCents ?? 0; responsibilityType ||= 'patient_balance'; }
  if(!['copay','deductible','coinsurance','patient_balance'].includes(responsibilityType)||!String(reason||'').trim())throw billingError(400,'Select the patient responsibility type and document verification');
  if(!['benefit','era'].includes(verificationBasis)|| (verificationBasis!=='era'&&responsibilityType!=='copay'))throw billingError(400,'Deductible, coinsurance and final patient balances require a verified payer remittance');
  const [claims]=await clinicalPool.execute('SELECT c.id,c.parent_claim_id,c.payer_sequence,c.destination_payer_id,c.claimmd_submitted_at,c.claim_lifecycle,c.claim_status,c.agency_id,c.client_id,s.scheduled_start_at,s.encounter_status FROM clinical_claims c JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id AND s.client_id=c.client_id WHERE c.id=? AND c.agency_id=? AND c.is_deleted=0',[positiveId(claimId),agencyId]);if(!claims.length)throw billingError(404,'Claim not found in this organization');if(clientId&&Number(clientId)!==Number(claims[0].client_id))throw billingError(409,'The claim belongs to a different client');
  if(claims[0].claim_lifecycle==='void'||['VOID','VOIDED','CANCELLED','CANCELED'].includes(String(claims[0].claim_status).toUpperCase()))throw billingError(409,'Reconcile the voided claim before posting responsibility');
  const serviceDate=claims[0].scheduled_start_at?dateOnly(claims[0].scheduled_start_at):null;
  if(claims[0].encounter_status!=='completed'||!serviceDate||serviceDate>new Date().toISOString().slice(0,10))throw billingError(409,'Patient responsibility can be posted only for a completed visit');
  const [changes]=await clinicalPool.execute("SELECT COALESCE(MAX(cr.id),0) AS latestId,COALESCE(SUM(cr.status IN ('pending','reconciliation_required')),0) AS pending FROM clinical_claim_change_requests cr JOIN clinical_claims c ON c.clinical_session_id=cr.clinical_session_id AND c.agency_id=cr.agency_id WHERE c.id=? AND c.agency_id=?",[claimId,agencyId]);
  if(Number(changes[0].pending))throw billingError(409,'Review the claim amendment before posting patient responsibility');
  const insurance=await readClientInsurance(claims[0].client_id,agencyId);
  if(insurance?.secondary&&(verificationBasis!=='era'||Number(claims[0].payer_sequence)!==2||claims[0].destination_payer_id!==insurance.secondary.payerId||!claims[0].claimmd_submitted_at))throw billingError(409,'Review the final secondary ERA/EOB and use its secondary claim before assigning patient responsibility');
  const balanceClaimId=claims[0].parent_claim_id||claimId;
  // Primary and secondary share one patient balance; an earlier copay is never billed again.

  const input={agencyId,clientId:claims[0].client_id,sourceType:'claim_responsibility',sourceKey:String(balanceClaimId),serviceDomain:'mental_health',serviceDate,serviceLabel:'Visit patient responsibility',amountCents:cents(amountCents,{allowZero:true}),insuranceReviewed:true,dueDate,actorUserId,payload:{claimId:balanceClaimId,finalAdjudicationClaimId:claimId,finalPayerId:claims[0].destination_payer_id||insurance?.primary?.payerId,responsibilityType,verificationBasis,serviceCompleted:true,verifiedClaimChangeId:Number(changes[0].latestId),verificationReason:String(reason).slice(0,2000),verifiedBy:actorUserId}};
  return transaction(async db=>{
    // Primary and secondary use one balance; final zero closes it through an audited adjustment.
    const finalZero = verificationBasis === 'era' && input.amountCents === 0;
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[input.clientId,agencyId]);
    const [existing] = verificationBasis === 'era' ? await db.execute("SELECT * FROM family_receivables WHERE agency_id=? AND source_type='claim_responsibility' AND source_key=?",[agencyId,input.sourceKey]) : [[]];
    const found = existing[0] || await createReceivable(input,db);
    const row=await findReceivable(agencyId,found.id,db,true);
    if(Number(row.client_id)!==Number(input.clientId))throw billingError(409,'The existing balance belongs to a different client');
    if(row.status==='void')throw billingError(409,'Reconcile the voided visit balance before posting responsibility');
    const previous=sourcePayload(row);
    if(remittancePostingId && previous.remittancePostingId === Number(remittancePostingId)) return row;
    const payload={...previous,...input.payload,...(remittancePostingId?{remittancePostingId:Number(remittancePostingId)}:{}),responsibilityReviews:[...(previous.responsibilityReviews||[]),{previous:{verificationBasis:previous.verificationBasis,finalAdjudicationClaimId:previous.finalAdjudicationClaimId,finalPayerId:previous.finalPayerId},...input.payload,at:new Date().toISOString()}]};
    if(input.amountCents>0){delete payload.zeroResponsibilityClosed;delete payload.finalPatientResponsibilityCents;delete payload.refundReviewCents;}
    await db.execute('UPDATE family_receivables SET source_payload=?,insurance_reviewed=1,insurance_fingerprint=? WHERE id=? AND agency_id=?',[encryptFamilyBilling(payload,`receivable:${agencyId}:${row.client_id}`),insuranceFingerprint(insurance),row.id,agencyId]);
    if(finalZero)await closeZeroClaimResponsibility(row,payload,actorUserId,db);
    else if(verificationBasis==='era')await applyFinalClaimResponsibility(row,input.amountCents,payload,actorUserId,db);
    await auditBilling({agencyId,clientId:row.client_id,userId:actorUserId,action:'claim_responsibility_verified',objectId:row.id},db);
    return findReceivable(agencyId,row.id,db);
  });
}
export async function createPackageOrder({agencyId,clientId,packageId,payerUserId,actorUserId,idempotencyKey,providerId,tenantServiceId}){
  const requestKey=key(idempotencyKey),pkg=await BookingPackage.findById(positiveId(packageId),agencyId);if(!pkg?.isActive)throw billingError(404,'Package not available');
  await requireResponsiblePayer(payerUserId,clientId,agencyId);
  const pricingSnapshot=await quoteBookingPackage({agencyId,pkg,providerId,tenantServiceId});
  return transaction(async db=>{
    const r=await createReceivable({agencyId,clientId,sourceType:'package_order',sourceKey:requestKey,serviceDomain:sourceDomain(pkg.businessType),amountCents:pricingSnapshot.amountCents,actorUserId,payload:{pricingSnapshot,packageId:pkg.id,payerUserId,sessionCount:pkg.sessionCount,learningProgramClassId:pkg.learningProgramClassId,businessType:pkg.businessType}},db);
    const payload=sourcePayload(r);if(Number(payload.packageId)!==Number(packageId)||Number(payload.payerUserId)!==Number(payerUserId))throw billingError(409,'Order reference belongs to another purchase');
    if(Number(payload.pricingSnapshot?.providerId||0)!==Number(pricingSnapshot.providerId||0)||Number(payload.pricingSnapshot?.tenantServiceId||0)!==Number(pricingSnapshot.tenantServiceId||0))throw billingError(409,'Order reference belongs to another provider or service');
    if(!payload.entitlementId){const [ent]=await db.execute("INSERT INTO booking_package_entitlements (agency_id,client_id,package_id,learning_program_class_id,business_type,sessions_purchased,sessions_remaining,sessions_reserved,payment_status,status,purchaser_user_id,created_by_user_id,pricing_snapshot_json) VALUES (?,?,?,?,?,?,0,0,'PENDING','PENDING',?,?,?)",[agencyId,clientId,pkg.id,pkg.learningProgramClassId||null,pkg.businessType,pkg.sessionCount,payerUserId,actorUserId,JSON.stringify(pricingSnapshot)]);payload.entitlementId=ent.insertId;const {encryptFamilyBilling}=await import('../familyBillingEncryption.service.js');await db.execute('UPDATE family_receivables SET source_payload=? WHERE id=?',[encryptFamilyBilling(payload,`receivable:${agencyId}:${clientId}`),r.id]);}
    return findReceivable(agencyId,r.id,db);
  });
}
export async function createEventOrder({agencyId,clientId,eventId,amountCents,serviceDomain,actorUserId,reason}){
  const [events]=await pool.execute('SELECT * FROM company_events WHERE id=? AND agency_id=?',[positiveId(eventId),agencyId]);const event=events[0];if(!event?.registration_eligible||!event.cash_eligible)throw billingError(409,'This event is not accepting self-pay registrations');
  if(!String(reason||'').trim())throw billingError(400,'Document the published registration price and service category');
  return createReceivable({agencyId,clientId,sourceType:'event_registration',sourceKey:`${eventId}:${clientId}`,serviceDomain:sourceDomain(serviceDomain),amountCents:cents(amountCents,{allowZero:true}),actorUserId,reviewRequired:true,payload:{eventId:Number(eventId),priceEvidence:String(reason).slice(0,2000)}});
}
export async function fulfillPaidBalances({agencyId,limit=50}){
  const [jobs]=await pool.query("SELECT j.id,j.receivable_id FROM family_fulfillment_jobs j JOIN family_receivables r ON r.id=j.receivable_id WHERE j.agency_id=? AND r.status='paid' AND (j.status IN ('pending','failed') OR (j.status='running' AND j.updated_at<DATE_SUB(NOW(),INTERVAL 10 MINUTE))) ORDER BY j.id LIMIT ?",[agencyId,Math.max(1,Math.min(100,Number(limit)||50))]);const results=[];
  for(const job of jobs){const [claimed]=await pool.execute("UPDATE family_fulfillment_jobs SET status='running',attempts=attempts+1,updated_at=NOW() WHERE id=? AND (status IN ('pending','failed') OR (status='running' AND updated_at<DATE_SUB(NOW(),INTERVAL 10 MINUTE)))",[job.id]);if(!claimed.affectedRows)continue;
    try{const r=await findReceivable(agencyId,job.receivable_id),payload=sourcePayload(r);if(r.status!=='paid')throw billingError(409,'Balance changed before fulfillment');
      if(r.source_type==='learning_charge')await pool.execute("UPDATE learning_session_charges SET charge_status='CAPTURED',captured_at=COALESCE(captured_at,NOW()) WHERE id=? AND agency_id=? AND charge_status IN ('PENDING','AUTHORIZED','FAILED','CAPTURED')",[payload.chargeId,agencyId]);
      if(r.source_type==='package_order'){
        // Credits are the purchased snapshot, not a subsequently edited catalog price/count.
        await transaction(async db=>{const [current]=await db.execute('SELECT status FROM family_receivables WHERE id=? AND agency_id=? FOR UPDATE',[r.id,agencyId]);if(current[0]?.status!=='paid')throw billingError(409,'Balance changed before package activation');const [ents]=await db.execute('SELECT * FROM booking_package_entitlements WHERE id=? AND agency_id=? AND client_id=? FOR UPDATE',[payload.entitlementId,agencyId,r.client_id]);const ent=ents[0];if(!ent||Number(ent.package_id)!==Number(payload.packageId))throw billingError(409,'Package binding changed');if(ent.payment_status!=='PAID'){if(ent.status!=='PENDING')throw billingError(409,'Package is no longer pending');await db.execute("UPDATE booking_package_entitlements SET payment_status='PAID',status='ACTIVE',sessions_remaining=?,bonus_sessions_remaining=?,free_misses_remaining=?,activated_at=NOW() WHERE id=?",[payload.sessionCount+Number(payload.pricingSnapshot?.policies?.bonusSessions||0),Number(payload.pricingSnapshot?.policies?.bonusSessions||0),Number(payload.pricingSnapshot?.policies?.freeMisses||0),ent.id]);await db.execute("INSERT INTO booking_package_ledger (agency_id,entitlement_id,client_id,direction,quantity,reason_code,created_by_user_id) VALUES (?,?,?,'CREDIT',?,'PACKAGE_PURCHASE',?)",[agencyId,ent.id,r.client_id,payload.sessionCount,r.created_by_user_id]);const bonus=Number(payload.pricingSnapshot?.policies?.bonusSessions||0),free=Number(payload.pricingSnapshot?.policies?.freeMisses||0);if(bonus||free)await db.execute("INSERT INTO booking_package_ledger (agency_id,entitlement_id,client_id,direction,quantity,reason_code,metadata_json,created_by_user_id) VALUES (?,?,?,'CREDIT',?,'PACKAGE_ALLOWANCES',?,?)",[agencyId,ent.id,r.client_id,bonus,JSON.stringify({bonusSessions:bonus,freeMisses:free}),r.created_by_user_id]);}});
        if(payload.learningProgramClassId){const {default:Class}=await import('../../models/LearningProgramClass.model.js');await Class.addClientMember({classId:payload.learningProgramClassId,clientId:r.client_id,actorUserId:r.created_by_user_id});}
        const {runTutoringPostPurchaseHooks}=await import('../unifiedPackageCatalog.service.js');const ent=await BookingPackage.findEntitlementById(payload.entitlementId,agencyId);const pkg=await BookingPackage.findById(payload.packageId,agencyId);const hook=await runTutoringPostPurchaseHooks({entitlement:ent,package:{...pkg,learningProgramClassId:payload.learningProgramClassId},actorUserId:r.created_by_user_id});if(hook?.error)throw billingError(409,'The payment and credits are recorded, but subject enrollment needs review');
      }
      if(r.source_type==='event_registration'){const {enrollClientsInCompanyEvent}=await import('../skillBuildersIntakeEnrollment.service.js');const result=await enrollClientsInCompanyEvent({agencyId,eventId:payload.eventId,clientIds:[r.client_id],payerType:'cash'});if(!result.ok||result.results.some(x=>!x.ok))throw billingError(409,'Registration needs staff review; payment remains recorded');}
      await pool.execute("UPDATE family_fulfillment_jobs SET status='completed',last_error=NULL WHERE id=?",[job.id]);results.push({receivableId:r.id,completed:true});
    }catch(e){await pool.execute("UPDATE family_fulfillment_jobs SET status='failed',last_error=? WHERE id=?",[e.status?e.message:'Fulfillment failed; review the source record',job.id]);results.push({receivableId:job.receivable_id,completed:false});}
  }return results;
}
