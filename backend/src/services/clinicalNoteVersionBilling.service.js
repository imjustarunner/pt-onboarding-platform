import clinicalPool from '../config/clinicalDatabase.js';
import { getEffectiveNote, getRevisionSummary, hasPendingRevision, ensureLegacyVersion, ensureOriginalRevision } from './clinicalNoteVersion.service.js';
import { parseObject, policyError, dateOnly } from './supervisedBillingPolicy.service.js';

export const PENDING_CLINICAL_REVISION_HOLD = 'A clinical amendment is pending clinical approval. Claim transmission is paused.';

// Billing always reads the approved snapshot. The live encounter is only a
// fallback for legacy documents which have not acquired a version snapshot.
export async function getApprovedClinicalContext({ note, session = null }, db = clinicalPool) {
  if (note?.provider_signed_at) {
    const summary = await getRevisionSummary({ noteId: note.id, agencyId: note.agency_id }, db);
    if (!summary.originalRevisionId) {
      if (typeof db.getConnection === 'function') await ensureLegacyVersion({ noteId: note.id, agencyId: note.agency_id }, db);
      else {
        let originalSession = session;
        if (!originalSession && note.clinical_session_id) {
          const [[storedSession]] = await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?', [note.clinical_session_id, note.agency_id]);
          originalSession = storedSession;
        }
        await ensureOriginalRevision({ db, note, session: originalSession || {} });
      }
    }
  }
  const approved = await getEffectiveNote({ note, session }, db);
  const context = approved.clinical_version_encounter_context;
  const effectiveSession = { ...(session || {}) };
  if (context && typeof context === 'object') {
    const aliases = {
      durationMinutes: 'duration_minutes', placeOfService: 'place_of_service', serviceLocationId: 'service_location_id',
      billingOfficeLocationId: 'billing_office_location_id', sourceTimezone: 'source_timezone', timeZone: 'source_timezone',
      providerUserId: 'provider_user_id',
      scheduledStartAt: 'scheduled_start_at', scheduledEndAt: 'scheduled_end_at', serviceCode: 'service_code',
      metadataJson: 'metadata_json', isTelehealth: 'is_telehealth'
    };
    const allowed = new Set(['duration_minutes', 'place_of_service', 'service_location_id', 'billing_office_location_id', 'source_timezone', 'scheduled_start_at', 'scheduled_end_at', 'service_code', 'metadata_json', 'is_telehealth', 'provider_user_id', 'rendering_provider_user_id']);
    for (const [key, value] of Object.entries(context)) {
      const target = aliases[key] || key;
      if (allowed.has(target)) effectiveSession[target] = value;
    }
    if (context.locationLabel !== undefined) effectiveSession.metadata_json = { ...parseObject(effectiveSession.metadata_json), locationLabel: context.locationLabel };
    if (context.dateOfService !== undefined) effectiveSession.metadata_json = { ...parseObject(effectiveSession.metadata_json), serviceDate: context.dateOfService };
    if (context.renderingProviderUserId !== undefined) {
      effectiveSession.rendering_provider_user_id = context.renderingProviderUserId;
      if (context.providerUserId == null) effectiveSession.provider_user_id = note.provider_signed_by_user_id || note.created_by_user_id || context.renderingProviderUserId;
    }
  }
  return { note: approved, session: effectiveSession, version: clinicalVersionReference(approved) };
}

export function clinicalVersionReference(note) {
  return {
    revisionId: Number(note?.clinical_version_id) || null,
    revisionNumber: Number(note?.clinical_version_number) || null,
    contentHash: note?.clinical_version_content_hash || null
  };
}

export function approvedVersionBillingBlockers({ note, claim, lines, session = {}, diagnosisCodes = null }) {
  if (!note?.clinical_version_id) return [];
  const metadata = parseObject(note.metadata_json), blockers = [];
  const serviceDate = dateOnly(metadata.dateOfService || metadata.date_of_service || note.clinical_version_encounter_context?.dateOfService || parseObject(session.metadata_json).serviceDate);
  if (serviceDate && serviceDate !== dateOnly(claim.date_of_service)) blockers.push('The claim service date differs from the latest approved clinical version.');
  if (serviceDate && lines.some(line => line.service_date && dateOnly(line.service_date) !== serviceDate)) blockers.push('Claim line dates differ from the latest approved clinical version.');
  const expectedDiagnoses = metadata.diagnosisCodes || metadata.diagnosis_codes || diagnosisCodes;
  if (Array.isArray(expectedDiagnoses) && expectedDiagnoses.length) {
    let claimDiagnoses = claim.diagnosis_codes_json || [];
    if (typeof claimDiagnoses === 'string') { try { claimDiagnoses = JSON.parse(claimDiagnoses); } catch { claimDiagnoses = []; } }
    const normalized = codes => Array.isArray(codes) ? codes.map(code => String(code).trim().toUpperCase()).filter(Boolean) : [];
    if (JSON.stringify(normalized(expectedDiagnoses)) !== JSON.stringify(normalized(claimDiagnoses))) blockers.push('The claim diagnoses differ from the latest approved clinical version.');
  }
  const serviceCode = String(metadata.serviceCode || session.service_code || '').toUpperCase();
  const primaryLines = lines.filter(line => String(line.procedure_code || '').toUpperCase() === serviceCode);
  if (serviceCode && primaryLines.length !== 1) blockers.push('The claim service code differs from the latest approved clinical version.');
  if (serviceCode && metadata.billingPrimaryUnits != null && primaryLines.reduce((sum, line) => sum + Number(line.units), 0) !== Number(metadata.billingPrimaryUnits)) blockers.push('The claim units differ from the latest approved clinical version.');
  const placeOfService = metadata.structuredChart?.placeOfService || session.place_of_service;
  if (placeOfService && String(claim.place_of_service) !== String(placeOfService)) blockers.push('The claim place of service differs from the latest approved clinical version.');
  if (Array.isArray(metadata.billingAddons)) {
    const expected = new Map();
    for (const addon of metadata.billingAddons) {
      const code = String(addon.serviceCode || addon.service_code || addon.code || '').toUpperCase();
      if (code) expected.set(code, (expected.get(code) || 0) + Number(addon.units || 1));
    }
    const actual = new Map();
    for (const line of lines.filter(line => String(line.procedure_code || '').toUpperCase() !== serviceCode)) {
      const code = String(line.procedure_code || '').toUpperCase();
      actual.set(code, (actual.get(code) || 0) + Number(line.units));
    }
    if (expected.size !== actual.size || [...expected].some(([code, units]) => actual.get(code) !== units)) blockers.push('The claim add-on services differ from the latest approved clinical version.');
  }
  return blockers;
}

export async function clinicalVersionBillingState({ noteId, agencyId }, db = clinicalPool) {
  const summary = await getRevisionSummary({ noteId, agencyId }, db);
  return { ...summary, pending: !!summary.pendingRevisionId, blockers: summary.pendingRevisionId ? [PENDING_CLINICAL_REVISION_HOLD] : [] };
}

// Call under the same note lock used to queue transmission. Amendment writes
// take that lock too, closing the gap between preflight and queueing a claim.
export async function assertClinicalVersionSubmission({ noteId, agencyId, expectedRevisionId, expectedContentHash }, db = clinicalPool) {
  if (await hasPendingRevision({ noteId, agencyId }, db)) throw policyError(409, PENDING_CLINICAL_REVISION_HOLD);
  const summary = await getRevisionSummary({ noteId, agencyId }, db);
  if (Number(summary.effectiveRevisionId) !== Number(expectedRevisionId) || !expectedContentHash || summary.effectiveRevision?.contentHash !== expectedContentHash) throw policyError(409, 'The approved clinical version changed. Review the claim again.');
  return summary.effectiveRevision;
}
