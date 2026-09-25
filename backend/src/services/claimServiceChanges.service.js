import clinicalPool from '../config/clinicalDatabase.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { policyError, parseObject, resolveDocumentationPolicy, hasCurrentSupervisorCosign } from './supervisedBillingPolicy.service.js';
import { loadReviewDocument } from './clinicalReviewDocument.service.js';
import { recordClaimEvent } from './claimMdWorkflow.service.js';

export function normalizeClinicalServiceLines(lines) {
  if(!Array.isArray(lines)||!lines.length||lines.length>50)throw policyError(400,'Provide the complete corrected service-code and unit list');
  return lines.map(l=>{
    const procedureCode=String(l?.procedureCode||'').trim().toUpperCase(),units=Number(l?.units);
    if(!/^[A-Z0-9]{5}$/.test(procedureCode)||!Number.isInteger(units)||units<1||units>999)throw policyError(400,'Each service needs a five-character code and 1–999 whole units');
    return {procedureCode,units};
  });
}
const context=r=>`claim-service-change:${r.agency_id}:${r.clinical_note_id}:${r.addendum_id}`;
export async function queueServiceChange(db,note,addendumId,lines,actorUserId) {
  const [[pending]]=await db.execute("SELECT id FROM clinical_claim_change_requests WHERE agency_id=? AND clinical_session_id=? AND status IN ('pending','reconciliation_required') LIMIT 1 FOR UPDATE",[note.agency_id,note.clinical_session_id]);
  if(pending)throw policyError(409,'Billing must resolve the existing service-change request before another is added');
  await db.execute(`INSERT INTO clinical_claim_change_requests (agency_id,clinical_session_id,clinical_note_id,addendum_id,proposed_lines_encrypted,created_by_user_id) VALUES (?,?,?,?,?,?)`,
    [note.agency_id,note.clinical_session_id,note.id,addendumId,encryptFamilyBilling(lines,context({agency_id:note.agency_id,clinical_note_id:note.id,addendum_id:addendumId})),actorUserId]);
}
export async function claimChangeRequests(claim,db=clinicalPool) {
  const [rows]=await db.execute('SELECT * FROM clinical_claim_change_requests WHERE agency_id=? AND clinical_session_id=? ORDER BY id DESC LIMIT 100',[claim.agency_id,claim.clinical_session_id]);
  return rows.map(r=>({id:r.id,noteId:r.clinical_note_id,addendumId:r.addendum_id,status:r.status,createdAt:r.created_at,
    lines:decryptFamilyBilling(r.proposed_lines_encrypted,context(r)),resolution:r.resolution_encrypted?decryptFamilyBilling(r.resolution_encrypted,`${context(r)}:resolution`):null}));
}
export async function hasPendingClaimChange(claim,db=clinicalPool) {
  const [[pending]]=await db.execute("SELECT id FROM clinical_claim_change_requests WHERE agency_id=? AND clinical_session_id=? AND status IN ('pending','reconciliation_required') LIMIT 1",[claim.agency_id,claim.clinical_session_id]);
  return !!pending;
}
export function previouslyTransmitted(claim) {
  return !!(claim.claimmd_submitted_at||claim.claimmd_claim_id||claim.claimmd_connection_id) || !['draft','ready'].includes(claim.claim_lifecycle) || !['','PENDING','DRAFT','READY'].includes(String(claim.claim_status||'').toUpperCase());
}
export async function assertOriginalTransmissionAllowed(claim,db=clinicalPool) {
  const [[attempt]]=await db.execute("SELECT id FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND event_type='approved_submission' LIMIT 1",[claim.agency_id,claim.id]);
  if(previouslyTransmitted(claim)||attempt)throw policyError(409,'This claim has a submission history. Pause for payer-status reconciliation and the payer-specific correction workflow; do not send another original claim.');
  if(await hasPendingClaimChange(claim,db))throw policyError(409,'Service changes await supervisor sign-off and billing review. Submission is paused.');
}

// Never transmits. Submitted originals and payment state remain immutable here.
export async function resolveServiceChange({agencyId,claimId,requestId,actorUserId,action,reason,reference,charges,lineDetails,revision},source=clinicalPool) {
  if(!['apply_draft','no_claim_change','payer_followup','external_reconciled'].includes(action)||String(reason||'').trim().length<10||String(reason).length>2000)throw policyError(400,'Choose a resolution and document its reason (10–2000 characters)');
  const db=await source.getConnection();
  try {
    await db.beginTransaction();
    const [[claim]]=await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0 FOR UPDATE',[claimId,agencyId]);
    if(!claim)throw policyError(404,'Claim not found');
    // Same lock order as submission/amendment: claim, note, then request.
    const [[requestRef]]=await db.execute('SELECT clinical_note_id FROM clinical_claim_change_requests WHERE id=? AND agency_id=? AND clinical_session_id=?',[requestId,agencyId,claim.clinical_session_id]);
    if(!requestRef)throw policyError(404,'Change request not found');
    const [[note]]=await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE',[requestRef.clinical_note_id,agencyId]);
    if(!note||note.is_deleted)throw policyError(404,'Source note is not available');
    const [[request]]=await db.execute('SELECT * FROM clinical_claim_change_requests WHERE id=? AND agency_id=? FOR UPDATE',[requestId,agencyId]);
    if(!['pending','reconciliation_required'].includes(request.status))throw policyError(409,'This change has already been resolved');
    if(Number(revision)!==Number(claim.billing_revision))throw policyError(409,'Claim changed. Refresh before resolving');
    const policy=await resolveDocumentationPolicy(agencyId,note.provider_signed_by_user_id||note.created_by_user_id);
    const document=await loadReviewDocument({agencyId,providerUserId:note.created_by_user_id},'note',note.id,db);
    if(!hasCurrentSupervisorCosign(document.row,policy.supervisorUserId,document.hash))throw policyError(409,'Supervisor must approve the current note and all amendments first');
    const proposed=normalizeClinicalServiceLines(decryptFamilyBilling(request.proposed_lines_encrypted,context(request)));
    let status='no_claim_change';
    if(action==='apply_draft') {
      // Check submission history independently of a potentially stale lifecycle.
      const [[attempt]]=await db.execute("SELECT id FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND event_type='approved_submission' LIMIT 1",[agencyId,claimId]);
      if(previouslyTransmitted(claim)||attempt)throw policyError(409,'Previously transmitted claims require payer correction/reconciliation. Their original service lines cannot be replaced here.');
      if(!Array.isArray(charges)||charges.length!==proposed.length||charges.some(c=>!Number.isSafeInteger(c)||c<1||c>100000000))throw policyError(400,'Review and enter the total charge in cents for every corrected service line');
      if(!Array.isArray(lineDetails)||lineDetails.length!==proposed.length||lineDetails.some(l=>!l||!Array.isArray(l.modifiers)||l.modifiers.length>4||l.modifiers.some(m=>!/^[A-Z0-9]{2}$/.test(m))||!/^(?:[1-9]|1[0-2])(?:,(?:[1-9]|1[0-2])){0,3}$/.test(l.diagnosisPointers||'')))throw policyError(400,'Explicitly review modifiers and diagnosis pointers (1–12, up to four) for every corrected line');
      const [before]=await db.execute('SELECT * FROM clinical_claim_lines WHERE clinical_claim_id=? ORDER BY line_number FOR UPDATE',[claimId]);
      await db.execute('DELETE FROM clinical_claim_lines WHERE clinical_claim_id=?',[claimId]);
      for(let i=0;i<proposed.length;i++)await db.execute(`INSERT INTO clinical_claim_lines (clinical_claim_id,line_number,procedure_code,modifiers_json,units,charge_cents,diagnosis_pointers,clinical_note_id,service_date) VALUES (?,?,?,?,?,?,?,?,?)`,[claimId,i+1,proposed[i].procedureCode,JSON.stringify(lineDetails[i].modifiers),proposed[i].units,charges[i],lineDetails[i].diagnosisPointers,note.id,claim.date_of_service]);
      const draftPayload={...parseObject(claim.claim_payload),lines:proposed.map((line,i)=>({...line,modifiers:lineDetails[i].modifiers,diagnosisPointers:lineDetails[i].diagnosisPointers,chargeCents:charges[i],serviceDate:claim.date_of_service})),serviceChangeRequestId:requestId};
      await db.execute("UPDATE clinical_claims SET clinical_note_id=?,amount_cents=?,claim_payload=?,billing_revision=billing_revision+1,claim_lifecycle='draft' WHERE id=? AND agency_id=?",[note.id,charges.reduce((a,b)=>a+b,0),JSON.stringify(draftPayload),claimId,agencyId]);
      await recordClaimEvent({agencyId,claimId,connectionId:`agency:${agencyId}`,eventKey:`service-change:${requestId}`,eventType:'service_change_applied',actorUserId,payload:{reason,requestId,before,after:proposed,charges,lineDetails,sourceHash:document.hash}},db);
      status='applied';
    } else {
      if(action==='external_reconciled' && (request.status!=='reconciliation_required'||!previouslyTransmitted(claim)))throw policyError(409,'First record payer follow-up; close it only after external correction and reconciliation');
      if(action==='payer_followup'||previouslyTransmitted(claim)) {
        if(String(reference||'').trim().length<3||String(reference).length>1000)throw policyError(400,'Record the payer claim/control number and correction or reconciliation reference');
      }
      status=action==='payer_followup'?'reconciliation_required':action==='external_reconciled'?'reconciled':'no_claim_change';
      await db.execute('UPDATE clinical_claims SET billing_revision=billing_revision+1 WHERE id=? AND agency_id=?',[claimId,agencyId]);
      await recordClaimEvent({agencyId,claimId,connectionId:claim.claimmd_connection_id||`agency:${agencyId}`,eventKey:`service-resolution:${requestId}:${Number(claim.billing_revision)+1}`,eventType:'service_change_resolution',actorUserId,payload:{requestId,status,reason,reference:reference||null,sourceHash:document.hash}},db);
    }
    await db.execute('UPDATE clinical_claim_change_requests SET status=?,resolved_by_user_id=?,resolution_encrypted=? WHERE id=? AND agency_id=?',[status,actorUserId,encryptFamilyBilling({action,reason,reference:reference||null,claimId,sourceHash:document.hash},`${context(request)}:resolution`),requestId,agencyId]);
    await db.commit();return {status,message:status==='applied'?'Existing draft updated. Review modifiers, diagnosis pointers, AI findings and charges before separate submission approval.':status==='reconciliation_required'?'Claim remains paused for payer correction and payment reconciliation. No claim was transmitted.':status==='reconciled'?'External reconciliation attestation recorded. No claim was transmitted or payment posted by the app.':'No claim change recorded. No claim was created or transmitted.'};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
