import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import { resolveDocumentationPolicy, loadPayerPolicy, evaluateSupervisedBilling, isNonBillableDocument } from '../services/supervisedBillingPolicy.service.js';
import { claimDocumentation, reviewSourceHash, currentClaimContentReview, runClaimContentReview } from '../services/claimContentReview.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { evaluateClaimReadiness } from '../services/clinicalClaimReadiness.service.js';
import { resolveClaimMdConnection, requireClaimMdTransmission } from '../services/claimMdConnection.service.js';
import { buildClaimMdJsonClaim, fetchPayers, requestEnrollment } from '../services/claimMd.service.js';
import { asList, claimReviewHash, claimEventHistory, safeEnrollmentUrl, taxIdHash, recordClaimEvent } from '../services/claimMdWorkflow.service.js';
import { applyBillingClaimOverrides } from '../services/applyBillingClaimOverrides.service.js';
import { listClaimMdBillingProfiles, getClaimMdBillingProfile, resolveClaimMdBillingProfile, assertClaimBillingNpi } from '../services/claimMdBillingProfile.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
async function agencyFor(req) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) throw fail(400, 'A valid agencyId is required');
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  return agencyId;
}

// Same preparation function is used at review and transmission, so changed source data invalidates approval.
export async function prepareClaimReview(agencyId, claimId) {
  const [[claim]] = await clinicalPool.execute('SELECT * FROM clinical_claims WHERE id = ? AND agency_id = ? AND is_deleted = 0', [claimId, agencyId]);
  if (!claim) throw fail(404, 'Claim not found');
  const [lines] = await clinicalPool.execute('SELECT * FROM clinical_claim_lines WHERE clinical_claim_id = ? ORDER BY line_number', [claimId]);
  const readiness = await evaluateClaimReadiness({ agencyId, clientId: claim.client_id, clinicalSessionId: claim.clinical_session_id, clinicalNoteId: claim.clinical_note_id, requireSignedNote: true });
  if (!claim.clinical_note_id || lines.some(line => Number(line.clinical_note_id) !== Number(claim.clinical_note_id))) throw fail(409, 'Every service line must be linked to this claim’s signed note');
  const insurance = await readClientInsurance(claim.client_id, agencyId);
  const documentation = await claimDocumentation(agencyId, claim);
  documentation.note.latest_addendum_at = documentation.addenda.at(-1)?.created_at || null;
  const [[session]] = await clinicalPool.execute('SELECT provider_user_id, rendering_provider_user_id FROM clinical_sessions WHERE id = ? AND agency_id = ?', [claim.clinical_session_id,agencyId]);
  const providerId = Number(session?.rendering_provider_user_id || session?.provider_user_id);
  const policy = await resolveDocumentationPolicy(agencyId, providerId);
  const [users] = await pool.execute('SELECT id,first_name,last_name,npi,license_type FROM users WHERE id IN (?,?)', [providerId,policy.supervisorUserId || 0]);
  const person = id => { const u=users.find(r=>Number(r.id)===Number(id)); return u?{id:Number(u.id),firstName:u.first_name,lastName:u.last_name,npi:u.npi || null}:null; };
  const configuredPayerPolicy = await loadPayerPolicy(agencyId, insurance?.primary?.payerId, insurance?.primary?.planType);
  const payerPolicy = { ...configuredPayerPolicy, coloradoMedicaid: configuredPayerPolicy?.coloradoMedicaid === true || insurance?.primary?.payerId === 'COCHA' };
  const supervision = evaluateSupervisedBilling({ policy,payerPolicy,dateOfService:claim.date_of_service,serviceProvider:person(providerId),supervisor:person(policy.supervisorUserId),note:documentation.note });
  if (Number(documentation.note.provider_signed_by_user_id || documentation.note.created_by_user_id) !== providerId) supervision.blockers.push('The signed note author does not match the treating service provider');
  // Older notes used is_billable=0 to represent a cosign hold. Policy now owns that hold.
  if (documentation.note.provider_signed_at && !isNonBillableDocument(documentation.note) && policy.supervisorUserId) readiness.blockers = readiness.blockers.filter(b=>b!=='Note requires supervisor approval or is non-billable');
  const billingProfile = await resolveClaimMdBillingProfile(agencyId, claim.clinical_session_id);
  const { practice } = billingProfile;
  const overrides = await applyBillingClaimOverrides({ agencyId, clientId: claim.client_id, claimId,
    placeOfService: claim.place_of_service, billingNpi: claim.billing_npi, taxonomyCode: claim.taxonomy_code, payerName: claim.payer_name,
    payerId: insurance?.primary?.payerId, planType: insurance?.primary?.planType, dateOfService: claim.date_of_service });
  const effective = { ...claim, rendering_npi: supervision.renderingProvider?.npi || claim.rendering_npi, rendering_first_name: supervision.renderingProvider?.firstName, rendering_last_name: supervision.renderingProvider?.lastName,
    supervising_provider: supervision.emitSupervisor ? supervision.supervisingProvider : null,
    place_of_service: overrides?.placeOfService || claim.place_of_service, billing_npi: overrides?.billingNpi || claim.billing_npi, taxonomy_code: overrides?.taxonomyCode || claim.taxonomy_code };
  assertClaimBillingNpi(billingProfile, effective.billing_npi);
  const effectiveLines = overrides?.modifiers ? lines.map(line => ({ ...line, modifiers_json: String(overrides.modifiers).split(/[,\s]+/).filter(Boolean) })) : lines;
  const payload = buildClaimMdJsonClaim(effective, effectiveLines, { insurance, practice });
  const sourceHash = reviewSourceHash({ documentation, payload, supervision, overrides: overrides?.applied || [], revision:claim.billing_revision });
  const aiReview = await currentClaimContentReview(agencyId,claimId,sourceHash);
  const history = aiReview.id ? await claimEventHistory(agencyId,claimId) : [];
  const resolutions = history.filter(e=>e.type==='ai_finding_resolution' && Number(e.reviewId)===Number(aiReview.id) && e.sourceHash===sourceHash);
  aiReview.findings = aiReview.findings.map(f=>({...f,resolution:resolutions.find(r=>r.findingId===f.id)||null}));
  const unresolved = aiReview.findings.filter(f=>f.severity==='blocker'&&!f.resolution);
  if(aiReview.status==='required')readiness.blockers.push('Run the AI content and claim consistency review');
  else if(unresolved.length)readiness.blockers.push(...unresolved.map(f=>f.message));
  else aiReview.status='passed';
  const [[clinicalReview]] = await pool.execute("SELECT outcome FROM clinical_document_reviews WHERE agency_id = ? AND document_type = 'note' AND document_id = ? ORDER BY id DESC LIMIT 1",[agencyId,claim.clinical_note_id]);
  if(clinicalReview?.outcome==='changes_requested')readiness.blockers.push('Supervisor requested documentation changes; obtain review after the amendment');
  readiness.blockers.push(...supervision.blockers);
  readiness.warnings.push(...supervision.warnings,...aiReview.findings.filter(f=>f.severity==='warning').map(f=>f.message));
  readiness.ready=readiness.blockers.length===0;
  return { claim, lines, readiness, insurance, payload, documentation, supervision, aiReview, sourceHash, appliedOverrides:overrides?.applied || [],
    billingOffice: { id: billingProfile.officeId, name: billingProfile.officeName }, reviewHash: claimReviewHash({payload,sourceHash,aiReviewId:aiReview.id || null,resolutions:resolutions.map(r=>r.id)}) };
}

export async function reviewClaim(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    const claimId = Number(req.params.claimId);
    if (!Number.isSafeInteger(claimId) || claimId < 1) throw fail(400, 'Invalid claim ID');
    const prepared = await prepareClaimReview(agencyId, claimId);
    const history = await claimEventHistory(agencyId, claimId);
    res.json({ claimId, clinicalSessionId: prepared.claim.clinical_session_id, clinicalNoteId: prepared.claim.clinical_note_id,
      lifecycle: prepared.claim.claim_lifecycle, billingOffice: prepared.billingOffice, payload: prepared.payload, readiness: prepared.readiness, reviewHash: prepared.reviewHash,
      supervision:prepared.supervision,aiReview:prepared.aiReview,appliedOverrides:prepared.appliedOverrides,history });
  } catch (e) { next(e); }
}

export async function runClaimAiReview(req,res,next) {
  try {
    const agencyId=await agencyFor(req),claimId=Number(req.params.claimId),prepared=await prepareClaimReview(agencyId,claimId);
    if(!['draft','ready','rejected'].includes(prepared.claim.claim_lifecycle))throw fail(409,'Reconcile this submitted claim before reviewing a replacement');
    if(!prepared.documentation.note.provider_signed_at)throw fail(409,'Provider must sign before submission review');
    const result=await runClaimContentReview({agencyId,claimId,sourceHash:prepared.sourceHash,documentation:prepared.documentation,payload:prepared.payload,insurance:prepared.insurance,actorUserId:req.user.id});
    res.json({review:result});
  }catch(e){next(e);}
}
export async function resolveClaimAiFinding(req,res,next) {
  try {
    const agencyId=await agencyFor(req),claimId=Number(req.params.claimId),prepared=await prepareClaimReview(agencyId,claimId);
    const finding=prepared.aiReview.findings.find(f=>f.id===req.body.findingId);
    if(!['draft','ready','rejected'].includes(prepared.claim.claim_lifecycle)||Number(req.body.reviewId)!==Number(prepared.aiReview.id))throw fail(409,'Claim review changed. Reload before resolving findings.');
    if(!finding||!['place_of_service','modifiers'].includes(finding.category))throw fail(409,'Clinical findings require correction through an amendment/addendum and a new review');
    const reason=String(req.body.reason||'').trim(),reference=String(req.body.policyReference||'').trim();
    if(reason.length<10||reason.length>1000||reference.length<5||reference.length>1000)throw fail(400,'Document the payer exception reason and supporting policy/reference');
    await recordClaimEvent({agencyId,claimId,connectionId:prepared.claim.claimmd_connection_id||`agency:${agencyId}`,eventKey:`ai-resolution:${crypto.randomUUID()}`,eventType:'ai_finding_resolution',actorUserId:req.user.id,
      payload:{reviewId:prepared.aiReview.id,sourceHash:prepared.sourceHash,findingId:finding.id,reason,policyReference:reference}});
    res.json({ok:true});
  }catch(e){next(e);}
}

export async function claimHistory(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    const [[claim]] = await clinicalPool.execute('SELECT id FROM clinical_claims WHERE id = ? AND agency_id = ? AND is_deleted = 0', [req.params.claimId, agencyId]);
    if (!claim) throw fail(404, 'Claim not found');
    res.json({ history: await claimEventHistory(agencyId, claim.id) });
  } catch (e) { next(e); }
}

export async function searchClaimMdPayers(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    const connection = await resolveClaimMdConnection(agencyId);
    const query = String(req.query.search || '').trim();
    if (query.length < 2 || query.length > 64) throw fail(400, 'Enter 2–64 characters of a payer name');
    const result = await fetchPayers({ accountKey: connection.accountKey, payerName: query });
    res.json({ payers: asList(result.payer).slice(0, 100) });
  } catch (e) { next(e); }
}

export async function startClaimMdEnrollment(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    const connection = await resolveClaimMdConnection(agencyId);
    requireClaimMdTransmission(connection);
    const payerId = String(req.body.payerId || '').trim();
    const enrollmentType = String(req.body.enrollmentType || '');
    const profile = await getClaimMdBillingProfile(agencyId, req.body.billingOfficeLocationId);
    const npi = profile.billingNpi;
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(payerId) || !['1500', 'era', 'elig'].includes(enrollmentType) || !/^\d{10}$/.test(npi)) throw fail(400, 'A payer ID, billing NPI, and enrollment type are required');
    if (enrollmentType === 'era' && req.body.acknowledgeEraRouting !== true) throw fail(400, 'Confirm ERA routing before starting ERA enrollment');
    const { practice } = profile;
    if (!/^\d{9}$/.test(String(practice.tax_id || '').replace(/\D/g, ''))) throw fail(409, 'Save the agency’s verified tax ID in Company Profile first');
    // Save intent first; never save the short-lived bearer URL.
    await clinicalPool.execute(`INSERT INTO claimmd_enrollments
      (agency_id, connection_id, billing_office_location_id, payer_id, enrollment_type, provider_npi, tax_id_hash, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [agencyId, connection.connectionId, profile.officeId, payerId, enrollmentType, npi, taxIdHash(practice.tax_id), req.user.id]);
    const result = await requestEnrollment({ accountKey: connection.accountKey, payerId, enrollmentType, practice, npi, contact: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() });
    const url = safeEnrollmentUrl(result);
    await clinicalPool.execute(`UPDATE claimmd_enrollments SET status = 'started'
      WHERE agency_id = ? AND connection_id = ? AND billing_office_location_id = ? AND payer_id = ? AND enrollment_type = ?
      AND provider_npi = ? AND tax_id_hash = ? AND status = 'requested'`,
      [agencyId, connection.connectionId, profile.officeId, payerId, enrollmentType, npi, taxIdHash(practice.tax_id)]);
    res.json({ url });
  } catch (e) { next(e); }
}

export async function listClaimMdEnrollments(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    const connection = await resolveClaimMdConnection(agencyId);
    const [items] = await clinicalPool.execute(`SELECT id, billing_office_location_id, payer_id, enrollment_type, provider_npi, status, last_event_at, updated_at
      FROM claimmd_enrollments WHERE agency_id = ? AND connection_id = ? ORDER BY updated_at DESC LIMIT 200`, [agencyId, connection.connectionId]);
    res.json({ items });
  } catch (e) { next(e); }
}

export async function listClaimMdOffices(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    res.json({ items: await listClaimMdBillingProfiles(agencyId) });
  } catch (e) { next(e); }
}

export async function claimDraft(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    const [[claim]] = await clinicalPool.execute(`SELECT id, clinical_note_id, clinical_session_id, place_of_service, billing_npi, rendering_npi, taxonomy_code, billing_revision, claim_lifecycle
      FROM clinical_claims WHERE id = ? AND agency_id = ? AND is_deleted = 0`, [req.params.claimId, agencyId]);
    if (!claim) throw fail(404, 'Claim not found');
    const [lines] = await clinicalPool.execute('SELECT id, procedure_code, units, modifiers_json, charge_cents FROM clinical_claim_lines WHERE clinical_claim_id = ? ORDER BY line_number', [claim.id]);
    res.json({ claim, lines });
  } catch (e) { next(e); }
}

export async function listUndraftedNotes(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    const [notes] = await clinicalPool.execute(`SELECT n.id, n.client_id, n.clinical_session_id, n.service_code, n.provider_signed_at
      FROM clinical_notes n JOIN clinical_sessions s ON s.id = n.clinical_session_id AND s.agency_id = n.agency_id
      WHERE n.agency_id = ? AND n.is_deleted = 0 AND n.provider_signed_at IS NOT NULL AND n.is_billable = 1
      AND s.encounter_status NOT IN ('no_show','cancelled','canceled','voided','rescheduled')
      AND (s.claim_blocked_reason IS NULL OR s.claim_blocked_reason = '')
      AND NOT EXISTS (SELECT 1 FROM clinical_claims c WHERE c.agency_id = n.agency_id AND c.clinical_note_id = n.id AND c.is_deleted = 0)
      ORDER BY n.provider_signed_at DESC LIMIT 200`, [agencyId]);
    res.json({ notes });
  } catch (e) { next(e); }
}

export async function correctClaim(req, res, next) {
  let db;
  try {
    const agencyId = await agencyFor(req);
    const claimId = Number(req.params.claimId);
    const reason = String(req.body.reason || '').trim();
    const pos = String(req.body.placeOfService || '');
    const billingNpi = String(req.body.billingNpi || ''), renderingNpi = String(req.body.renderingNpi || ''), taxonomy = String(req.body.taxonomyCode || '');
    const lines = req.body.lines;
    if (!reason || reason.length > 1000 || !/^\d{2}$/.test(pos) || !/^\d{10}$/.test(billingNpi) || !/^\d{10}$/.test(renderingNpi) || (taxonomy && !/^[A-Z0-9]{10}$/.test(taxonomy))) throw fail(400, 'Provide valid billing identifiers, place of service, and a correction reason');
    if (!Array.isArray(lines) || !lines.length || lines.length > 50 || lines.some(l => !Number.isSafeInteger(l.id) || !Number.isSafeInteger(l.chargeCents) || l.chargeCents < 1 || l.chargeCents > 100000000 || !Array.isArray(l.modifiers) || l.modifiers.length > 4 || l.modifiers.some(m => !/^[A-Z0-9]{2}$/.test(m)))) throw fail(400, 'Review service-line charges and modifiers');
    db = await clinicalPool.getConnection();
    await db.beginTransaction();
    const [[claim]] = await db.execute('SELECT * FROM clinical_claims WHERE id = ? AND agency_id = ? AND is_deleted = 0 FOR UPDATE', [claimId, agencyId]);
    if (!claim) throw fail(404, 'Claim not found');
    if (!['draft', 'ready', 'rejected'].includes(claim.claim_lifecycle)) throw fail(409, 'This claim cannot be edited until its clearinghouse status is reconciled');
    if (Number(req.body.revision) !== claim.billing_revision) throw fail(409, 'Someone changed this claim. Reload before saving.');
    const [originalLines] = await db.execute('SELECT id, charge_cents, modifiers_json FROM clinical_claim_lines WHERE clinical_claim_id = ? FOR UPDATE', [claimId]);
    if (lines.length !== originalLines.length || new Set(lines.map(l => l.id)).size !== lines.length || lines.some(l => !originalLines.some(o => Number(o.id) === l.id))) throw fail(409, 'Service lines changed. Reload the claim.');
    for (const line of lines) await db.execute('UPDATE clinical_claim_lines SET charge_cents = ?, modifiers_json = ? WHERE id = ? AND clinical_claim_id = ?', [line.chargeCents, JSON.stringify(line.modifiers), line.id, claimId]);
    await db.execute(`UPDATE clinical_claims SET place_of_service = ?, billing_npi = ?, rendering_npi = ?, taxonomy_code = ?, amount_cents = ?, billing_revision = billing_revision + 1 WHERE id = ? AND agency_id = ?`,
      [pos, billingNpi, renderingNpi, taxonomy || null, lines.reduce((sum, l) => sum + l.chargeCents, 0), claimId, agencyId]);
    await recordClaimEvent({ agencyId, claimId, connectionId: claim.claimmd_connection_id || `agency:${agencyId}`, eventKey: `correction:${crypto.randomUUID()}`,
      eventType: 'correction', actorUserId: req.user.id, payload: { reason,
        before: { placeOfService: claim.place_of_service, billingNpi: claim.billing_npi, renderingNpi: claim.rendering_npi, taxonomyCode: claim.taxonomy_code, lines: originalLines },
        after: { placeOfService: pos, billingNpi, renderingNpi, taxonomyCode: taxonomy, lines } } }, db);
    await db.commit();
    res.json({ ok: true, message: 'Claim corrected. Review the refreshed claim before submitting.' });
  } catch (e) { if (db) await db.rollback(); next(e); } finally { db?.release(); }
}
