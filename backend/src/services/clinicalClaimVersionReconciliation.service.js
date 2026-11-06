import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { getApprovedClinicalContext, clinicalVersionReference, approvedVersionBillingBlockers, PENDING_CLINICAL_REVISION_HOLD } from './clinicalNoteVersionBilling.service.js';
import { hasPendingRevision } from './clinicalNoteVersion.service.js';
import { resolveClaimDiagnosisCodes, resolveClaimDateOfService } from './clinicalClaimReadiness.service.js';
import { previouslyTransmitted } from './claimServiceChanges.service.js';
import { recordClaimEvent } from './claimMdWorkflow.service.js';
import { parseObject, policyError, isNonBillableDocument } from './supervisedBillingPolicy.service.js';
import {reconcileNewClaimAfterHours,savedClinicalFunding} from './clinicalAfterHours.service.js';

export async function approvedClinicalClaimPlan({ note, session = {}, agencyId = note.agency_id, clientId = note.client_id }, db = clinicalPool) {
  const approved = await getApprovedClinicalContext({ note, session }, db);
  const current = approved.note, metadata = parseObject(current.metadata_json), context = current.clinical_version_encounter_context || {};
  const legacyCorrectionPending = (metadata.serviceDetailAmendments || []).some(amendment => !amendment.approvedAt && !amendment.supersededByAmendmentId && !amendment.supersededByRevisionId);
  if (!current.clinical_version_id || isNonBillableDocument(current)) throw policyError(409, 'An approved billable clinical version is required.');
  const recorded = context.serviceLines || metadata.serviceLines;
  let lines;
  if (Array.isArray(recorded) && recorded.length) {
    lines = recorded.map(line => ({ procedureCode: String(line.procedureCode || line.procedure_code || line.serviceCode || line.code || '').toUpperCase(), units: Number(line.units) }));
  } else {
    const primary = String(metadata.serviceCode || context.serviceCode || approved.session.service_code || '').toUpperCase();
    lines = [{ procedureCode: primary, units: Number(metadata.billingPrimaryUnits || 1) }];
    for (const addon of metadata.billingAddons || []) {
      const code = String(addon.code || addon.serviceCode || addon.procedureCode || '').toUpperCase();
      if (code && code !== primary) lines.push({ procedureCode: code, units: Number(addon.units || 1) });
    }
  }
  if (!lines.length || lines.length > 50 || lines.some(line => !/^[A-Z0-9]{5}$/.test(line.procedureCode) || !Number.isInteger(line.units) || line.units < 1 || line.units > 999)) throw policyError(409, 'Complete the approved version’s service codes and units before reconciling billing.');
  const scheduled=await reconcileNewClaimAfterHours({session:approved.session,note:current,lines,metadata,billing:await savedClinicalFunding(approved.session)});
  if(!scheduled.decision&&lines.some(line=>line.procedureCode==='99051'))throw policyError(409,'Verify the approved encounter start and source timezone before reconciling the99051 line.');
  lines=scheduled.lines;
  const diagnosisCodes = await resolveClaimDiagnosisCodes({ agencyId, clientId, clinicalNoteId: current.id, approvedNote: current });
  const dateOfService = await resolveClaimDateOfService({ clinicalSessionId: current.clinical_session_id, clinicalNoteId: current.id, approvedNote: current });
  const placeOfService = metadata.structuredChart?.placeOfService || context.placeOfService || approved.session.place_of_service;
  if (!diagnosisCodes.length || !dateOfService || !/^\d{2}$/.test(String(placeOfService || ''))) throw policyError(409, 'Complete the approved clinical service date, diagnoses and place of service before billing.');
  return { ...clinicalVersionReference(current), dateOfService, placeOfService, diagnosisCodes, lines,scheduleDerived99051:scheduled.policyBinding, signatures: current.clinical_version_signatures || [], pendingRevisionId: current.clinical_version_pending_id || null, pendingClinicalApproval: !!current.clinical_version_pending_id || legacyCorrectionPending };
}

export function claimDiffersFromApprovedVersion(claim, lines, plan) {
  const note = { clinical_version_id: plan.revisionId, metadata_json: { dateOfService: plan.dateOfService, serviceCode: plan.lines[0].procedureCode, billingPrimaryUnits: plan.lines[0].units, billingAddons: plan.lines.slice(1).map(line => ({ code: line.procedureCode, units: line.units })), diagnosisCodes: plan.diagnosisCodes, structuredChart: { placeOfService: plan.placeOfService } } };
  return approvedVersionBillingBlockers({ note, claim, lines }).length > 0;
}

export async function reconcileApprovedClinicalClaim(input, source = clinicalPool) {
  const reason = String(input.reason || '').trim();
  if (input.attested !== true || reason.length < 10 || reason.length > 2000) throw policyError(400, 'Attest to the reviewed clinical version and enter a billing reason of 10–2,000 characters.');
  const db = await source.getConnection();
  try {
    await db.beginTransaction();
    const [[reference]] = await db.execute('SELECT clinical_session_id FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0', [input.claimId, input.agencyId]);
    if (!reference) throw policyError(404, 'Claim not found.');
    const [[session]] = await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE', [reference.clinical_session_id, input.agencyId]);
    const [[claim]] = await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0 FOR UPDATE', [input.claimId, input.agencyId]);
    if (!claim || !session || Number(claim.client_id) !== Number(session.client_id)) throw policyError(409, 'The claim encounter changed. Reopen its billing review.');
    const [[attempt]] = await db.execute("SELECT id FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND event_type='approved_submission' LIMIT 1", [input.agencyId, input.claimId]);
    if (previouslyTransmitted(claim) || attempt) throw policyError(409, 'Preserve the submitted original. Reconcile it through the payer correction and follow-up workflow.');
    if (Number(input.revision) !== Number(claim.billing_revision)) throw policyError(409, 'The claim billing revision changed. Reopen the draft.');
    const [[note]] = await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? AND clinical_session_id=? AND client_id=? AND is_deleted=0 FOR UPDATE', [claim.clinical_note_id, input.agencyId, claim.clinical_session_id, claim.client_id]);
    if (!note) throw policyError(409, 'The source clinical note is unavailable.');
    if (await hasPendingRevision({ noteId: note.id, agencyId: input.agencyId }, db)) throw policyError(409, PENDING_CLINICAL_REVISION_HOLD);
    const plan = await approvedClinicalClaimPlan({ note, session }, db);
    if (plan.pendingClinicalApproval) throw policyError(409, PENDING_CLINICAL_REVISION_HOLD);
    if (Number(input.expectedClinicalRevisionId) !== plan.revisionId || input.expectedClinicalContentHash !== plan.contentHash) throw policyError(409, 'The approved clinical version changed. Review its services again.');
    if (!Array.isArray(input.lines) || input.lines.length !== plan.lines.length) throw policyError(400, 'Review every approved service line before applying this version.');
    for (let i = 0; i < plan.lines.length; i += 1) {
      const line = input.lines[i], expected = plan.lines[i];
      if (String(line.procedureCode || '').toUpperCase() !== expected.procedureCode || Number(line.units) !== expected.units) throw policyError(409, 'The reviewed services differ from the approved clinical version.');
      if (!Number.isSafeInteger(line.chargeCents) || line.chargeCents < 1 || line.chargeCents > 100000000 || !Array.isArray(line.modifiers) || line.modifiers.length > 4 || line.modifiers.some(value => !/^[A-Z0-9]{2}$/.test(value))) throw policyError(400, 'Explicitly review charges and modifiers for each service line.');
      const pointers = String(line.diagnosisPointers || '').split(',').map(Number);
      if (!/^(?:[1-9]|1[0-2])(?:,(?:[1-9]|1[0-2])){0,3}$/.test(String(line.diagnosisPointers || '')) || pointers.some(value => value > plan.diagnosisCodes.length)) throw policyError(400, 'Review diagnosis pointers against the approved diagnosis list.');
    }
    const [beforeLines] = await db.execute('SELECT * FROM clinical_claim_lines WHERE clinical_claim_id=? ORDER BY line_number FOR UPDATE', [claim.id]);
    await db.execute('DELETE FROM clinical_claim_lines WHERE clinical_claim_id=?', [claim.id]);
    for (let i = 0; i < input.lines.length; i += 1) {
      const line = input.lines[i];
      await db.execute('INSERT INTO clinical_claim_lines (clinical_claim_id,line_number,procedure_code,modifiers_json,units,charge_cents,diagnosis_pointers,clinical_note_id,service_date) VALUES (?,?,?,?,?,?,?,?,?)', [claim.id, i + 1, plan.lines[i].procedureCode, JSON.stringify(line.modifiers), plan.lines[i].units, line.chargeCents, line.diagnosisPointers, note.id, plan.dateOfService]);
    }
    const clinicalVersion = { revisionId: plan.revisionId, revisionNumber: plan.revisionNumber, contentHash: plan.contentHash };
    const payload = { ...parseObject(claim.claim_payload), lines: input.lines.map(line => ({ ...line, serviceDate: plan.dateOfService })), diagnosisCodes: plan.diagnosisCodes, clinicalVersion };
    const metadata = { ...parseObject(claim.metadata_json), clinicalVersion,scheduleDerived99051:plan.scheduleDerived99051 };
    await db.execute("UPDATE clinical_claims SET date_of_service=?,place_of_service=?,diagnosis_codes_json=?,amount_cents=?,claim_payload=?,metadata_json=?,billing_revision=billing_revision+1,claim_lifecycle='draft' WHERE id=? AND agency_id=?", [plan.dateOfService, plan.placeOfService, JSON.stringify(plan.diagnosisCodes), input.lines.reduce((sum, line) => sum + line.chargeCents, 0), JSON.stringify(payload), JSON.stringify(metadata), claim.id, input.agencyId]);
    await recordClaimEvent({ agencyId: input.agencyId, claimId: claim.id, connectionId: `agency:${input.agencyId}`, eventKey: `clinical-version-reconciliation:${crypto.randomUUID()}`, eventType: 'clinical_version_reconciliation', actorUserId: input.actorUserId, payload: { reason, clinicalVersion, clinicalSignatures: plan.signatures, before: { dateOfService: claim.date_of_service, placeOfService: claim.place_of_service, diagnosisCodes: claim.diagnosis_codes_json, lines: beforeLines }, after: { dateOfService: plan.dateOfService, placeOfService: plan.placeOfService, diagnosisCodes: plan.diagnosisCodes, lines: input.lines } } }, db);
    await db.commit();
    return { ok: true, clinicalVersion, message: 'Existing draft reconciled with the approved clinical version. Run a fresh claim review before submission. No claim was transmitted.' };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
