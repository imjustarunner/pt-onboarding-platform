import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import { billingError, requireResponsiblePayer, positiveId } from '../familyBillingPolicy.service.js';
import { createReceivable,findReceivable,sourcePayload } from './receivables.js';
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
export async function setClaimResponsibility({agencyId,claimId,clientId,amountCents,responsibilityType,reason,actorUserId,dueDate}){
  if(!['copay','deductible','coinsurance','patient_balance'].includes(responsibilityType)||!String(reason||'').trim())throw billingError(400,'Select the patient responsibility type and document verification');
  const [claims]=await clinicalPool.execute('SELECT id,agency_id,client_id FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0',[positiveId(claimId),agencyId]);if(!claims.length)throw billingError(404,'Claim not found in this organization');if(clientId&&Number(clientId)!==Number(claims[0].client_id))throw billingError(409,'The claim belongs to a different client');
  // A single claim balance prevents a copay being charged again under a second label.
  return createReceivable({agencyId,clientId:claims[0].client_id,sourceType:'claim_responsibility',sourceKey:String(claimId),serviceDomain:'mental_health',amountCents:cents(amountCents,{allowZero:true}),insuranceReviewed:true,dueDate,actorUserId,payload:{claimId,responsibilityType,verificationReason:String(reason).slice(0,2000),verifiedBy:actorUserId}});
}
export async function createPackageOrder({agencyId,clientId,packageId,payerUserId,actorUserId,idempotencyKey}){
  const requestKey=key(idempotencyKey),pkg=await BookingPackage.findById(positiveId(packageId),agencyId);if(!pkg?.isActive)throw billingError(404,'Package not available');
  await requireResponsiblePayer(payerUserId,clientId,agencyId);
  return transaction(async db=>{
    const r=await createReceivable({agencyId,clientId,sourceType:'package_order',sourceKey:requestKey,serviceDomain:sourceDomain(pkg.businessType),amountCents:Number(pkg.priceCents),actorUserId,payload:{packageId:pkg.id,payerUserId,sessionCount:pkg.sessionCount,learningProgramClassId:pkg.learningProgramClassId,businessType:pkg.businessType}},db);
    const payload=sourcePayload(r);if(Number(payload.packageId)!==Number(packageId)||Number(payload.payerUserId)!==Number(payerUserId))throw billingError(409,'Order reference belongs to another purchase');
    if(!payload.entitlementId){const [ent]=await db.execute("INSERT INTO booking_package_entitlements (agency_id,client_id,package_id,learning_program_class_id,business_type,sessions_purchased,sessions_remaining,sessions_reserved,payment_status,status,purchaser_user_id,created_by_user_id) VALUES (?,?,?,?,?,?,0,0,'PENDING','PENDING',?,?)",[agencyId,clientId,pkg.id,pkg.learningProgramClassId||null,pkg.businessType,pkg.sessionCount,payerUserId,actorUserId]);payload.entitlementId=ent.insertId;const {encryptFamilyBilling}=await import('../familyBillingEncryption.service.js');await db.execute('UPDATE family_receivables SET source_payload=? WHERE id=?',[encryptFamilyBilling(payload,`receivable:${agencyId}:${clientId}`),r.id]);}
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
        await transaction(async db=>{const [current]=await db.execute('SELECT status FROM family_receivables WHERE id=? AND agency_id=? FOR UPDATE',[r.id,agencyId]);if(current[0]?.status!=='paid')throw billingError(409,'Balance changed before package activation');const [ents]=await db.execute('SELECT * FROM booking_package_entitlements WHERE id=? AND agency_id=? AND client_id=? FOR UPDATE',[payload.entitlementId,agencyId,r.client_id]);const ent=ents[0];if(!ent||Number(ent.package_id)!==Number(payload.packageId))throw billingError(409,'Package binding changed');if(ent.payment_status!=='PAID'){if(ent.status!=='PENDING')throw billingError(409,'Package is no longer pending');await db.execute("UPDATE booking_package_entitlements SET payment_status='PAID',status='ACTIVE',sessions_remaining=?,activated_at=NOW() WHERE id=?",[payload.sessionCount,ent.id]);await db.execute("INSERT INTO booking_package_ledger (agency_id,entitlement_id,client_id,direction,quantity,reason_code,created_by_user_id) VALUES (?,?,?,'CREDIT',?,'PACKAGE_PURCHASE',?)",[agencyId,ent.id,r.client_id,payload.sessionCount,r.created_by_user_id]);}});
        if(payload.learningProgramClassId){const {default:Class}=await import('../../models/LearningProgramClass.model.js');await Class.addClientMember({classId:payload.learningProgramClassId,clientId:r.client_id,actorUserId:r.created_by_user_id});}
        const {runTutoringPostPurchaseHooks}=await import('../unifiedPackageCatalog.service.js');const ent=await BookingPackage.findEntitlementById(payload.entitlementId,agencyId);const pkg=await BookingPackage.findById(payload.packageId,agencyId);const hook=await runTutoringPostPurchaseHooks({entitlement:ent,package:{...pkg,learningProgramClassId:payload.learningProgramClassId},actorUserId:r.created_by_user_id});if(hook?.error)throw billingError(409,'The payment and credits are recorded, but subject enrollment needs review');
      }
      if(r.source_type==='event_registration'){const {enrollClientsInCompanyEvent}=await import('../skillBuildersIntakeEnrollment.service.js');const result=await enrollClientsInCompanyEvent({agencyId,eventId:payload.eventId,clientIds:[r.client_id],payerType:'cash'});if(!result.ok||result.results.some(x=>!x.ok))throw billingError(409,'Registration needs staff review; payment remains recorded');}
      await pool.execute("UPDATE family_fulfillment_jobs SET status='completed',last_error=NULL WHERE id=?",[job.id]);results.push({receivableId:r.id,completed:true});
    }catch(e){await pool.execute("UPDATE family_fulfillment_jobs SET status='failed',last_error=? WHERE id=?",[e.status?e.message:'Fulfillment failed; review the source record',job.id]);results.push({receivableId:job.receivable_id,completed:false});}
  }return results;
}
