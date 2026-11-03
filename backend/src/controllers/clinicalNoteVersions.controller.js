import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { hasSchedulingBillingAccess } from '../services/schedulingBillingAccess.service.js';
import { getApprovedClinicalContext } from '../services/clinicalNoteVersionBilling.service.js';
import { resolveNoteDocumentationPolicy, parseObject, policyError, validDate } from '../services/supervisedBillingPolicy.service.js';
import { normalizeServiceDetails, serviceDetailTimes, verifyServiceAmendmentLocation, serviceLocationSnapshot } from '../services/clinicalSupervisorReview.service.js';
import { isValidTimeZone } from '../utils/zonedWallTime.util.js';
import { requireStaffPlanActor } from '../utils/planStaffAccess.js';
import { CLINICAL_SIGNER_ROLES } from '../services/clinicalNoteSigningToken.service.js';
import {
  getRevisionSummary, getRevision, proposeRevision, editRevision, signRevision
} from '../services/clinicalNoteVersion.service.js';

const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const signed = (revision, action) => (revision?.signatures || []).some(s => (s.action || s.signatureType || s.signature_type) === action);
const clinicalActor = user => CLINICAL_SIGNER_ROLES.has(String(user?.role || user?.effectiveRole || '').toLowerCase());

async function scope(req) {
  requireStaffPlanActor(req.user);
  const noteId = positiveId(req.params.noteId), agencyId = positiveId(req.body?.agencyId || req.query?.agencyId || req.medicalBillingAgencyId);
  if (!noteId || !agencyId) throw policyError(400, 'A valid noteId and agencyId are required.');
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  let note = await ClinicalNote.findById(noteId);
  if (!note || note.is_deleted || Number(note.agency_id) !== agencyId) throw policyError(404, 'Note not found in this agency.');
  const metadata = parseObject(note.metadata_json);
  if ([metadata.privatePsychotherapyNote, metadata.restricted].some(v => v === true || v === 'true')) throw policyError(403, 'Restricted records require their authorized disclosure workflow.');
  if (!note.provider_signed_at) throw policyError(409, 'Sign the original note before creating an amendment.');
  note = (await getApprovedClinicalContext({ note })).note;
  const policy = await resolveNoteDocumentationPolicy(note);
  const actorUserId = Number(req.user.id), authorId = Number(note.provider_signed_by_user_id || note.created_by_user_id);
  const clinical = clinicalActor(req.user);
  const capabilities = {
    canCreateProvider: clinical && actorUserId === authorId,
    canCreateSupervisor: clinical && actorUserId !== authorId && actorUserId === Number(policy.supervisorUserId),
    canCreateBilling: await hasSchedulingBillingAccess(req.user, agencyId)
  };
  return { noteId, agencyId, note, policy, actorUserId, clinical, capabilities };
}

function revisionCapabilities(revision, summary, context) {
  const pending = Number(summary.pendingRevisionId) === Number(revision.id);
  const author = context.clinical && context.actorUserId === Number(revision.originalAuthorUserId);
  const supervisor = context.clinical && context.actorUserId === Number(revision.responsibleSupervisorUserId)
    && context.actorUserId !== Number(revision.originalAuthorUserId)
    && context.actorUserId === Number(context.policy.supervisorUserId);
  const ownsProposal = context.actorUserId === Number(revision.proposedByUserId);
  const mayEditOrigin = revision.origin === 'provider' ? author : revision.origin === 'supervisor' ? supervisor : context.capabilities.canCreateBilling;
  return {
    canEdit: pending && (author || supervisor || (!revision.signatures?.length && ownsProposal && mayEditOrigin)),
    canSign: pending && revision.origin !== 'supervisor' && author && !signed(revision, 'author_sign'),
    canCosign: pending && supervisor && !signed(revision, 'supervisor_sign') && (revision.origin === 'supervisor' || signed(revision, 'author_sign')),
    canAcknowledge: revision.origin === 'supervisor' && author && signed(revision, 'supervisor_sign') && !signed(revision, 'author_acknowledge')
  };
}

async function contextForRevision(revision, context) {
  if (!revision?.snapshot?.metadataJson) return context;
  try {
    const policy = await resolveNoteDocumentationPolicy({ ...context.note, metadata_json: revision.snapshot.metadataJson });
    return { ...context, policy };
  } catch {
    // Historical content remains retrievable when an old assignment expires.
    return { ...context, policy: { supervisorUserId: null } };
  }
}
async function exposeRevision(revision, summary, context) {
  return revision ? { ...revision, capabilities: revisionCapabilities(revision, summary, await contextForRevision(revision, context)) } : null;
}
async function summaryResponse(context) {
  const summary = await getRevisionSummary(context);
  const revisions = await Promise.all((summary.revisions || []).map(r => exposeRevision(r, summary, context)));
  return {
    ...summary,
    revisions,
    pendingRevision: revisions.find(r => Number(r.id) === Number(summary.pendingRevisionId)) || await exposeRevision(summary.pendingRevision, summary, context),
    effectiveRevision: revisions.find(r => Number(r.id) === Number(summary.effectiveRevisionId)) || await exposeRevision(summary.effectiveRevision, summary, context),
    capabilities: context.capabilities
  };
}

function editInput(body) {
  const result = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.length > 255) throw policyError(400, 'Enter a title of 1–255 characters.');
    result.title = body.title.trim();
  }
  if (body.notePayload !== undefined) {
    const payload = typeof body.notePayload === 'string' ? body.notePayload : JSON.stringify(body.notePayload);
    if (!payload?.trim() || payload.length > 200000 || body.notePayload === null) throw policyError(400, 'Enter complete clinical content of at most 200,000 characters.');
    result.notePayload = payload;
  }
  for (const key of ['metadataJson', 'encounterContext']) {
    if (body[key] !== undefined) {
      if (!body[key] || typeof body[key] !== 'object' || Array.isArray(body[key]) || JSON.stringify(body[key]).length > 100000) throw policyError(400, `${key} must be an object of at most 100,000 characters.`);
      result[key] = body[key];
    }
  }
  const reason = String(body.reason || '').trim();
  if (!reason || reason.length > 2000) throw policyError(400, 'Enter an amendment reason of 1–2,000 characters.');
  result.reason = reason;
  if (!/^[a-f0-9]{64}$/i.test(String(body.expectedContentHash || ''))) throw policyError(400, 'The exact version content hash is required. Reload this note.');
  if (!positiveId(body.expectedVersionNumber)) throw policyError(400, 'The expected version number is required. Reload this note.');
  result.expectedContentHash = body.expectedContentHash;
  result.expectedVersionNumber = Number(body.expectedVersionNumber);
  return result;
}

async function validateClinicalInput(context, input, base) {
  const before = base.snapshot?.encounterContext || {};
  const metadata = input.metadataJson;
  if (metadata) {
    const original = base.snapshot?.metadataJson || {};
    for (const key of ['privatePsychotherapyNote', 'restricted', 'source', 'screeningTaskId']) {
      if (metadata[key] !== original[key]) throw policyError(400, `An amendment cannot change ${key}.`);
    }
    // Clinical metadata and the encounter snapshot describe one signed service.
    // Route metadata-only corrections through the same service validation.
    const derived = { ...(input.encounterContext || {}) };
    const changedMetadata = (key, from, to) => {
      if (to !== undefined && JSON.stringify(to) !== JSON.stringify(from) && derived[key] === undefined) derived[key] = to;
    };
    for (const key of ['dateOfService', 'serviceCode', 'serviceLines']) changedMetadata(key, original[key], metadata[key]);
    for (const key of ['durationMinutes', 'startTime', 'endTime', 'locationLabel', 'placeOfService', 'participants', 'patientPresent']) changedMetadata(key, original.structuredChart?.[key], metadata.structuredChart?.[key]);
    if (Object.keys(derived).length) input.encounterContext = derived;
  }
  const changed = input.encounterContext;
  if (!changed) return;
  if (changed.renderingProviderUserId !== undefined && Number(changed.renderingProviderUserId) !== Number(before.renderingProviderUserId)) throw policyError(400, 'An amendment cannot replace the original treating provider.');
  const encounter = { ...before, ...changed };
  if (changed.dateOfService !== undefined && !validDate(changed.dateOfService)) throw policyError(400, 'Enter a valid service date.');
  if (changed.serviceCode !== undefined && !/^[A-Z0-9]{4,10}$/.test(String(changed.serviceCode))) throw policyError(400, 'Enter a valid service code.');
  if (changed.sourceTimezone !== undefined && !isValidTimeZone(changed.sourceTimezone)) throw policyError(400, 'Enter a valid encounter timezone.');
  const serviceKeys = ['durationMinutes', 'startTime', 'endTime', 'locationLabel', 'placeOfService', 'serviceLocationId', 'dateOfService', 'sourceTimezone', 'participants', 'patientPresent'];
  const changedService = serviceKeys.some(key => changed[key] !== undefined && JSON.stringify(changed[key] ?? null) !== JSON.stringify(before[key] ?? null));
  if (!changedService) return;
  const details = normalizeServiceDetails(encounter);
  const times = serviceDetailTimes(details, encounter.dateOfService, encounter.sourceTimezone || 'America/Denver');
  const [[session]] = await clinicalPool.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?', [context.note.clinical_session_id, context.agencyId, context.note.client_id]);
  if (!session) throw policyError(409, 'The linked clinical encounter is unavailable.');
  const location = await verifyServiceAmendmentLocation(context.note, session, details);
  const snapshot = serviceLocationSnapshot(location);
  input.encounterContext = { ...encounter, ...details, scheduledStartAt: times.startAt, scheduledEndAt: times.endAt, isTelehealth: ['02', '10'].includes(details.placeOfService), locationSnapshot: snapshot, billingOfficeLocationId: snapshot.billingOfficeLocationId };
}

function proposedPolicyNote(context, input, baseMetadata = context.note.metadata_json) {
  const metadata = { ...parseObject(input.metadataJson || baseMetadata) };
  for (const key of ['serviceCode', 'dateOfService']) if (input.encounterContext?.[key] !== undefined) metadata[key] = input.encounterContext[key];
  return { ...context.note, metadata_json: metadata };
}

export async function listClinicalNoteVersions(req, res, next) {
  try { res.json(await summaryResponse(await scope(req))); } catch (error) { next(error); }
}

export async function getClinicalNoteVersion(req, res, next) {
  try {
    const context = await scope(req), revisionId = positiveId(req.params.versionId);
    if (!revisionId) throw policyError(400, 'A valid versionId is required.');
    const summary = await getRevisionSummary(context);
    const revision = await getRevision({ ...context, revisionId });
    res.json({ revision: await exposeRevision(revision, summary, context), capabilities: context.capabilities });
  } catch (error) { next(error); }
}

export async function createClinicalNoteVersion(req, res, next) {
  try {
    const context = await scope(req), input = editInput(req.body);
    const expectedRevisionId = positiveId(req.body.baseRevisionId || req.body.expectedRevisionId);
    if (!expectedRevisionId) throw policyError(400, 'Select the approved base version before proposing an amendment.');
    const baseRevision = await getRevision({ ...context, revisionId: expectedRevisionId });
    await validateClinicalInput(context, input, baseRevision);
    const origin = req.body.origin || (context.capabilities.canCreateProvider ? 'provider' : context.capabilities.canCreateSupervisor ? 'supervisor' : 'billing');
    const permitted = { provider: context.capabilities.canCreateProvider, supervisor: context.capabilities.canCreateSupervisor, billing: context.capabilities.canCreateBilling };
    if (!permitted[origin]) throw policyError(403, 'You cannot propose this type of clinical amendment.');
    // Assignment and signature requirements are resolved by the server, never by the proposer.
    const policy = await resolveNoteDocumentationPolicy(proposedPolicyNote(context, input));
    if (origin === 'supervisor' && Number(policy.supervisorUserId) !== context.actorUserId) throw policyError(403, 'Only the responsible final supervisor may propose this amendment.');
    const revision = await proposeRevision({ ...context, ...input, expectedRevisionId, baseRevisionId: expectedRevisionId, origin,
      responsibleSupervisorUserId: Number(policy.supervisorUserId) || null, requiresSupervisorCosign: !!policy.supervisorUserId });
    res.status(201).json({ ok: true, revision, ...await summaryResponse(context), claimTransmitted: false });
  } catch (error) { next(error); }
}

export async function updateClinicalNoteVersion(req, res, next) {
  try {
    const context = await scope(req), revisionId = positiveId(req.params.versionId), input = editInput(req.body);
    if (!revisionId) throw policyError(400, 'A valid versionId is required.');
    const summary = await getRevisionSummary(context), revision = await getRevision({ ...context, revisionId });
    if (!revisionCapabilities(revision, summary, await contextForRevision(revision, context)).canEdit) throw policyError(403, 'Only the proposer or responsible clinician may revise this pending amendment.');
    await validateClinicalInput(context, input, revision);
    const policy = await resolveNoteDocumentationPolicy(proposedPolicyNote(context, input, revision.snapshot?.metadataJson));
    const updated = await editRevision({ ...context, ...input, revisionId, expectedRevisionId: revisionId,
      responsibleSupervisorUserId: Number(policy.supervisorUserId) || null, requiresSupervisorCosign: !!policy.supervisorUserId });
    res.json({ ok: true, revision: updated, ...await summaryResponse(context), claimTransmitted: false });
  } catch (error) { next(error); }
}

async function attest(req, res, next, action, capability) {
  try {
    const context = await scope(req), revisionId = positiveId(req.params.versionId);
    if (!revisionId) throw policyError(400, 'A valid versionId is required.');
    if (req.body.attested !== true || !/^[a-f0-9]{64}$/i.test(String(req.body.expectedContentHash || ''))) throw policyError(400, 'Review and attest to this exact version before signing.');
    if (req.body.expectedEntryManifestHash !== undefined && !/^[a-f0-9]{64}$/i.test(String(req.body.expectedEntryManifestHash))) throw policyError(400, 'The reviewed entry manifest hash is invalid. Reopen this version.');
    const summary = await getRevisionSummary(context), revision = await getRevision({ ...context, revisionId });
    if (!revisionCapabilities(revision, summary, await contextForRevision(revision, context))[capability]) throw policyError(403, 'You are not the assigned clinical signer for this version or its approval step is not ready.');
    const signedRevision = await signRevision({ ...context, revisionId, action, attested: true, expectedContentHash: req.body.expectedContentHash, expectedEntryManifestHash: req.body.expectedEntryManifestHash });
    res.json({ ok: true, revision: signedRevision, ...await summaryResponse(context), claimTransmitted: false });
  } catch (error) { next(error); }
}
export const signClinicalNoteVersion = (req, res, next) => attest(req, res, next, 'author_sign', 'canSign');
export const cosignClinicalNoteVersion = (req, res, next) => attest(req, res, next, 'supervisor_sign', 'canCosign');
export const acknowledgeClinicalNoteVersion = (req, res, next) => attest(req, res, next, 'author_acknowledge', 'canAcknowledge');
