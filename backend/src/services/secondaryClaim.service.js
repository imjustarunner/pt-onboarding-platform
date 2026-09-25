import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { encryptFamilyBilling,decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { coverageDate,coverageFingerprint } from './coverageVerification.service.js';
import { policyError } from './supervisedBillingPolicy.service.js';
import { hasPendingClaimChange,previouslyTransmitted } from './claimServiceChanges.service.js';
import { recordClaimEvent } from './claimMdWorkflow.service.js';
const serviceIdentity=line=>Object.fromEntries(['from_date','thru_date','mod1','mod2','mod3','mod4'].map(k=>[k,String(line[k]||'')]));
const money=n=>(n/100).toFixed(2);
const cents=n=>{if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw policyError(400,'Use non-negative integer cents from the primary remittance');return n;};
export function validatePrimaryAdjudication(input,charges){
 if(!input||!Array.isArray(charges)||!charges.length)throw policyError(400,'Primary ERA/EOB adjudication and original service lines are required');
 if(input.attested!==true||input.crossoverConfirmedAbsent!==true)throw policyError(409,'Review the primary ERA/EOB and confirm the claim was not already crossed over to secondary');
 if(typeof input.reference!=='string'||input.reference.trim().length<5||input.reference.length>2000||typeof input.primaryClaimControlNumber!=='string'||!input.primaryClaimControlNumber.trim()||input.primaryClaimControlNumber.length>100)throw policyError(400,'Record the primary payer claim number and ERA/EOB reference');
 const paymentDate=coverageDate(input.paymentDate);
 if(paymentDate>new Date().toISOString().slice(0,10))throw policyError(400,'Primary adjudication cannot be dated in the future');
 if(!Array.isArray(input.lines)||input.lines.length!==charges.length)throw policyError(409,'Account for every primary claim line, including denied lines');
 const lines=charges.map((charge,i)=>{
  const line=input.lines[i];if(!line||typeof line!=='object')throw policyError(400,'Each primary service line needs adjudication');
  const paidCents=cents(line.paidCents),billedCents=Math.round(Number(charge.charge)*100);
  if(!Array.isArray(line.adjustments)||line.adjustments.length>8)throw policyError(400,'Enter up to eight primary adjustments per service line');
  const adjustments=line.adjustments.map(a=>{if(!/^(CO|PR|OA|PI)[0-9A-Z]{1,3}$/.test(a?.code||''))throw policyError(400,'Use the ERA adjustment group and reason, such as CO45 or PR1');return {code:a.code,amountCents:cents(a.amountCents)};});
  if(paidCents+adjustments.reduce((n,a)=>n+a.amountCents,0)!==billedCents)throw policyError(409,`Primary payment and adjustments must balance to the full billed charge on line ${i+1}`);
  return {lineNumber:i+1,procedureCode:charge.proc_code,units:String(charge.units),billedCents,paidCents,adjustments,serviceIdentity:serviceIdentity(charge)};
 });
 return {paymentDate,primaryClaimControlNumber:input.primaryClaimControlNumber.trim(),reference:input.reference.trim(),attested:true,crossoverConfirmedAbsent:true,lines};
}
export function secondaryInsurance(insurance){
 if(!insurance?.primary?.payerId||!insurance?.secondary?.payerId||insurance.primary.payerId===insurance.secondary.payerId)throw policyError(409,'Configure distinct primary and secondary payer IDs before preparing a secondary claim');
 return {...insurance,primary:insurance.secondary,secondary:insurance.primary};
}
export function applySecondaryAdjudication(payload,cob){
 if(!cob?.attested||!cob.crossoverConfirmedAbsent||cob.lines?.length!==payload.charge.length)throw policyError(409,'Verified primary adjudication is required');
 const charge=payload.charge.map((line,i)=>{
  const a=cob.lines[i];
  if(JSON.stringify(a.serviceIdentity)!==JSON.stringify(serviceIdentity(line))||a.procedureCode!==line.proc_code||Number(a.units)!==Number(line.units)||a.billedCents!==Math.round(Number(line.charge)*100))throw policyError(409,'Secondary service lines differ from the primary remittance. Resolve the primary correction first');
  return {...line,primary_paid_amount:money(a.paidCents),primary_paid_date:cob.paymentDate.replaceAll('-',''),...Object.fromEntries(a.adjustments.flatMap((v,j)=>[[`adj_code_${j+1}`,v.code],[`adj_amt_${j+1}`,money(v.amountCents)]]))};
 });
 return {...payload,payer_order:'Secondary',amount_paid:money(cob.lines.reduce((n,l)=>n+l.paidCents,0)),other_ins_payment_date:cob.paymentDate.replaceAll('-',''),charge};
}
export function readSecondaryAdjudication(claim,insurance){
 const cob=decryptFamilyBilling(claim.cob_payload_encrypted,`claim-cob:${claim.agency_id}:${claim.id}`);
 if(!cob||cob.coverageFingerprint!==coverageFingerprint(insurance)||claim.destination_payer_id!==insurance?.secondary?.payerId)throw policyError(409,'Coverage changed since the secondary draft; re-review primary adjudication and payer order');
 return cob;
}
export async function prepareSecondaryClaim({agencyId,parentClaimId,actorUserId,adjudication},source=clinicalPool){
 const db=await source.getConnection();
 try{
  await db.beginTransaction();
  const [[ref]]=await db.execute('SELECT clinical_session_id FROM clinical_claims WHERE id=? AND agency_id=?',[parentClaimId,agencyId]);
  if(!ref)throw policyError(404,'Primary claim not found');
  const [[session]]=await db.execute('SELECT id,encounter_status FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[ref.clinical_session_id,agencyId]);
  if(!session||session.encounter_status!=='completed')throw policyError(409,'Only a completed visit can have a secondary claim');
  const [[parent]]=await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? FOR UPDATE',[parentClaimId,agencyId]);
  if(!parent||parent.is_deleted||Number(parent.payer_sequence||1)!==1||!parent.claimmd_submitted_at||!parent.claimmd_claim_id||parent.claim_lifecycle==='void')throw policyError(409,'Use the transmitted primary claim and its payer adjudication; a clearinghouse acceptance alone is insufficient');
  if(await hasPendingClaimChange(parent,db))throw policyError(409,'Resolve outstanding primary service corrections first');
  const insurance=await readClientInsurance(parent.client_id,agencyId);secondaryInsurance(insurance);
  const [[submission]]=await db.execute("SELECT event_key,payload_encrypted FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND event_type='approved_submission' ORDER BY id DESC LIMIT 1",[agencyId,parentClaimId]);
  if(!submission)throw policyError(409,'The original submitted payload is required to prepare a secondary claim');
  const sent=decryptFamilyBilling(submission.payload_encrypted,`claimmd:${agencyId}:${parentClaimId}:${submission.event_key}`).payload;
  if(sent.payerid!==insurance.primary.payerId)throw policyError(409,'Current primary payer differs from the adjudicated claim. Reconcile coverage first');
  const cob={...validatePrimaryAdjudication(adjudication,sent.charge),coverageFingerprint:coverageFingerprint(insurance),parentClaimId,parentBillingRevision:Number(parent.billing_revision||0),reviewedBy:actorUserId,reviewedAt:new Date().toISOString()};
  const [[existing]]=await db.execute('SELECT * FROM clinical_claims WHERE agency_id=? AND parent_claim_id=? FOR UPDATE',[agencyId,parentClaimId]);
  if(existing&&(existing.is_deleted||previouslyTransmitted(existing)))throw policyError(409,'A secondary claim already exists or was transmitted. Reconcile it; do not create another');
  let childId=existing?.id;
  if(!childId){
   const [r]=await db.execute(`INSERT INTO clinical_claims (agency_id,client_id,clinical_session_id,clinical_note_id,parent_claim_id,payer_sequence,destination_payer_id,payer_name,claim_status,claim_lifecycle,amount_cents,currency_code,billing_npi,rendering_npi,taxonomy_code,place_of_service,date_of_service,diagnosis_codes_json,created_by_user_id)
    SELECT agency_id,client_id,clinical_session_id,clinical_note_id,id,2,?,?,'PENDING','draft',amount_cents,currency_code,billing_npi,rendering_npi,taxonomy_code,place_of_service,date_of_service,diagnosis_codes_json,? FROM clinical_claims WHERE id=? AND agency_id=?`,[insurance.secondary.payerId,insurance.secondary.insurerName,actorUserId,parentClaimId,agencyId]);childId=r.insertId;
   await db.execute(`INSERT INTO clinical_claim_lines (clinical_claim_id,line_number,procedure_code,modifiers_json,units,charge_cents,diagnosis_pointers,clinical_note_id,service_date)
    SELECT ?,line_number,procedure_code,modifiers_json,units,charge_cents,diagnosis_pointers,clinical_note_id,service_date FROM clinical_claim_lines WHERE clinical_claim_id=? ORDER BY line_number`,[childId,parentClaimId]);
  }
  await db.execute('UPDATE clinical_claims SET cob_payload_encrypted=?,destination_payer_id=?,payer_name=?,billing_revision=billing_revision+1 WHERE id=? AND agency_id=?',[encryptFamilyBilling(cob,`claim-cob:${agencyId}:${childId}`),insurance.secondary.payerId,insurance.secondary.insurerName,childId,agencyId]);
  await recordClaimEvent({agencyId,claimId:childId,connectionId:`agency:${agencyId}`,eventKey:`secondary-draft:${crypto.randomUUID()}`,eventType:'secondary_draft',actorUserId,payload:{parentClaimId,adjudication:cob,claimTransmitted:false}},db);
  await db.commit();return {claimId:childId,parentClaimId,claimTransmitted:false};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
