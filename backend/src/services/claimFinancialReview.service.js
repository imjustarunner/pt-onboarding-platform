import {toDateOnlyString} from '../utils/mysqlDateTime.utils.js';
import {decryptFamilyBilling} from './familyBillingEncryption.service.js';
import {validateClaimAdjudicationEvidence} from './claimAdjudicationEvidence.service.js';
import {assertNoteBillingAllowed} from './noteBillingDisposition.service.js';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {readClientInsurance} from './clientInsurance.service.js';
import {listCoverageEvidence,coverageFingerprint} from './coverageVerification.service.js';
import {automaticBenefitFacts} from './billingBenefitsEmailContent.js';
import {recordClaimEvent} from './claimMdWorkflow.service.js';
const parse=v=>{try{return typeof v==='string'?JSON.parse(v):v||{};}catch{return {};}};
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function reimbursementReviewFlags({billedCents,paidCents,adjustmentCents,responsibilityCents=0}){
 const flags=[];
 const adjustment=Number(adjustmentCents)-Number(responsibilityCents);
 if(Math.abs(adjustment)>500)flags.push({code:'adjustment_over_five',message:'The payer adjustment exceeds $5. Compare the billed rate with your contract and consider updating matching defaults.'});
 if(Number(billedCents)>0&&Number(paidCents)===Number(billedCents))flags.push({code:'paid_exact_billed',message:'The payer paid exactly the billed charge. Review the contracted rate; the current charge may be below it.'});
 return flags;
}
export async function claimFinancialReview({agencyId,claimId},overrides={}){
 const d={main:pool,clinical:clinicalPool,insurance:readClientInsurance,coverage:listCoverageEvidence,...overrides};
 const [[claim]]=await d.clinical.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0',[claimId,agencyId]);
 if(!claim)throw fail(404,'Claim not found in this practice.');
 const serviceDate=toDateOnlyString(claim.date_of_service);
 const [insurance,coverage]=await Promise.all([d.insurance(claim.client_id,agencyId),d.coverage({agencyId,clientId:claim.client_id,serviceDate})]);
 const check=(coverage.checks||[]).find(c=>c.policy_slot==='primary'&&c.status==='returned'&&c.insurance_fingerprint===coverageFingerprint(insurance)&&c.evidence?.summary?.identityMatches===true);
 const benefits=check?automaticBenefitFacts({insurance,result:check.evidence.result,serviceDate}):null;
 const storedCopay=String(insurance?.primary?.copay||'').trim();
 const copayCents=benefits?.facts?.copayCents??(/^\$?\d+(\.\d{1,2})?$/.test(storedCopay)?Math.round(Number(storedCopay.replace('$',''))*100):null);
 const [[posted]]=await d.clinical.execute(`SELECT COUNT(*) posting_count,COALESCE(SUM(paid_cents),0) paid_cents,COALESCE(SUM(adjustment_cents),0) adjustment_cents,COALESCE(SUM(responsibility_cents),0) responsibility_cents FROM claimmd_payment_postings WHERE agency_id=? AND clinical_claim_id=?`,[agencyId,claimId]);
 const payerId=claim.destination_payer_id||insurance?.primary?.payerId||null;
 const [history]=await d.clinical.execute(`SELECT c.id,c.client_id,c.date_of_service,c.payer_name,c.amount_cents billed_cents,
  COALESCE(SUM(p.paid_cents),0) paid_cents,COALESCE(SUM(p.adjustment_cents),0) adjustment_cents,
  COALESCE(SUM(p.responsibility_cents),0) responsibility_cents,MAX(p.posted_at) posted_at,
  c.client_id=? same_client,MAX(s.provider_user_id)=MAX(current_session.provider_user_id) same_provider
  FROM clinical_claims c JOIN claimmd_payment_postings p ON p.clinical_claim_id=c.id AND p.agency_id=c.agency_id
  LEFT JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id
  LEFT JOIN clinical_sessions current_session ON current_session.id=? AND current_session.agency_id=c.agency_id
  WHERE c.agency_id=? AND c.id<>? AND c.is_deleted=0 AND c.destination_payer_id=?
  AND EXISTS(SELECT 1 FROM clinical_claim_lines l WHERE l.clinical_claim_id=c.id AND l.procedure_code IN(SELECT procedure_code FROM clinical_claim_lines WHERE clinical_claim_id=?))
  GROUP BY c.id,c.client_id,c.date_of_service,c.payer_name,c.amount_cents
  ORDER BY same_client DESC,MAX(p.posted_at) DESC,c.id DESC LIMIT 20`,[claim.client_id,claim.clinical_session_id,agencyId,claimId,payerId,claimId]);
 const [balances]=await d.main.execute(`SELECT id,source_type,amount_cents,paid_cents,status,source_payload FROM family_receivables
  WHERE agency_id=? AND client_id=? AND ((source_type='claim_responsibility' AND source_key=?) OR (source_type='clinical_copay' AND source_key=?)) ORDER BY id`,[agencyId,claim.client_id,String(claim.parent_claim_id||claim.id),String(claim.clinical_session_id)]);
 const balanceViews=balances.map(b=>{const saved=b.source_payload?decryptFamilyBilling(b.source_payload,`receivable:${agencyId}:${claim.client_id}`):{};return {id:b.id,source_type:b.source_type,amount_cents:Number(b.amount_cents),paid_cents:Number(b.paid_cents),status:b.status,dueCents:Math.max(0,Number(b.amount_cents)-Number(b.paid_cents)),verifiedFinal:saved.verificationBasis==='era',finalPayerId:saved.finalPayerId||null,finalResponsibilityCents:saved.finalPatientResponsibilityCents??Number(b.amount_cents)};});
 const secondaryPayerId=insurance?.secondary?.payerId;
 const finalBalance=balanceViews.find(b=>b.verifiedFinal&&(!insurance?.secondary||b.finalPayerId===secondaryPayerId));
 const finalPosting=Number(posted?.posting_count||0)>0&&(!insurance?.secondary||Number(claim.payer_sequence)===2&&claim.destination_payer_id===secondaryPayerId);
 const facts={billedCents:Number(claim.amount_cents||0),paidCents:Number(posted?.paid_cents||0),adjustmentCents:Number(posted?.adjustment_cents||0),responsibilityCents:Number(posted?.responsibility_cents||0)};
 return {claimId,revision:Number(claim.billing_revision||0),clientId:Number(claim.client_id),payerId,...facts,
  hasPostedAdjudication:Number(posted?.posting_count||0)>0,hasFinalPatientResponsibility:!!finalBalance||finalPosting,finalPatientResponsibilityCents:finalBalance?.finalResponsibilityCents??Number(posted?.responsibility_cents||0),estimate:parse(claim.metadata_json).patientShareEstimate||null,
  policy:{copayCents,coinsuranceBasisPoints:benefits?.facts?.coinsuranceBasisPoints??null,sourceCheckId:check?.id||null,ready:benefits?.ready===true,reviewReasons:benefits?.reasons||[],secondaryCoverage:!!insurance?.secondary},
  balances:balanceViews,flags:Number(posted?.posting_count||0)?reimbursementReviewFlags(facts):[],
  history:history.map(h=>({...h,flags:reimbursementReviewFlags({billedCents:h.billed_cents,paidCents:h.paid_cents,adjustmentCents:h.adjustment_cents,responsibilityCents:h.responsibility_cents})})),
  message:'Eligibility amounts and manual estimates are not final amounts owed. Record a verified copay or review ERA/EOB evidence before posting a collectible balance.'};
}
export async function saveClaimPatientEstimate({agencyId,claimId,revision,amountCents=null,copayCents=null,coinsuranceBasisPoints=null,reason,actorUserId},source=clinicalPool){
 reason=String(reason||'').trim();
 for(const [name,value,max] of [['patient responsibility',amountCents,100000000],['copay',copayCents,100000000],['coinsurance',coinsuranceBasisPoints,10000]])if(value!==null&&(!Number.isSafeInteger(value)||value<0||value>max))throw fail(400,`Enter a valid ${name}; leave unknown amounts blank.`);
 if(!Number.isSafeInteger(revision)||reason.length<10||reason.length>1000)throw fail(400,'Reload the claim and explain the reviewed estimate.');
 const db=await source.getConnection();
 try{await db.beginTransaction();const [[claim]]=await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0 FOR UPDATE',[claimId,agencyId]);
  if(!claim)throw fail(404,'Claim not found.');if(Number(claim.billing_revision)!==revision)throw fail(409,'The claim changed. Reload before saving.');
  if(claim.claim_lifecycle==='queued')throw fail(409,'Reconcile the pending transmission before updating its billing review.');
  const metadata=parse(claim.metadata_json),before=metadata.patientShareEstimate||null;
  metadata.patientShareEstimate={amountCents,copayCents,coinsuranceBasisPoints,reason,actorUserId,recordedAt:new Date().toISOString(),estimateOnly:true};
  await db.execute('UPDATE clinical_claims SET metadata_json=?,billing_revision=billing_revision+1 WHERE id=? AND agency_id=?',[JSON.stringify(metadata),claimId,agencyId]);
  await recordClaimEvent({agencyId,claimId,connectionId:claim.claimmd_connection_id||`agency:${agencyId}`,eventKey:`patient-estimate:${crypto.randomUUID()}`,eventType:'patient_share_estimate',actorUserId,payload:{before,after:metadata.patientShareEstimate}},db);
  await db.commit();return {ok:true,message:'Estimate saved for billing review. No patient balance or card charge was created.'};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}

export async function recordFinalPatientResponsibility({agencyId,claimId,amountCents,reason,reference,evidenceIds,attested,actorUserId},overrides={}){
 const d={clinical:clinicalPool,validate:validateClaimAdjudicationEvidence,set:async input=>(await import('./familyLedger/sources.js')).setClaimResponsibility(input),event:recordClaimEvent,...overrides};
 reason=String(reason||'').trim();reference=String(reference||'').trim();
 if(attested!==true||reason.length<10||reason.length>1000||reference.length<3||reference.length>255||!Number.isSafeInteger(amountCents)||amountCents<0||amountCents>100000000)throw fail(400,'Confirm the final ERA/EOB, its reference, patient responsibility, and review reason.');
 const db=await d.clinical.getConnection();let claim,proof;
 try{await db.beginTransaction();
  const [[link]]=await db.execute('SELECT clinical_session_id FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0',[claimId,agencyId]);if(!link)throw fail(404,'Claim not found.');
  await db.execute('SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[link.clinical_session_id,agencyId]);
  const [[row]]=await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0 FOR UPDATE',[claimId,agencyId]);claim=row;
  if(!claim||['queued','closed','void'].includes(claim.claim_lifecycle))throw fail(409,'Reconcile the claim state before recording final responsibility.');
  await assertNoteBillingAllowed({agencyId,noteId:claim.clinical_note_id,sessionId:claim.clinical_session_id},db);
  if(amountCents>Number(claim.amount_cents))throw fail(409,'Patient responsibility cannot exceed this claim’s billed charge. Review the EOB and claim.');
  proof=await d.validate({agencyId,claimId,clientId:claim.client_id,evidenceIds},db);
  if(proof.some(file=>!['final_eob','final_era'].includes(file.kind)))throw fail(409,'Upload the final payer ERA/EOB as patient-responsibility proof. Primary-only secondary-billing proof is not a final balance determination.');
  const reviewKey=crypto.createHash('sha256').update(JSON.stringify({claimId,amountCents,reference,evidenceIds:[...evidenceIds].sort()})).digest('hex');
  // Preserve external adjudication evidence before crossing into the patient
  // ledger. A failed balance write never leaves this claim eligible for resend.
  await d.event({agencyId,claimId,connectionId:claim.claimmd_connection_id||`agency:${agencyId}`,eventKey:`final-patient-share:${reviewKey}`,eventType:'external_final_adjudication_recorded',actorUserId,payload:{reference,reason,amountCents,evidenceIds,attested:true}},db);
  await db.commit();
 }catch(error){await db.rollback();throw error;}finally{db.release();}
 let balance;
 try{balance=await d.set({agencyId,claimId,clientId:claim.client_id,amountCents,responsibilityType:'patient_balance',verificationBasis:'era',reason,actorUserId,verifiedEvidence:{reference,evidenceIds:proof.map(file=>file.id),reviewedBy:actorUserId}});}catch(error){throw fail(error.status||502,`The EOB review is saved; the patient balance was not posted. ${error.status?error.message:'Retry after billing connectivity is restored.'}`);}
 return {ok:true,balanceId:balance.id,message:'Final patient responsibility recorded from uploaded ERA/EOB proof. No card was charged by this action.'};
}
