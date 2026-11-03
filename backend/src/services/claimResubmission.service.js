import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { recordClaimEvent } from './claimMdWorkflow.service.js';
import { parseObject, policyError } from './supervisedBillingPolicy.service.js';

import { kinds, claimResubmissionFields, validateResubmissionRequest } from './claimResubmissionPolicy.js';
export { claimResubmissionFields, validateResubmissionRequest };

export async function createClaimResubmission(input, source = clinicalPool) {
  const db = await source.getConnection();
  try {
    await db.beginTransaction();
    const [[reference]] = await db.execute('SELECT clinical_session_id FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0', [input.claimId, input.agencyId]);
    if (!reference) throw policyError(404, 'Claim not found.');
    await db.execute('SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE', [reference.clinical_session_id, input.agencyId]);
    const [[original]] = await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0 FOR UPDATE', [input.claimId, input.agencyId]);
    if (!original) throw policyError(404, 'Claim not found.');
    validateResubmissionRequest(original, input);
    const [existing] = await db.execute(`SELECT id,metadata_json FROM clinical_claims WHERE agency_id=? AND is_deleted=0
      AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.resubmission.sourceClaimId'))=?
      AND claim_lifecycle NOT IN ('void','closed') ORDER BY id DESC FOR UPDATE`, [input.agencyId, String(original.id)]);
    if (existing.length) {
      const previous = parseObject(existing[0].metadata_json).resubmission;
      if (previous?.kind !== input.kind || (previous.payerControlNumber || '') !== String(input.payerControlNumber || '')) throw policyError(409, 'A follow-up claim already exists. Review that linked record before creating another.');
      await db.commit();
      return { claimId: Number(existing[0].id), sourceClaimId: Number(original.id), kind: input.kind, frequencyCode: kinds[input.kind], alreadyExists: true, claimTransmitted: false };
    }
    const resubmission = { kind: input.kind, frequencyCode: kinds[input.kind], sourceClaimId: Number(original.id), sourceBillingRevision: Number(original.billing_revision),
      sourceLifecycle: original.claim_lifecycle, payerControlNumber: input.kind === 'original_retry' ? null : input.payerControlNumber,
      reason: String(input.reason).trim(), actorUserId: Number(input.actorUserId), createdAt: new Date().toISOString(), payerSupportsElectronicCorrection: input.payerSupportsElectronicCorrection === true };
    const metadata = { ...parseObject(original.metadata_json), resubmission };
    const [created] = await db.execute(`INSERT INTO clinical_claims
      (clinical_session_id,agency_id,client_id,claim_status,amount_cents,currency_code,claim_payload,metadata_json,created_by_user_id,
       clinical_note_id,payer_name,destination_payer_id,billing_npi,rendering_npi,taxonomy_code,place_of_service,date_of_service,claim_lifecycle,diagnosis_codes_json,payer_sequence,parent_claim_id)
      VALUES (?,?,?,'PENDING',?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?)`,
      [original.clinical_session_id,input.agencyId,original.client_id,original.amount_cents,original.currency_code || 'USD',original.claim_payload,JSON.stringify(metadata),input.actorUserId,
       original.clinical_note_id,original.payer_name,original.destination_payer_id,original.billing_npi,original.rendering_npi,original.taxonomy_code,original.place_of_service,original.date_of_service,
       typeof original.diagnosis_codes_json === 'string' ? original.diagnosis_codes_json : JSON.stringify(original.diagnosis_codes_json || []),original.payer_sequence || 1,original.parent_claim_id || null]);
    const claimId = Number(created.insertId);
    await db.execute(`INSERT INTO clinical_claim_lines(clinical_claim_id,line_number,procedure_code,modifiers_json,units,charge_cents,diagnosis_pointers,clinical_note_id,service_date)
      SELECT ?,line_number,procedure_code,modifiers_json,units,charge_cents,diagnosis_pointers,clinical_note_id,service_date FROM clinical_claim_lines WHERE clinical_claim_id=? ORDER BY line_number`, [claimId,original.id]);
    const eventKey = `resubmission-created:${crypto.randomUUID()}`;
    for (const linkedClaimId of [original.id,claimId]) await recordClaimEvent({agencyId:input.agencyId,claimId:linkedClaimId,connectionId:`agency:${input.agencyId}`,eventKey,eventType:'resubmission_created',actorUserId:input.actorUserId,payload:{...resubmission,claimId}},db);
    await db.commit();
    return { claimId, sourceClaimId:Number(original.id),kind:input.kind,frequencyCode:kinds[input.kind],claimTransmitted:false };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}

export async function assertResubmissionSource(claim, db = clinicalPool) {
  const entry = parseObject(claim.metadata_json).resubmission;
  if (!entry) return;
  claimResubmissionFields(claim);
  const [[original]] = await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? FOR UPDATE', [entry.sourceClaimId,claim.agency_id]);
  if (!original || original.is_deleted || Number(original.client_id) !== Number(claim.client_id) || Number(original.clinical_session_id) !== Number(claim.clinical_session_id)) throw policyError(409, 'The linked original claim is unavailable or does not match this service.');
  validateResubmissionRequest(original,{...entry,revision:entry.sourceBillingRevision,attested:true});
}
