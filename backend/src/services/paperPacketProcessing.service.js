import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import Agency from '../models/Agency.model.js';
import { isPaperPacketClient } from '../utils/paperPacketClient.js';
import { getLatestPaperPacketVisionEval } from './paperPacketVision.service.js';
import { markPaperPacketSignatureReceived, updateClientOnboardingDocs, acknowledgeRoiStaffOnboarding } from './clientOnboardingChecklist.service.js';
import { sendHubPortalInvitation } from './messagesHub.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const object = value => { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return {}; } };
export const PAPER_PROCESSING_STEPS = ['demographics', 'guardian1', 'guardian2', 'school', 'insurance'];
export const paperProcessingState = client => object(client?.onboarding_docs_json).paperProcessing || { completedSteps: [], invitations: {} };
const dependencies = overrides => ({ clients: Client, guardians: ClientGuardian, documents: ClientPhiDocument, agencies: Agency,
  vision: getLatestPaperPacketVisionEval, send: sendHubPortalInvitation, markSignatures: markPaperPacketSignatureReceived,
  markDocuments: updateClientOnboardingDocs, acknowledgeRoi: acknowledgeRoiStaffOnboarding, database: pool, ...overrides });

async function readClient(clientId, deps) {
  const client = await deps.clients.findById(clientId, { includeSensitive: true });
  if (!client) throw fail('Client not found', 404);
  if (!isPaperPacketClient(client) || !Number(client.organization_id)) throw fail('This workflow is for an uploaded school paper packet.');
  return client;
}
async function writeState(client, state, actorId, deps) {
  await deps.clients.update(client.id, { onboarding_docs_json: JSON.stringify({ ...object(client.onboarding_docs_json), paperProcessing: state }) }, actorId);
}
async function sourceDocument(client, documentId, deps) {
  const doc = documentId ? await deps.documents.findById(Number(documentId)) : null;
  if (!doc || Number(doc.client_id) !== Number(client.id) || Number(doc.agency_id) !== Number(client.agency_id)
    || doc.removed_at || doc.scan_status !== 'clean') throw fail('Select the uploaded packet after its file check is complete.');
  return doc;
}
export async function paperProcessingContext(clientId, overrides = {}) {
  const deps = dependencies(overrides), client = await readClient(clientId, deps);
  const [guardians, school, vision] = await Promise.all([deps.guardians.listForClient(client.id), deps.agencies.findById(client.organization_id), deps.vision(client.id)]);
  const fields = ['id','agency_id','organization_id','full_name','date_of_birth','gender','grade','address_street','address_apt','address_city','address_state','address_zip','preferred_language','primary_parent_language','insurance_type_id'];
  return { client: Object.fromEntries(fields.map(key => [key, client[key] ?? null])), schoolName: school?.name || '',
    state: paperProcessingState(client), guardians: guardians.map(g => ({ guardian_user_id:g.guardian_user_id,
      first_name:g.first_name,last_name:g.last_name,email:g.email,phone_number:g.phone_number,
      relationship_title:g.relationship_title,access_enabled:g.access_enabled,permissions_json:g.permissions_json })),
    packetRead: vision ? { id:vision.id,documentId:vision.phi_document_id,status:vision.status,versionLabel:vision.detected_version_label,
      roiSignatureDetected:!!vision.roi_signature_detected,disclosureSignatureDetected:!!vision.disclosure_signature_detected,
      reviewReasons:vision.review_reasons || [] } : null };
}
export async function savePaperProcessingStep(input, overrides = {}) {
  const deps = dependencies(overrides);
  return withPacketLock(input.clientId, deps, () => saveStep(input, deps));
}
async function saveStep({ clientId, actorId, step, data = {} }, overrides = {}) {
  const deps = dependencies(overrides), client = await readClient(clientId, deps);
  if (!PAPER_PROCESSING_STEPS.includes(step)) throw fail('Unknown paper-packet step.');
  const state = { ...paperProcessingState(client) };
  if (state.processedAt) throw fail('This packet has already been processed. Use the client profile for later changes.', 409);
  if (step === 'demographics') {
    const doc = await sourceDocument(client, data.documentId, deps);
    const first = String(data.firstName || '').trim(), last = String(data.lastName || '').trim();
    const dob = String(data.dateOfBirth || '').trim();
    if (!first || !last || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(Date.parse(`${dob}T12:00:00Z`))
      || new Date(`${dob}T12:00:00Z`).toISOString().slice(0,10) !== dob) throw fail('Enter the client’s first name, last name and a valid date of birth.');
    const patch = { full_name:`${first} ${last}`,date_of_birth:dob };
    for (const key of ['gender','grade','address_street','address_apt','address_city','address_state','address_zip','preferred_language']) {
      if (data[key] != null) patch[key] = String(data[key]).trim().slice(0,255);
    }
    await deps.clients.update(client.id, patch, actorId);
    if (state.documentId && Number(state.documentId) !== Number(doc.id)) state.completedSteps = [];
    state.documentId = Number(doc.id);
  } else if (step === 'guardian1' || step === 'guardian2') {
    if (step === 'guardian2' && data.notListed === true) state.guardian2Id = null;
    else {
      const guardianId = Number(data.guardianUserId), link = await deps.guardians.getLink({clientId:client.id,guardianUserId:guardianId});
      if (!link || ![1,true].includes(link.access_enabled)) throw fail('Connect an enabled parent or guardian portal account before continuing.');
      if (guardianId === Number(state[step === 'guardian2' ? 'guardian1Id' : 'guardian2Id'])) throw fail('The second guardian needs their own account and email.');
      state[`${step}Id`] = guardianId;
    }
  } else if (step === 'school') {
    if (data.schoolConfirmed !== true || !['yes','no','unsure'].includes(data.sharedCustody)) throw fail('Confirm the school and the custody/decision-making information on the paper packet.');
    if (data.sharedCustody === 'yes' && !state.guardian2Id) throw fail('Shared custody requires the other guardian’s contact. Complete the second-parent step.');
    state.sharedCustody = data.sharedCustody;
  } else if (step === 'insurance') {
    if (data.reviewed !== true) throw fail('Review and save the insurance or self-pay information before continuing.');
    const [[type]] = await deps.database.execute('SELECT id FROM insurance_types WHERE id=? AND agency_id=? AND is_active=1', [Number(data.insuranceTypeId)||0, client.agency_id]);
    if (!type) throw fail('Select the insurance or self-pay category shown on the paper packet.');
    await deps.clients.update(client.id, {insurance_type_id:Number(type.id)}, actorId);
  }
  state.completedSteps = [...new Set([...(state.completedSteps || []), step])];
  state.updatedAt = new Date().toISOString();
  await writeState(client, state, actorId, deps);
  return state;
}

async function withPacketLock(clientId, deps, action) {
  const connection = await deps.database.getConnection();
  const lock = `paper-packet-processing:${Number(clientId)}`;
  let acquired = false;
  try {
    const [[result]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [lock]);
    acquired = Number(result?.acquired) === 1;
    if (!acquired) throw fail('This packet is already being processed. Please wait and refresh.', 409);
    return await action();
  } finally {
    try { if (acquired) await connection.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { connection.release(); }
  }
}

export async function completePaperProcessing(input, overrides = {}) {
  const deps = dependencies(overrides);
  return withPacketLock(input.clientId, deps, () => complete(input, deps));
}
async function complete({clientId, actorId, signaturesConfirmed, staffRoiConfirmed}, deps) {
    let client = await readClient(clientId, deps), state = { ...paperProcessingState(client) };
    if (PAPER_PROCESSING_STEPS.some(step => !(state.completedSteps || []).includes(step))) throw fail('Complete each packet-processing step first.');
    await sourceDocument(client, state.documentId, deps);
    const vision = await deps.vision(client.id);
    if (!state.processedAt) {
      if (signaturesConfirmed !== true || staffRoiConfirmed !== true) throw fail('Confirm the existing paper signatures and matched staff ROI selections.');
      if (!vision || Number(vision.phi_document_id) !== Number(state.documentId) || vision.status !== 'applied'
        || !vision.roi_signature_detected || !vision.disclosure_signature_detected) {
        throw fail('The uploaded ROI/disclosure match needs review before processing can finish. Keep the signed paper; no new signatures are requested.');
      }
      if (!['yes', 'no'].includes(state.sharedCustody)) throw fail('Clarify custody/decision-making rights before finishing this packet.');
      if (!state.guardian1Id || (state.guardian2Id && Number(state.guardian1Id) === Number(state.guardian2Id))) throw fail('Each parent needs their own enabled portal contact.');
      if (state.sharedCustody === 'yes' && !state.guardian2Id) throw fail('Complete the second guardian’s portal contact.');
      await deps.markSignatures({clientId:client.id,actorUserId:actorId,packetVersionLabel:vision.detected_version_label});
      await deps.markDocuments({clientId:client.id,actorUserId:actorId,items:[{key:'roi',status:'present'}]});
      await deps.acknowledgeRoi({clientId:client.id,actorUserId:actorId});
      client = await readClient(clientId, deps);
      state.processedAt = new Date().toISOString(); state.processedByUserId = actorId;
      state.signatureSourceDocumentId = Number(state.documentId); state.packetEvaluationId = Number(vision.id);
      await deps.clients.update(client.id, {guardian_portal_enabled:1}, actorId);
      await writeState(client, state, actorId, deps);
    }
    state.invitations = { ...(state.invitations || {}) };
    for (const guardianId of [...new Set([state.guardian1Id,state.guardian2Id].filter(Boolean).map(Number))]) {
      if (['sent','queued','pending','redirected','unconfirmed'].includes(state.invitations[guardianId]?.status)) continue;
      const link = await deps.guardians.getLink({clientId:client.id,guardianUserId:guardianId});
      if (!link || ![1,true].includes(link.access_enabled)) {
        state.invitations[guardianId] = {status:'blocked',reason:'Guardian access is disabled. Review this contact in the client profile.'};
      } else {
        try {
          state.invitations[guardianId] = {status:'pending',reason:'Invitation delivery is in progress. Check communication history if it stays pending.',attemptedAt:new Date().toISOString()};
          await writeState(client, state, actorId, deps);
          const result = await deps.send({agencyId:client.agency_id,actorUserId:actorId,clientId:client.id,guardianUserId:guardianId,existingLinkOnly:true,paperPacketProcessed:true});
          const d = result?.delivery;
          const status = d?.blocked || d?.skipped ? 'blocked' : d?.queued || d?.pendingApproval ? 'queued' : d?.redirected ? 'redirected' : d?.id ? 'sent' : 'unconfirmed';
          state.invitations[guardianId] = {status,communicationId:d?.id || null,reason:d?.reason || null,attemptedAt:new Date().toISOString()};
        } catch {
          state.invitations[guardianId] = {status:'failed',reason:'Invitation could not be sent. Review delivery details and retry.',attemptedAt:new Date().toISOString()};
        }
      }
      // Save each recipient result before attempting the next invitation.
      await writeState(client, state, actorId, deps);
    }
    return state;
}
