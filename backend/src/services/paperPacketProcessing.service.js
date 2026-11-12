import {withPaperProcessingClientLock} from './paperProcessingSource.service.js';
import {paperPacketRoiExpiresAtYmd} from '../utils/paperPacketRoiExpiry.js';
import {findSchoolPacketVersionByLabel} from './schoolPrintablePacketCache.service.js';
import {encryptDemographicsPayload,decryptDemographicsPayload} from './demographicsImport.service.js';
import {paperProcessingForReplacement} from '../utils/paperProcessingReplacement.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
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
export const PAPER_PROCESSING_STEPS = ['demographics', 'guardian1', 'guardian2', 'school', 'insurance', 'consents'];
export const paperProcessingState = client => object(client?.onboarding_docs_json).paperProcessing || { completedSteps: [], invitations: {} };
const dependencies = overrides => ({ clients: Client, guardians: ClientGuardian, documents: ClientPhiDocument, agencies: Agency,
  versions:findSchoolPacketVersionByLabel,staff:ClientSchoolStaffRoiAccess,encryptDraft:encryptDemographicsPayload,decryptDraft:decryptDemographicsPayload,
  vision: getLatestPaperPacketVisionEval, send: sendHubPortalInvitation, markSignatures: markPaperPacketSignatureReceived,
  markDocuments: updateClientOnboardingDocs, acknowledgeRoi: acknowledgeRoiStaffOnboarding, database: pool, ...overrides });

async function readClient(clientId, deps) {
  const client = await deps.clients.findById(clientId, { includeSensitive: true });
  if (!client) throw fail('Client not found', 404);
  if (!isPaperPacketClient(client) || !Number(client.organization_id)) throw fail('This workflow is for an uploaded school paper packet.');
  return client;
}
async function writeState(client,state,actorId,deps,roiExpiresAt=null){
  const docs=object(client.onboarding_docs_json);
  if(Number(docs.paperPacketSource?.documentId)&&Number(state.documentId)!==Number(docs.paperPacketSource.documentId))throw fail('The packet source changed. Reload the current packet before continuing.',409);
  const expectedRevision=Number(docs.paperProcessing?.workingDraftRevision||0);
  const sourceId=Number(docs.paperPacketSource?.documentId||docs.paperProcessing?.documentId||state.documentId);
  state.workingDraftRevision=expectedRevision+1;
  if(deps.clients===Client)await compareAndSetPaperProcessingState({clientId:client.id,agencyId:client.agency_id,schoolId:client.organization_id,sourceId,expectedRevision,state,roiExpiresAt},deps.database);
  else await deps.clients.update(client.id,{onboarding_docs_json:JSON.stringify({...docs,paperProcessing:state}),...(roiExpiresAt?{roi_expires_at:roiExpiresAt}:{})},actorId);
  client.onboarding_docs_json={...docs,paperProcessing:state};
}
/** Atomic metadata-only save: no delayed draft may overwrite a replacement or newer worker. */
export async function compareAndSetPaperProcessingState({clientId,agencyId,schoolId,sourceId,expectedRevision,state,roiExpiresAt=null},db=pool){
 const [result]=await db.execute(`UPDATE clients SET onboarding_docs_json=JSON_SET(COALESCE(NULLIF(onboarding_docs_json,''),JSON_OBJECT()),'$.paperProcessing',CAST(? AS JSON)),roi_expires_at=COALESCE(?,roi_expires_at)
 WHERE id=? AND agency_id=? AND organization_id=? AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(onboarding_docs_json,'$.paperPacketSource.documentId')) AS UNSIGNED),CAST(JSON_UNQUOTE(JSON_EXTRACT(onboarding_docs_json,'$.paperProcessing.documentId')) AS UNSIGNED),?)=?
 AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(onboarding_docs_json,'$.paperProcessing.workingDraftRevision')) AS UNSIGNED),0)=?`,[JSON.stringify(state),roiExpiresAt,clientId,agencyId,schoolId,sourceId,sourceId,expectedRevision]);
 if(Number(result?.affectedRows)!==1)throw fail('The packet source or working draft changed. Reload the current packet before continuing.',409);
}

async function sourceDocument(client, documentId, deps, {historicalRead=false}={}) {
  const doc = documentId ? await deps.documents.findSchoolPaperPacket(client.id, Number(documentId)) : null;
  if (!doc || Number(doc.client_id) !== Number(client.id) || Number(doc.agency_id) !== Number(client.agency_id)
    || (!historicalRead && Number(doc.school_organization_id)!==Number(client.organization_id)) || !(doc.referral_draft_id || doc.source_referral_draft_id) || doc.removed_at || doc.scan_status !== 'clean') throw fail('Select the uploaded packet after its file check is complete.');
  return doc;
}
export async function paperProcessingSourceDocument(clientId, documentId, overrides = {}) {
  const deps = dependencies(overrides);
  return sourceDocument(await readClient(clientId, deps), documentId, deps,{historicalRead:true});
}
export async function paperProcessingContext(clientId, overrides = {}) {
  const deps = dependencies(overrides), client = await readClient(clientId, deps);
  const [guardians, school, vision, documents] = await Promise.all([deps.guardians.listForClient(client.id), deps.agencies.findById(client.organization_id), deps.vision(client.id), deps.documents.findSchoolPaperPacketsForClient(client.id)]);
  const fields = ['id','agency_id','organization_id','full_name','date_of_birth','gender','grade','address_street','address_apt','address_city','address_state','address_zip','preferred_language','primary_parent_language','insurance_type_id'];
  return { client: Object.fromEntries(fields.map(key => [key, client[key] ?? null])), schoolName: school?.name || '',
    documents: (documents || []).filter(doc => (doc.referral_draft_id || doc.source_referral_draft_id) && !doc.removed_at
      && Number(doc.client_id) === Number(client.id) && Number(doc.agency_id) === Number(client.agency_id) && Number(doc.school_organization_id) === Number(client.organization_id))
      .map(doc => ({ id:doc.id, original_name:doc.original_name, mime_type:doc.mime_type, scan_status:doc.scan_status })),
    state: publicState(paperProcessingState(client)), workingDraft:readWorkingDraft(client,deps), guardians: guardians.map(g => ({ guardian_user_id:g.guardian_user_id,
      first_name:g.first_name,last_name:g.last_name,email:g.email,phone_number:g.phone ?? g.phone_number ?? '',
      relationship_title:g.relationship_title,access_enabled:g.access_enabled,permissions_json:g.permissions_json })),
    packetRead: vision ? { id:vision.id,documentId:vision.phi_document_id,status:vision.status,versionLabel:vision.detected_version_label,
      roiSignatureDetected:!!vision.roi_signature_detected,disclosureSignatureDetected:!!vision.disclosure_signature_detected,
      reviewReasons:vision.review_reasons || [] } : null };
}
export async function savePaperProcessingStep(input, overrides = {}) {
  const deps = dependencies(overrides);
  return withPacketLock(input.clientId, deps, connection => saveStep(input, {...deps,packetConnection:connection}));
}
async function saveStep({ clientId, actorId, step, data = {} }, overrides = {}) {
  const deps = dependencies(overrides), client = await readClient(clientId, deps);
  if(step==='draft')return saveWorkingDraft(client,data,actorId,deps);
  if (!PAPER_PROCESSING_STEPS.includes(step)) throw fail('Unknown paper-packet step.');
  let state = { ...paperProcessingState(client) };
  if (state.processedAt) throw fail('This packet has already been processed. Use the client profile for later changes.', 409);
  if (step === 'demographics') {
    const doc = await sourceDocument(client, data.documentId, deps);
    const currentSource=Number(object(client.onboarding_docs_json).paperPacketSource?.documentId||0);if(currentSource&&currentSource!==Number(doc.id))throw fail('Select the current uploaded packet before saving these entries.',409);
    const first = String(data.firstName || '').trim(), last = String(data.lastName || '').trim();
    const dob = String(data.dateOfBirth || '').trim();
    if (!first || !last || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(Date.parse(`${dob}T12:00:00Z`))
      || new Date(`${dob}T12:00:00Z`).toISOString().slice(0,10) !== dob) throw fail('Enter the client’s first name, last name and a valid date of birth.');
    const patch = { full_name:`${first} ${last}`,date_of_birth:dob };
    for (const key of ['gender','grade','address_street','address_apt','address_city','address_state','address_zip','preferred_language']) {
      if (data[key] != null) patch[key] = String(data[key]).trim().slice(0,255);
    }
    await deps.clients.update(client.id, patch, actorId);
    if (state.documentId && Number(state.documentId) !== Number(doc.id)) {
      // Keep entered demographics/contact/coverage data; the replacement needs
      // a fresh human review of its consent evidence.
      state = paperProcessingForReplacement(state,doc.id);
    }
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
  } else if (step === 'consents') {
    return saveReviewedConsent({client,state,data,actorId,deps});
  }
  state.completedSteps = [...new Set([...(state.completedSteps || []), step])];
  delete state.workingDraftEnc;
  state.updatedAt = new Date().toISOString();
  await writeState(client, state, actorId, deps,step==='consents'?state.consentReview?.roiExpiresAt:null);
  return publicState(state);
}

async function withPacketLock(clientId,deps,action){return withPaperProcessingClientLock(clientId,action,deps.database);}

export async function completePaperProcessing(input, overrides = {}) {
  const deps = dependencies(overrides);
  return withPacketLock(input.clientId, deps, () => complete(input, deps));
}
async function complete({clientId, actorId, signaturesConfirmed, staffRoiConfirmed}, deps) {
    let client = await readClient(clientId, deps), state = { ...paperProcessingState(client) };
    if (!state.processedAt && PAPER_PROCESSING_STEPS.some(step => !(state.completedSteps || []).includes(step))) throw fail('Complete each packet-processing step first.');
    await sourceDocument(client, state.documentId, deps);
    const vision = await deps.vision(client.id);
    if (!state.processedAt) {
      if (signaturesConfirmed !== true || staffRoiConfirmed !== true) throw fail('Confirm the existing paper signatures and matched staff ROI selections.');
      assertPacketMatch(client, state, vision);
      if(state.consentReview?.kind==='human_source_review'){const current=await deps.staff.listSchoolStaffRosterForClient({clientId:client.id,schoolOrganizationId:client.organization_id,roiExpiresAt:client.roi_expires_at});const key=rows=>JSON.stringify(rows.map(row=>({schoolStaffUserId:Number(row.schoolStaffUserId||row.school_staff_user_id),state:row.state||row.effective_access_state||row.access_level||'packet'})).sort((a,b)=>a.schoolStaffUserId-b.schoolStaffUserId));if(key(current)!==key(state.consentReview.staffSelections))throw fail('School staff selections changed after the paper review. Review and save the release step again.',409);}
      if (!['yes', 'no'].includes(state.sharedCustody)) throw fail('Clarify custody/decision-making rights before finishing this packet.');
      if (!state.guardian1Id || (state.guardian2Id && Number(state.guardian1Id) === Number(state.guardian2Id))) throw fail('Each parent needs their own enabled portal contact.');
      if (state.sharedCustody === 'yes' && !state.guardian2Id) throw fail('Complete the second guardian’s portal contact.');
      await deps.markSignatures({clientId:client.id,actorUserId:actorId,packetVersionLabel:state.consentReview?.versionLabel||vision.detected_version_label,packetLocale:state.consentReview?.locale||'en',paperRoiSignedDate:state.consentReview?.roi?.signedDate||null});
      await deps.markDocuments({clientId:client.id,actorUserId:actorId,items:[{key:'roi',status:'present'}]});
      await deps.acknowledgeRoi({clientId:client.id,actorUserId:actorId});
      client = await readClient(clientId, deps);
      state.processedAt = new Date().toISOString(); state.processedByUserId = actorId;
      state.signatureSourceDocumentId = Number(state.documentId); state.packetEvaluationId = Number(vision.id);delete state.workingDraftEnc;
      await deps.clients.update(client.id, {guardian_portal_enabled:1}, actorId);
      await writeState(client, state, actorId, deps);
    }
    state.invitations = { ...(state.invitations || {}) };
    for (const guardianId of [...new Set([state.guardian1Id,state.guardian2Id].filter(Boolean).map(Number))]) {
      if (['sent','queued','pending','redirected','unconfirmed','unknown'].includes(state.invitations[guardianId]?.status)) continue;
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
    return publicState(state);
}

function assertPacketMatch(client, state, vision) {
  const review=state.consentReview;
  if(review?.kind==='human_source_review' && Number(review.documentId)===Number(state.documentId) && Number(review.evaluationId)===Number(vision?.id) && Number(vision?.phi_document_id)===Number(state.documentId) && review.versionId && review.roi?.status==='present' && review.disclosure?.status==='present' && review.denyReviewed===true)return;
  const reasons = vision?.review_reasons;
  const reviewedReplacement = Number(object(client.onboarding_docs_json).paperPacketSource?.documentId) === Number(state.documentId)
    && vision?.status === 'needs_review' && Array.isArray(reasons) && reasons.length === 1 && reasons[0] === 'replacement_packet_requires_review';
  if (!vision || Number(vision.phi_document_id) !== Number(state.documentId) || !(vision.status === 'applied' || reviewedReplacement)
    || !vision.roi_signature_detected || !vision.disclosure_signature_detected) {
    throw fail('The uploaded ROI/disclosure match needs review before processing can finish. Keep the signed paper; no new signatures are requested.');
  }
}

function publicState(state){const {workingDraftEnc,...visible}=state;return {...visible,...(visible.previousPackets?{previousPackets:visible.previousPackets.map(({workingDraftEnc,...item})=>item)}:{})};}
function readWorkingDraft(client,deps){
 const envelope=paperProcessingState(client).workingDraftEnc;if(!envelope)return null;
 try{const draft=deps.decryptDraft(envelope);return Number(draft.clientId)===Number(client.id)&&Number(draft.agencyId)===Number(client.agency_id)&&Number(draft.schoolId)===Number(client.organization_id)&&Number(draft.documentId)===Number(object(client.onboarding_docs_json).paperPacketSource?.documentId||paperProcessingState(client).documentId)?draft:null;}catch{return null;}
}
async function saveWorkingDraft(client,data,actorId,deps){
 const state={...paperProcessingState(client)};if(Number(data.expectedDraftRevision)!==Number(state.workingDraftRevision||0))throw fail('A newer working draft is already saved. Reload before continuing.',409);if(state.processedAt)throw fail('This packet has already been processed.',409);
 const doc=await deps.documents.findSchoolPaperPacket(client.id,Number(data.documentId));
 const evaluation=await deps.vision(client.id);if(evaluation&&Number(data.evaluationId)!==Number(evaluation.id))throw fail('The packet reading changed. Reload before saving this working draft.',409);
 const current=Number(object(client.onboarding_docs_json).paperPacketSource?.documentId||state.documentId||data.documentId);
 if(!doc||doc.removed_at||!(doc.referral_draft_id||doc.source_referral_draft_id)||Number(doc.client_id)!==Number(client.id)||Number(doc.agency_id)!==Number(client.agency_id)||Number(doc.school_organization_id)!==Number(client.organization_id)||current!==Number(doc.id))throw fail('The packet source changed. Reload the current packet before saving this working draft.',409);
 const snapshot={};for(const key of ['stage','demographics','guardianForms','secondNotListed','schoolConfirmed','sharedCustody','insuranceTypeId','insuranceReviewed','humanEvidence'])if(data[key]!==undefined)snapshot[key]=data[key];
 if(JSON.stringify(snapshot).length>24000)throw fail('This working draft is too large. Save the current step instead.');
 if(!state.documentId)state.documentId=Number(doc.id);
 const savedAt=new Date().toISOString();state.workingDraftEnc=deps.encryptDraft({...snapshot,clientId:client.id,agencyId:client.agency_id,schoolId:client.organization_id,documentId:doc.id,evaluationId:evaluation?.id||null,savedAt,savedByUserId:actorId});
 await writeState(client,state,actorId,deps);return {...publicState(state),workingDraftSavedAt:savedAt};
}
const calendar=value=>{const raw=String(value||'');return /^\d{4}-\d{2}-\d{2}$/.test(raw)&&Number.isFinite(Date.parse(raw+'T12:00:00Z'))&&new Date(raw+'T12:00:00Z').toISOString().slice(0,10)===raw?raw:null;};
async function validateHumanEvidence(client,state,vision,evidence,deps,actorId){
 if(!vision||Number(vision.phi_document_id)!==Number(state.documentId)||Number(evidence.evaluationId)!==Number(vision.id)||Number(evidence.documentId)!==Number(state.documentId)||!['applied','needs_review'].includes(vision.status))throw fail('The packet reading changed. Reopen and review the current source before confirming it.',409);
 if(evidence.sourceViewed!==true||evidence.denyReviewed!==true)throw fail('Review this source PDF, its printed version, and every DENY selection before confirming.');
 const versionLabel=String(evidence.versionLabel||'').trim(),locale=evidence.locale==='es'?'es':'en';
 const version=versionLabel?await deps.versions(client.organization_id,locale,versionLabel):null;
 if(!version?.id)throw fail('The printed packet version could not be matched for this school. Leave it pending and obtain the correct packet.');
 const signatures={};for(const key of ['roi','disclosure']){const signature=evidence[key]||{},signerName=String(signature.signerName||'').trim().slice(0,255),signedDate=calendar(signature.signedDate),page=Number(signature.page);
 if(signature.status!=='present'||signerName.length<2||!signedDate||!Number.isInteger(page)||page<1||page>100)throw fail('Confirm a present signature, printed signer name, valid signed date, and PDF page for both ROI and disclosure. Missing or uncertain signatures stay pending.');
 signatures[key]={status:'present',signerName,signedDate,page};}
 const expiresAt=paperPacketRoiExpiresAtYmd(signatures.roi.signedDate);
 const staff=await deps.staff.listSchoolStaffRosterForClient({clientId:client.id,schoolOrganizationId:client.organization_id,roiExpiresAt:expiresAt});
 if(!staff.length)throw fail('Review the school staff list before confirming the paper release.');
 return {kind:'human_source_review',roiExpiresAt:expiresAt,versionId:Number(version.id),versionLabel:version.version_label||versionLabel,locale,sourceViewed:true,denyReviewed:true,...signatures,staffSelections:staff.map(staffReviewSelection)};
}

/** Consent review, paper-date expiry, and explicit staff edits commit as one source-bound operation. */
async function saveReviewedConsent({client,state,data,actorId,deps}){
 if(data.signaturesConfirmed!==true||data.staffRoiConfirmed!==true)throw fail('Review the paper consents, signatures and staff release selections.');
 const atomic=deps.clients===Client,connection=deps.packetConnection;let transaction=false;
 try{
  if(atomic){
   await connection.beginTransaction();transaction=true;
   const [[locked]]=await connection.execute('SELECT agency_id,organization_id,onboarding_docs_json FROM clients WHERE id=? FOR UPDATE',[client.id]);
   const current=object(locked?.onboarding_docs_json),expected=object(client.onboarding_docs_json);
   if(!locked||Number(locked.agency_id)!==Number(client.agency_id)||Number(locked.organization_id)!==Number(client.organization_id)||Number(current.paperPacketSource?.documentId||current.paperProcessing?.documentId)!==Number(state.documentId)||Number(current.paperProcessing?.workingDraftRevision||0)!==Number(expected.paperProcessing?.workingDraftRevision||0))throw fail('The packet source or review changed. Reload before confirming permissions.',409);
   const [[doc]]=await connection.execute("SELECT id FROM client_phi_documents WHERE id=? AND client_id=? AND agency_id=? AND school_organization_id=? AND removed_at IS NULL AND scan_status='clean' FOR UPDATE",[state.documentId,client.id,client.agency_id,client.organization_id]);if(!doc)throw fail('The current source is not ready for review.',409);
   const [[evaluation]]=await connection.execute('SELECT id,phi_document_id FROM client_paper_packet_vision_evals WHERE client_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE',[client.id]);if(Number(evaluation?.id)!==Number(data.evidenceReview?.evaluationId)||Number(evaluation?.phi_document_id)!==Number(state.documentId))throw fail('The packet reading changed. Reopen the current source.',409);
  }
  await sourceDocument(client,state.documentId,deps);
  const vision=await deps.vision(client.id),manual=data.evidenceReview?await validateHumanEvidence(client,state,vision,data.evidenceReview,deps,actorId):null;
  if(!manual)throw fail('Record the printed packet version, signer names and dates, and source review before saving the paper release.');
  const changes=Array.isArray(data.staffChanges)?data.staffChanges:[],allowed=new Set(manual.staffSelections.map(row=>Number(row.schoolStaffUserId))),seen=new Set();
  if(changes.length>allowed.size)throw fail('Review the current school staff list.');
  for(const change of changes){const id=Number(change.schoolStaffUserId);if(!allowed.has(id)||seen.has(id)||!['packet','limited','roi','roi_docs'].includes(change.nextState))throw fail('A staff selection does not belong to the current school.');seen.add(id);}
  const scoped=atomic?{...deps,database:connection}:deps;
  state.consentReview={...manual,documentId:state.documentId,evaluationId:vision.id,reviewedByUserId:actorId,reviewedAt:new Date().toISOString()};
  state.completedSteps=[...new Set([...(state.completedSteps||[]),'consents'])];delete state.workingDraftEnc;state.updatedAt=new Date().toISOString();
  // CAS takes the source/revision lock before any permission write. The same
  // transaction rolls this back if any staff update or current roster fails.
  await writeState(client,state,actorId,scoped,manual.roiExpiresAt);
  for(const change of changes)await deps.staff.setAccessState({clientId:client.id,schoolOrganizationId:client.organization_id,schoolStaffUserId:Number(change.schoolStaffUserId),nextState:change.nextState,actorUserId:actorId,...(atomic?{db:connection}:{})});
  if(changes.length){const staff=await deps.staff.listSchoolStaffRosterForClient({clientId:client.id,schoolOrganizationId:client.organization_id,roiExpiresAt:manual.roiExpiresAt,...(atomic?{db:connection}:{})});state.consentReview.staffSelections=staff.map(staffReviewSelection);await writeState(client,state,actorId,scoped,manual.roiExpiresAt);}
  if(transaction)await connection.commit();return publicState(state);
 }catch(error){if(transaction)await connection.rollback();throw error;}
}
function staffReviewSelection(row){return {schoolStaffUserId:Number(row.school_staff_user_id),name:[row.first_name,row.last_name].filter(Boolean).join(' ')||null,state:row.effective_access_state||row.roi_state||row.effective_state||row.access_level||'packet'};}
