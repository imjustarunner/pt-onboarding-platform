import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { queueCommittedClinicalSourceChange } from './assistantClinicalSourceChange.service.js';
import { maybeDecryptNotePayload, maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';
import { zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';

// Queue and delivery state are operational. Everything else is clinical content.
export const OPERATIONAL_NOTE_METADATA_KEYS = Object.freeze([
  'supervisorQueue', 'supervisorCosign', 'supervisorCosignHistory', 'reviewRequests',
  'serviceDetailAmendments', 'billingAmendments', 'printUpload', 'digitalShare'
]);
const fail = (status, message) => Object.assign(new Error(message), { status });
const object = value => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
};
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value === undefined ? null : value;
};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const clinicalMetadata = value => Object.fromEntries(Object.entries(object(value)).filter(([key]) => !OPERATIONAL_NOTE_METADATA_KEYS.includes(key)));
const iso = value => value instanceof Date ? value.toISOString() : value || null;
const localPart = (value, timeZone, kind) => {
  if (!value) return null;
  const raw = String(value), instant = value instanceof Date ? value : new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(raw) ? raw.replace(' ', 'T') : `${raw.replace(' ', 'T')}Z`);
  if (!Number.isFinite(+instant)) return null;
  try {
    const options = kind === 'date' ? { year: 'numeric', month: '2-digit', day: '2-digit' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, ...options }).formatToParts(instant).map(p => [p.type, p.value]));
    return kind === 'date' ? `${parts.year}-${parts.month}-${parts.day}` : `${parts.hour}:${parts.minute}`;
  } catch { throw fail(409, 'The encounter timezone is invalid.'); }
};

export function clinicalNoteSnapshot(note, session = {}) {
  const metadataJson = clinicalMetadata(note.metadata_json), chart = object(metadataJson.structuredChart);
  const sourceTimezone = session.source_timezone || 'America/Denver';
  return {
    title: String(note.title || ''), notePayload: note.note_payload ?? '', metadataJson,
    addenda: [],
    noteType: note.note_type || null, isBillable: Boolean(note.is_billable),
    primaryDiagnosisId: note.primary_diagnosis_id ?? null, diagnosticJustification: note.diagnostic_justification ?? null,
    encounterContext: {
      clinicalSessionId: id(note.clinical_session_id), clientId: id(note.client_id), sourceTimezone,
      metadataJson: clone(object(session.metadata_json)), providerUserId: id(session.provider_user_id),
      scheduledStartAt: iso(session.scheduled_start_at), scheduledEndAt: iso(session.scheduled_end_at),
      dateOfService: metadataJson.dateOfService || localPart(session.scheduled_start_at, sourceTimezone, 'date'),
      serviceCode: metadataJson.serviceCode || session.service_code || null,
      effectiveServiceCode: session.effective_service_code || null, billedUnits: session.billed_units ?? null,
      durationMinutes: chart.durationMinutes ?? session.duration_minutes ?? null,
      startTime: chart.startTime || localPart(session.scheduled_start_at, sourceTimezone, 'time'),
      endTime: chart.endTime || localPart(session.scheduled_end_at, sourceTimezone, 'time'),
      locationLabel: chart.locationLabel || object(session.metadata_json).locationLabel || metadataJson.locationLabel || null,
      placeOfService: chart.placeOfService || session.place_of_service || null,
      serviceLocationId: id(session.service_location_id), billingOfficeLocationId: id(session.billing_office_location_id),
      isTelehealth: Boolean(session.is_telehealth), renderingProviderUserId: id(session.rendering_provider_user_id || session.provider_user_id),
      ...((chart.locationSnapshot || object(session.metadata_json).locationSnapshot || metadataJson.locationSnapshot) ? { locationSnapshot: clone(chart.locationSnapshot || object(session.metadata_json).locationSnapshot || metadataJson.locationSnapshot) } : {}),
      ...(chart.participants !== undefined ? { participants: chart.participants } : {}),
      ...(chart.patientPresent !== undefined ? { patientPresent: chart.patientPresent } : {}),
      ...(metadataJson.billingPrimaryUnits !== undefined ? { billingPrimaryUnits: metadataJson.billingPrimaryUnits } : {}),
      ...(metadataJson.billingAddons !== undefined ? { billingAddons: clone(metadataJson.billingAddons) } : {}),
      ...(metadataJson.serviceLines ? { serviceLines: clone(metadataJson.serviceLines) } : {})
    }
  };
}
export function clinicalNoteSnapshotHash(note, session = {}) {
  const snapshot = clinicalNoteSnapshot(note, session);
  snapshot.notePayload = maybeDecryptNotePayload(snapshot.notePayload);
  return hash(snapshot);
}
const snapshotHash = snapshot => hash({ ...snapshot, notePayload: maybeDecryptNotePayload(snapshot.notePayload) });

async function transaction(source, work) {
  const db = await source.getConnection();
  try { await db.beginTransaction(); const result = await work(db); await db.commit(); return result; }
  catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
async function lockedNote(db, noteId, agencyId) {
  const [[note]] = await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE', [noteId, agencyId]);
  if (!note || note.is_deleted) throw fail(404, 'Note not found.');
  if (!note.provider_signed_at) throw fail(409, 'Sign the original clinical note before proposing a revision.');
  return note;
}
async function sessionFor(db, note) {
  if (!note.clinical_session_id) return {};
  const [[session]] = await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?', [note.clinical_session_id, note.agency_id]);
  return session || {};
}
async function heads(db, noteId, agencyId) {
  const [[row]] = await db.execute('SELECT * FROM clinical_note_revision_heads WHERE clinical_note_id=? AND agency_id=?', [noteId, agencyId]);
  return row || null;
}
async function revisionRow(db, noteId, agencyId, revisionId) {
  const [[row]] = await db.execute('SELECT * FROM clinical_note_revisions WHERE id=? AND clinical_note_id=? AND agency_id=?', [revisionId, noteId, agencyId]);
  if (!row) throw fail(404, 'Clinical revision not found.');
  return row;
}
async function signaturesFor(db, revisionId) {
  const [rows] = await db.execute("SELECT * FROM clinical_note_revision_signatures WHERE revision_id=? AND signature_action<>'addendum_sign' ORDER BY id", [revisionId]);
  return rows;
}
async function entryState(db, noteId, agencyId) {
  const [entries] = await db.execute(`SELECT a.*,s.id AS revision_signature_id,s.content_hash AS signature_content_hash
    FROM clinical_note_addenda a LEFT JOIN clinical_note_revision_signatures s ON s.addendum_id=a.id AND s.signature_action='addendum_sign'
    WHERE a.clinical_note_id=? AND a.agency_id=? ORDER BY a.id`, [noteId,agencyId]);
  const manifest=entries.map(entry => ({ addendumId: Number(entry.id), entryKind: entry.entry_kind || null, createdByUserId: id(entry.created_by_user_id),
    authorSignedAt: iso(entry.author_signed_at), signatureId: id(entry.revision_signature_id),
    contentHash: entry.signature_content_hash || hash({ id:Number(entry.id),body:maybeDecryptNotePayload(entry.body),entryKind:entry.entry_kind || null,reason:entry.entry_reason || null,createdByUserId:id(entry.created_by_user_id),authorSignedAt:iso(entry.author_signed_at) }),
    evidenceKind: entry.revision_signature_id ? 'revision_signature' : 'observed_legacy_entry' }));
  return {entries,manifest,manifestHash:hash(manifest)};
}
const entryIdentity=entry=>({id:Number(entry.id),body:maybeDecryptNotePayload(entry.body),entryKind:entry.entry_kind || null,reason:entry.entry_reason || null,createdByUserId:id(entry.created_by_user_id),authorSignedAt:entry.author_signed_at ? new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(String(entry.author_signed_at)) || entry.author_signed_at instanceof Date ? entry.author_signed_at : `${String(entry.author_signed_at).replace(' ','T')}Z`).toISOString() : null});
async function assertEntryManifest(db,revision,expectedEntryManifestHash) {
  const state=await entryState(db,revision.clinical_note_id,revision.agency_id);
  if (expectedEntryManifestHash !== undefined && expectedEntryManifestHash !== state.manifestHash) throw fail(409,'Attached clinical entries changed. Reopen this version, review the current entries and attest again.');
  if (expectedEntryManifestHash === undefined) {
    const captured=(object(revision.snapshot_json).addenda || []).map(entryIdentity).sort((a,b)=>a.id-b.id);
    const current=state.entries.map(entryIdentity).sort((a,b)=>a.id-b.id);
    if(hash(captured)!==hash(current))throw fail(409,'Attached clinical entries changed since this snapshot. Review the current entry manifest before signing.');
  }
  return state;
}
async function insertSignature(db, revision, actorUserId, action, attestation = {}) {
  const {manifest,manifestHash}=await entryState(db,revision.clinical_note_id,revision.agency_id);
  const [result] = await db.execute(`INSERT INTO clinical_note_revision_signatures
    (revision_id,clinical_note_id,agency_id,signature_action,actor_user_id,addendum_id,content_hash,attestation_json)
    VALUES(?,?,?,?,?,?,?,?)`, [revision.id, revision.clinical_note_id, revision.agency_id, action, actorUserId, attestation.addendumId || null, revision.content_hash,
    JSON.stringify({ attested: true, ...attestation, entryManifest:manifest,entryManifestHash:manifestHash })]);
  // An AFTER INSERT trigger writes the exact signature/revision/hash to audit
  // in this same transaction. Failure of audit persistence aborts this insert.
  return Number(result.insertId);
}

// The caller holds the note lock and owns the transaction. Call after persisting
// the actual provider signature/time, using the exact locked note and encounter.
// Historical reads MUST leave signatureEvent false: observation is not signing.
export async function ensureOriginalRevision({ db, note, session = {}, actorUserId = null, signatureEvent = false, responsibleSupervisorUserId = null, supervisorUserId = null, requiresSupervisorCosign = false }) {
  if (!db || !note?.provider_signed_at) throw fail(409, 'A persisted original provider signature is required.');
  const existing = await heads(db, note.id, note.agency_id);
  if (existing) return revisionRow(db, note.id, note.agency_id, existing.original_revision_id);
  const authorUserId = id(note.provider_signed_by_user_id || note.created_by_user_id);
  if (!authorUserId) throw fail(409, 'The original clinical author cannot be determined.');
  if (signatureEvent && id(actorUserId) !== authorUserId) throw fail(403, 'Only the original author may sign the original clinical note.');
  const snapshot = clinicalNoteSnapshot(note, session);
  const [addenda] = await db.execute('SELECT * FROM clinical_note_addenda WHERE clinical_note_id=? AND agency_id=? ORDER BY id', [note.id, note.agency_id]);
  snapshot.addenda = addenda.map(clone);
  const contentHash = snapshotHash(snapshot);
  const provenance = {
    kind: signatureEvent ? 'live_signature' : 'legacy_observed', observedAt: new Date().toISOString(), hashAlgorithm: 'canonical_snapshot_sha256',
    legacyProviderSignedAt: iso(note.provider_signed_at), legacyProviderSignedByUserId: note.provider_signed_by_user_id || null,
    legacySupervisorCosignedAt: iso(note.supervisor_cosigned_at), legacySupervisorCosignedByUserId: note.supervisor_cosigned_by_user_id || null,
    legacyContentHash: note.content_hash || null, legacyContentHashScope: 'unknown_legacy',
    legacyStoredPayloadHashMatches: note.content_hash ? crypto.createHash('sha256').update(String(note.note_payload || '')).digest('hex') === note.content_hash : null,
    legacyHashComparisonScope: 'stored_payload_only_not_signature_verification'
  };
  const [result] = await db.execute(`INSERT INTO clinical_note_revisions
    (clinical_note_id,agency_id,revision_number,origin,reason,proposed_by_user_id,original_author_user_id,responsible_supervisor_user_id,requires_supervisor_cosign,snapshot_json,provenance_json,content_hash)
    VALUES(?,?,1,'original',?,?,?,?,?,?,?,?)`, [note.id, note.agency_id, signatureEvent ? 'Original author-signed clinical note' : 'Legacy signed record observed without new signature evidence',
    signatureEvent ? actorUserId : null, authorUserId, id(responsibleSupervisorUserId || supervisorUserId), requiresSupervisorCosign ? 1 : 0,
    JSON.stringify(snapshot), JSON.stringify(provenance), contentHash]);
  const revision = { id: Number(result.insertId), clinical_note_id: note.id, agency_id: note.agency_id, content_hash: contentHash };
  if (signatureEvent) await insertSignature(db, revision, authorUserId, 'initial_author_sign', { originalSignedAt: iso(note.provider_signed_at) });
  await db.execute('INSERT INTO clinical_note_revision_heads(clinical_note_id,agency_id,original_revision_id,effective_revision_id) VALUES(?,?,?,?)', [note.id, note.agency_id, revision.id, revision.id]);
  return revisionRow(db, note.id, note.agency_id, revision.id);
}

export async function appendOriginalSignature({ db, note, session = {}, actorUserId, action = 'initial_supervisor_sign', expectedContentHash,expectedEntryManifestHash }) {
  if (action !== 'initial_supervisor_sign') throw fail(400, 'Use the original signing transaction for an author signature.');
  const revision = await ensureOriginalRevision({ db, note, session });
  if (!expectedContentHash || expectedContentHash !== revision.content_hash) throw fail(409, 'The original revision changed. Reload before signing.');
  await assertEntryManifest(db,revision,expectedEntryManifestHash);
  if (id(actorUserId) !== id(note.supervisor_cosigned_by_user_id) || !note.supervisor_cosigned_at) throw fail(403, 'A persisted authorized supervisor signature is required.');
  const existing = (await signaturesFor(db, revision.id)).find(s => s.signature_action === action);
  if (existing) return existing.id;
  return insertSignature(db, revision, id(actorUserId), action, { originalSignedAt: iso(note.supervisor_cosigned_at) });
}

function signatureView(row) {
  return { id: Number(row.id), action: row.signature_action, actorUserId: Number(row.actor_user_id), signedAt: iso(row.signed_at), contentHash: row.content_hash, attestation: object(row.attestation_json) };
}
function statusFor(row, signatures, approved, head) {
  if (row.origin === 'original') return 'original';
  if (approved) return 'approved';
  if (Number(head?.pending_revision_id) !== Number(row.id)) return 'superseded';
  const actions = new Set(signatures.map(s => s.signature_action));
  if (row.origin === 'supervisor') return !actions.has('supervisor_sign') ? 'awaiting_supervisor_signature' : 'awaiting_author_acknowledgement';
  if (!actions.has('author_sign')) return 'awaiting_author_signature';
  return 'awaiting_supervisor_signature';
}
function readableSnapshot(value) {
  const snapshot = clone(object(value));
  snapshot.notePayload = maybeDecryptNotePayload(snapshot.notePayload);
  snapshot.addenda = (snapshot.addenda || []).map(addition => ({ ...addition, body: maybeDecryptNotePayload(addition.body) }));
  const context = snapshot.encounterContext || {};
  if (!context.startTime && context.scheduledStartAt) context.startTime = localPart(context.scheduledStartAt, context.sourceTimezone || 'America/Denver', 'time');
  if (!context.endTime && context.scheduledEndAt) context.endTime = localPart(context.scheduledEndAt, context.sourceTimezone || 'America/Denver', 'time');
  snapshot.encounterContext = context;
  return snapshot;
}
function revisionView(row, signatures = [], approval = null, head = null, attachments=null) {
  const provenance = object(row.provenance_json);
  if (provenance.legacyStoredPayloadHashMatches != null) provenance.legacyStoredPayloadHashMatches = Boolean(provenance.legacyStoredPayloadHashMatches);
  return {
    id: Number(row.id), revisionNumber: Number(row.revision_number), parentRevisionId: id(row.parent_revision_id), supersedesRevisionId: id(row.supersedes_revision_id),
    origin: row.origin, reason: row.reason, proposedByUserId: id(row.proposed_by_user_id), originalAuthorUserId: Number(row.original_author_user_id),
    responsibleSupervisorUserId: id(row.responsible_supervisor_user_id), requiresSupervisorCosign: Boolean(row.requires_supervisor_cosign),
    contentHash: row.content_hash, createdAt: iso(row.created_at), status: statusFor(row, signatures, approval, head),
    snapshot: readableSnapshot(row.snapshot_json), provenance, signatures: signatures.map(signatureView),
    approval: approval ? { id: Number(approval.id), signatureId: Number(approval.signature_id), approvedAt: iso(approval.approved_at), approvedByUserId: Number(approval.approved_by_user_id) } : null,
    ...(attachments?{currentAddenda:attachments.entries.map(entry=>({...entry,body:maybeDecryptNotePayload(entry.body)})),currentEntryManifest:attachments.manifest,entryManifestHash:attachments.manifestHash}:{})
  };
}
export async function getRevisionSummary({ noteId, agencyId }, source = clinicalPool) {
  const head = await heads(source, noteId, agencyId);
  const [rows] = await source.execute('SELECT * FROM clinical_note_revisions WHERE clinical_note_id=? AND agency_id=? ORDER BY revision_number', [noteId, agencyId]);
  const [signatures] = await source.execute("SELECT * FROM clinical_note_revision_signatures WHERE clinical_note_id=? AND agency_id=? AND signature_action<>'addendum_sign' ORDER BY id", [noteId, agencyId]);
  const [approvals] = await source.execute('SELECT * FROM clinical_note_revision_approvals WHERE clinical_note_id=? AND agency_id=? ORDER BY id', [noteId, agencyId]);
  const attachments=await entryState(source,noteId,agencyId);
  const revisions = rows.map(row => revisionView(row, signatures.filter(s => Number(s.revision_id) === Number(row.id)), approvals.find(a => Number(a.revision_id) === Number(row.id)), head,attachments));
  return { originalRevisionId: id(head?.original_revision_id), effectiveRevisionId: id(head?.effective_revision_id), pendingRevisionId: id(head?.pending_revision_id),
    originalAuthorUserId: revisions[0]?.originalAuthorUserId || null, revisions,
    effectiveRevision: revisions.find(r => r.id === Number(head?.effective_revision_id)) || null,
    pendingRevision: revisions.find(r => r.id === Number(head?.pending_revision_id)) || null,
    currentAddenda:attachments.entries.map(entry=>({...entry,body:maybeDecryptNotePayload(entry.body)})),currentEntryManifest:attachments.manifest,entryManifestHash:attachments.manifestHash };
}
export async function ensureLegacyVersion({ noteId, agencyId }, source = clinicalPool) {
  return transaction(source, async db => {
    const note = await lockedNote(db, noteId, agencyId);
    await ensureOriginalRevision({ db, note, session: await sessionFor(db, note) });
    return getRevisionSummary({ noteId, agencyId }, db);
  });
}
export async function getRevision({ noteId, agencyId, revisionId }, source = clinicalPool) {
  const summary = await getRevisionSummary({ noteId, agencyId }, source);
  const revision = summary.revisions.find(r => r.id === Number(revisionId));
  if (!revision) throw fail(404, 'Clinical revision not found.');
  return revision;
}
export async function hasPendingRevision({ noteId, agencyId }, source = clinicalPool) {
  return Boolean((await heads(source, noteId, agencyId))?.pending_revision_id);
}
export async function listPendingRevisionWork({ agencyIds = [], actorUserId }, source = clinicalPool) {
  const scopedAgencies = [...new Set(agencyIds.map(id).filter(Boolean))], actor = id(actorUserId);
  if (!scopedAgencies.length || !actor) return [];
  const [rows] = await source.execute(`SELECT r.*,n.client_id,n.title,n.metadata_json
    FROM clinical_note_revision_heads h JOIN clinical_note_revisions r ON r.id=h.pending_revision_id
    JOIN clinical_notes n ON n.id=r.clinical_note_id AND n.agency_id=r.agency_id
    WHERE h.agency_id IN (${scopedAgencies.map(() => '?').join(',')}) AND n.is_deleted=0
      AND (r.original_author_user_id=? OR r.responsible_supervisor_user_id=?)
    ORDER BY r.created_at,r.id`, [...scopedAgencies, actor, actor]);
  const work = [];
  for (const row of rows) {
    const signatures = await signaturesFor(source, row.id), actions = new Set(signatures.map(s => s.signature_action));
    const nextAction = row.origin === 'supervisor' ? 'supervisor_sign' : actions.has('author_sign') ? 'supervisor_sign' : 'author_sign';
    const nextUserId = nextAction === 'author_sign' ? Number(row.original_author_user_id) : Number(row.responsible_supervisor_user_id);
    if (actor !== nextUserId || actions.has(nextAction)) continue;
    const snapshot = object(row.snapshot_json), context = snapshot.encounterContext || {};
    work.push({ clinicalNoteId: Number(row.clinical_note_id), agencyId: Number(row.agency_id), clientId: Number(row.client_id), title: snapshot.title || row.title,
      providerUserId: Number(row.original_author_user_id), supervisorUserId: id(row.responsible_supervisor_user_id), revisionId: Number(row.id), revisionNumber: Number(row.revision_number),
      proposedByUserId: id(row.proposed_by_user_id),
      origin: row.origin, status: nextAction === 'author_sign' ? 'awaiting_author_signature' : 'awaiting_supervisor_signature', nextAction,
      contentHash: row.content_hash, createdAt: iso(row.created_at), reason: row.reason, dateOfService: context.dateOfService || null, serviceCode: context.serviceCode || null,
      signatures: signatures.map(signatureView) });
  }
  return work;
}

export async function getEffectiveNote({ note, session = {} }, source = clinicalPool) {
  if (!note?.provider_signed_at) return note;
  const head = await heads(source, note.id, note.agency_id);
  if (!head) throw fail(409, 'Signed note history is not initialized. Complete the clinical revision migration before billing.');
  const row = await revisionRow(source, note.id, note.agency_id, head.effective_revision_id), snapshot = object(row.snapshot_json);
  const [currentAddenda] = await source.execute('SELECT * FROM clinical_note_addenda WHERE clinical_note_id=? AND agency_id=? ORDER BY id', [note.id, note.agency_id]);
  const historicalIds = new Set((snapshot.addenda || []).map(a => Number(a.id)));
  const effectiveAddenda = currentAddenda.filter(a => historicalIds.has(Number(a.id)) || (['addendum', 'late_entry'].includes(a.entry_kind) && a.author_signed_at));
  const operational = Object.fromEntries(Object.entries(object(note.metadata_json)).filter(([key]) => OPERATIONAL_NOTE_METADATA_KEYS.includes(key)));
  const versionSignatures = (await signaturesFor(source, row.id)).map(signatureView);
  const attachments=await entryState(source,note.id,note.agency_id);
  const supervisorSignature = row.origin !== 'original' ? versionSignatures.find(s => s.action === 'supervisor_sign') : null;
  const effectiveMetadata = { ...clinicalMetadata(snapshot.metadataJson), ...operational };
  if (supervisorSignature) effectiveMetadata.supervisorCosign = { revisionId: Number(row.id), signatureId: supervisorSignature.id, contentHash: row.content_hash, cosignedByUserId: supervisorSignature.actorUserId, cosignedAt: supervisorSignature.signedAt };
  return { ...note, title: snapshot.title, note_payload: snapshot.notePayload, note_type: snapshot.noteType ?? note.note_type,
    is_billable: snapshot.isBillable === undefined ? note.is_billable : Number(Boolean(snapshot.isBillable)),
    primary_diagnosis_id: snapshot.primaryDiagnosisId ?? note.primary_diagnosis_id, diagnostic_justification: snapshot.diagnosticJustification ?? note.diagnostic_justification,
    metadata_json: effectiveMetadata,
    ...(supervisorSignature ? { supervisor_cosigned_at: supervisorSignature.signedAt, supervisor_cosigned_by_user_id: supervisorSignature.actorUserId } : {}),
    clinical_version_id: Number(row.id), clinical_version_number: Number(row.revision_number), clinical_version_content_hash: row.content_hash,
    clinical_version_origin: row.origin, clinical_version_requires_supervisor_cosign: Boolean(row.requires_supervisor_cosign),
    clinical_version_encounter_context: snapshot.encounterContext || {},
    clinical_version_signatures: versionSignatures, clinical_version_provenance: object(row.provenance_json),
    clinical_version_pending_id: id(head.pending_revision_id), clinical_version_addenda: effectiveAddenda, clinical_version_signed_addenda: snapshot.addenda || [],clinical_version_entry_manifest:attachments.manifest,clinical_version_entry_manifest_hash:attachments.manifestHash };
}

function assertExpected(input, row, expectedId) {
  const suppliedId = input.baseRevisionId ?? input.expectedRevisionId;
  if (expectedId && Number(suppliedId) !== Number(expectedId)) throw fail(409, 'The approved clinical version changed. Reload before proposing a revision.');
  if (!input.expectedContentHash || input.expectedContentHash !== row.content_hash) throw fail(409, 'The clinical version changed. Reload before continuing.');
  if (input.expectedVersionNumber !== undefined && Number(input.expectedVersionNumber) !== Number(row.revision_number)) throw fail(409, 'The clinical version number changed. Reload before continuing.');
}
function revisedSnapshot(base, input) {
  const snapshot = clone(base);
  // This value is derived by the authenticated controller from document type
  // and clinical metadata. It changes only the new snapshot; legacy V1 flags
  // remain frozen even when they represented an old supervisor approval hold.
  if (input.isBillable !== undefined) {
    if (typeof input.isBillable !== 'boolean') throw fail(400, 'Revision billability must be resolved by the clinical workflow.');
    snapshot.isBillable = input.isBillable;
  }
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255) throw fail(400, 'Enter a title of 1–255 characters.');
    snapshot.title = input.title.trim();
  }
  if (input.notePayload !== undefined) {
    if (typeof input.notePayload !== 'string' || !input.notePayload.trim() || input.notePayload.length > 200000) throw fail(400, 'Enter clinical narrative of 1–200,000 characters.');
    snapshot.notePayload = maybeEncryptNotePayload(input.notePayload);
  }
  if (input.metadataJson !== undefined) {
    if (!input.metadataJson || typeof input.metadataJson !== 'object' || Array.isArray(input.metadataJson)) throw fail(400, 'Clinical metadata must be an object.');
    snapshot.metadataJson = clinicalMetadata(input.metadataJson);
  }
  if (input.encounterContext !== undefined) {
    if (!input.encounterContext || typeof input.encounterContext !== 'object' || Array.isArray(input.encounterContext)) throw fail(400, 'Encounter context must be an object.');
    if (input.encounterContext.clinicalSessionId !== undefined && Number(input.encounterContext.clinicalSessionId) !== Number(base.encounterContext.clinicalSessionId)) throw fail(400, 'A revision cannot move the clinical note to another encounter.');
    if (input.encounterContext.clientId !== undefined && Number(input.encounterContext.clientId) !== Number(base.encounterContext.clientId)) throw fail(400, 'A revision cannot change the clinical client.');
    snapshot.encounterContext = { ...snapshot.encounterContext, ...clone(input.encounterContext) };
    const context = snapshot.encounterContext, meta = snapshot.metadataJson;
    if (['dateOfService', 'sourceTimezone', 'startTime', 'endTime', 'durationMinutes'].some(key => input.encounterContext[key] !== undefined)
        && context.dateOfService && context.startTime && context.endTime) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(context.dateOfService)) || ![context.startTime, context.endTime].every(value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value)))) throw fail(400, 'Enter valid encounter date and start/end times.');
      const [year, month, day] = context.dateOfService.split('-').map(Number);
      const instant = value => { const [hour, minute] = value.split(':').map(Number); return zonedWallTimeToUtc({ year, month, day, hour, minute, timeZone: context.sourceTimezone || 'America/Denver' }); };
      const start = instant(context.startTime), end = instant(context.endTime);
      if (end <= start || Number(context.durationMinutes) !== (end - start) / 60000
          || localPart(start, context.sourceTimezone || 'America/Denver', 'date') !== context.dateOfService
          || localPart(end, context.sourceTimezone || 'America/Denver', 'date') !== context.dateOfService
          || localPart(start, context.sourceTimezone || 'America/Denver', 'time') !== context.startTime
          || localPart(end, context.sourceTimezone || 'America/Denver', 'time') !== context.endTime) throw fail(400, 'Encounter duration must match valid local start/end times on the service date.');
      context.scheduledStartAt = start.toISOString(); context.scheduledEndAt = end.toISOString();
    }
    if (input.encounterContext.placeOfService !== undefined) context.isTelehealth = ['02', '10'].includes(context.placeOfService);
    context.metadataJson = { ...object(context.metadataJson), serviceDate: context.dateOfService, locationLabel: context.locationLabel };
    for (const key of ['dateOfService', 'serviceCode', 'serviceLines', 'billingPrimaryUnits', 'billingAddons']) if (context[key] !== undefined) meta[key] = context[key];
    meta.structuredChart = { ...object(meta.structuredChart) };
    for (const key of ['durationMinutes', 'startTime', 'endTime', 'locationLabel', 'placeOfService', 'participants', 'patientPresent', 'locationSnapshot']) if (context[key] !== undefined) meta.structuredChart[key] = context[key];
  }
  return snapshot;
}
async function insertProposal(db, { note, head, baseRow, supersededRow, input, origin, reason, authorUserId, supervisorUserId, requiresCosign }) {
  const snapshot = revisedSnapshot(object(baseRow.snapshot_json), input);
  const [addenda] = await db.execute('SELECT * FROM clinical_note_addenda WHERE clinical_note_id=? AND agency_id=? ORDER BY id', [note.id, note.agency_id]);
  snapshot.addenda = addenda.map(clone);
  const contentHash = snapshotHash(snapshot);
  const [result] = await db.execute(`INSERT INTO clinical_note_revisions
    (clinical_note_id,agency_id,revision_number,parent_revision_id,supersedes_revision_id,origin,reason,proposed_by_user_id,original_author_user_id,responsible_supervisor_user_id,requires_supervisor_cosign,snapshot_json,provenance_json,content_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [note.id, note.agency_id, head.next_revision_number, head.effective_revision_id, supersededRow?.id || null, origin, reason,
    input.actorUserId, authorUserId, supervisorUserId, requiresCosign ? 1 : 0, JSON.stringify(snapshot), JSON.stringify({ kind: 'amendment', proposedAt: new Date().toISOString(), hashAlgorithm: 'canonical_snapshot_sha256' }), contentHash]);
  await db.execute('UPDATE clinical_note_revision_heads SET pending_revision_id=?,next_revision_number=next_revision_number+1 WHERE clinical_note_id=? AND agency_id=?', [result.insertId, note.id, note.agency_id]);
  return getRevision({ noteId: note.id, agencyId: note.agency_id, revisionId: result.insertId }, db);
}
export async function proposeRevision(input, source = clinicalPool) {
  if (!['provider', 'supervisor', 'billing'].includes(input.origin) || !id(input.actorUserId)) throw fail(400, 'An authorized revision proposer is required.');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 2000) throw fail(400, 'Enter an amendment reason of 1–2,000 characters.');
  return transaction(source, async db => {
    const note = await lockedNote(db, input.noteId, input.agencyId);
    await ensureOriginalRevision({ db, note, session: await sessionFor(db, note) });
    const head = await heads(db, note.id, note.agency_id), baseRow = await revisionRow(db, note.id, note.agency_id, head.effective_revision_id);
    assertExpected(input, baseRow, head.effective_revision_id);
    if (head.pending_revision_id) throw fail(409, 'An amendment is already pending. Open that revision before making another change.');
    const authorUserId = Number(baseRow.original_author_user_id), supervisorUserId = id(input.responsibleSupervisorUserId || input.supervisorUserId);
    if (input.origin === 'provider' && id(input.actorUserId) !== authorUserId) throw fail(403, 'Provider amendments must be proposed by the original clinical author.');
    if (input.origin === 'supervisor' && id(input.actorUserId) !== supervisorUserId) throw fail(403, 'Only the responsible supervisor may propose a supervisor amendment.');
    if ((input.requiresSupervisorCosign || input.origin === 'supervisor') && (!supervisorUserId || supervisorUserId === authorUserId)) throw fail(409, 'Assign a responsible supervisor distinct from the original author.');
    return insertProposal(db, { note, head, baseRow, input, origin: input.origin, reason: input.reason.trim(), authorUserId, supervisorUserId, requiresCosign: Boolean(input.requiresSupervisorCosign || input.origin === 'supervisor') });
  });
}
export async function editRevision(input, source = clinicalPool) {
  return transaction(source, async db => {
    const note = await lockedNote(db, input.noteId, input.agencyId), head = await heads(db, note.id, note.agency_id);
    if (!head || Number(head.pending_revision_id) !== Number(input.revisionId)) throw fail(409, 'This amendment was superseded or approved. Open the current version.');
    const baseRow = await revisionRow(db, note.id, note.agency_id, input.revisionId);
    assertExpected(input, baseRow);
    if (![baseRow.proposed_by_user_id, baseRow.original_author_user_id, baseRow.responsible_supervisor_user_id].some(userId => id(userId) && id(userId) === id(input.actorUserId))) throw fail(403, 'Only the proposer, original author, or responsible supervisor may revise this proposal.');
    if ((await signaturesFor(db, baseRow.id)).length && ![baseRow.original_author_user_id, baseRow.responsible_supervisor_user_id].some(userId => id(userId) && id(userId) === id(input.actorUserId))) throw fail(403, 'A signed proposal can only be superseded by its original author or responsible supervisor.');
    const reason = input.reason === undefined ? baseRow.reason : input.reason;
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) throw fail(400, 'Enter an amendment reason of 1–2,000 characters.');
    // Responsibility inputs come from the controller's authenticated policy
    // resolver, never directly from request body IDs. A successor snapshots the
    // new policy; all signatures on its predecessor remain retained.
    const supervisorUserId = input.responsibleSupervisorUserId === undefined ? id(baseRow.responsible_supervisor_user_id) : id(input.responsibleSupervisorUserId);
    const requiresCosign = baseRow.origin === 'supervisor' || (input.requiresSupervisorCosign === undefined ? Boolean(baseRow.requires_supervisor_cosign) : Boolean(input.requiresSupervisorCosign));
    if (requiresCosign && (!supervisorUserId || supervisorUserId === Number(baseRow.original_author_user_id))) throw fail(409, 'Assign a responsible supervisor distinct from the original author.');
    return insertProposal(db, { note, head, baseRow, supersededRow: baseRow, input, origin: baseRow.origin, reason: reason.trim(), authorUserId: baseRow.original_author_user_id, supervisorUserId, requiresCosign });
  });
}

export async function signRevision(input, source = clinicalPool) {
  if (input.attested !== true || !id(input.actorUserId)) throw fail(400, 'Review and attest to this exact clinical version before signing.');
  if (!['author_sign', 'supervisor_sign', 'author_acknowledge'].includes(input.action)) throw fail(400, 'Choose the required clinical signature action.');
  let committedReference;
  const result = await transaction(source, async db => {
    const note = await lockedNote(db, input.noteId, input.agencyId), head = await heads(db, note.id, note.agency_id);
    if (!head) throw fail(409, 'Clinical version history is unavailable.');
    const revision = await revisionRow(db, note.id, note.agency_id, input.revisionId);
    const lateAcknowledgement = input.action === 'author_acknowledge' && revision.origin === 'supervisor';
    if (Number(head.pending_revision_id) !== Number(input.revisionId) && !lateAcknowledgement) throw fail(409, 'This amendment was superseded or approved. Reload before signing.');
    if (lateAcknowledgement && Number(head.pending_revision_id) !== Number(input.revisionId)) {
      const [[approval]] = await db.execute('SELECT id FROM clinical_note_revision_approvals WHERE revision_id=?', [revision.id]);
      if (!approval) throw fail(409, 'This supervisor amendment was superseded before approval.');
    }
    assertExpected(input, revision);
    await assertEntryManifest(db,revision,input.expectedEntryManifestHash);
    const signatures = await signaturesFor(db, revision.id), actions = new Set(signatures.map(s => s.signature_action));
    const author = id(input.actorUserId) === id(revision.original_author_user_id), supervisor = id(input.actorUserId) === id(revision.responsible_supervisor_user_id);
    if (input.action === 'author_sign' && (!author || revision.origin === 'supervisor')) throw fail(403, 'This version requires a signature from its original clinical author.');
    if (input.action === 'author_acknowledge' && (!author || revision.origin !== 'supervisor')) throw fail(403, 'Only the original author can acknowledge this supervisor amendment.');
    if (input.action === 'supervisor_sign' && (!supervisor || !revision.requires_supervisor_cosign)) throw fail(403, 'Only the responsible supervisor may sign this version.');
    if (input.action === 'supervisor_sign' && revision.origin !== 'supervisor' && !actions.has('author_sign')) throw fail(409, 'The original clinical author must review and sign before supervisor approval.');
    if (actions.has(input.action)) throw fail(409, 'This clinical signature has already been recorded.');
    const signatureId = await insertSignature(db, revision, id(input.actorUserId), input.action, { origin: revision.origin, expectedContentHash: input.expectedContentHash });
    actions.add(input.action);
    const approved = revision.origin === 'supervisor'
      ? input.action === 'supervisor_sign'
      : actions.has('author_sign') && (!revision.requires_supervisor_cosign || actions.has('supervisor_sign'));
    if (approved) {
      await db.execute(`INSERT INTO clinical_note_revision_approvals(revision_id,clinical_note_id,agency_id,approved_by_user_id,signature_id,content_hash)
        VALUES(?,?,?,?,?,?)`, [revision.id, note.id, note.agency_id, input.actorUserId, signatureId, revision.content_hash]);
      await db.execute('UPDATE clinical_note_revision_heads SET effective_revision_id=?,pending_revision_id=NULL WHERE clinical_note_id=? AND agency_id=?', [revision.id, note.id, note.agency_id]);
    }
    const metadata = object(note.metadata_json), now = new Date().toISOString();
    if (approved) {
      for (const amendment of metadata.serviceDetailAmendments || []) {
        if (!amendment.approvedAt && !amendment.supersededByAmendmentId && !amendment.supersededByRevisionId) { amendment.supersededByRevisionId=Number(revision.id); amendment.supersededAt=now; }
      }
      for (const request of metadata.reviewRequests || []) {
        if (!request.resolvedAt && (request.source === 'service_correction' || request.action === 'changes_needed')) {
          request.resolvedAt=now; request.resolvedByRevisionId=Number(revision.id); request.resolvedBySignatureId=signatureId;
        }
      }
    }
    if (approved && revision.responsible_supervisor_user_id) {
      metadata.supervisorQueue = { revision: crypto.randomUUID(), supervisorUserId: Number(revision.responsible_supervisor_user_id), providerUserId: Number(revision.original_author_user_id), status: 'signed', updatedAt: now, synchronizedAt: null, clinicalRevisionId: Number(revision.id), clinicalRevisionContentHash: revision.content_hash, signatureId };
    } else if (input.action === 'author_sign' && revision.requires_supervisor_cosign) {
      metadata.supervisorQueue = { revision: crypto.randomUUID(), supervisorUserId: Number(revision.responsible_supervisor_user_id), providerUserId: Number(revision.original_author_user_id), status: 'awaiting_supervisor', updatedAt: now, synchronizedAt: null, clinicalRevisionId: Number(revision.id), clinicalRevisionContentHash: revision.content_hash, signatureId };
    }
    if (revision.origin === 'supervisor' && approved && !actions.has('author_acknowledge')) {
      metadata.reviewRequests = [...(metadata.reviewRequests || []), { id: crypto.randomUUID(), action: 'review_acknowledge', status: 'review_acknowledge', source: 'clinical_revision', revisionId: Number(revision.id), contentHash: revision.content_hash, signatureId, createdByUserId: id(input.actorUserId), assignedToUserId: Number(revision.original_author_user_id), createdAt: now, acknowledgedAt: null, resolvedAt: null, messageEncrypted: maybeEncryptNotePayload(`Review and acknowledge approved clinical version ${revision.revision_number}. Reason: ${revision.reason}`) }];
    }
    if (input.action === 'author_acknowledge') for (const request of metadata.reviewRequests || []) {
      if (request.source === 'clinical_revision' && Number(request.revisionId) === Number(revision.id)) {
        request.acknowledgedAt = now; request.acknowledgedByUserId = id(input.actorUserId); request.acknowledgementSignatureId = signatureId;
      }
    }
    await db.execute('UPDATE clinical_notes SET metadata_json=? WHERE id=? AND agency_id=?', [JSON.stringify(metadata), note.id, note.agency_id]);
    committedReference = { agencyId: note.agency_id, clientId: note.client_id, sourceKind: 'note_revision', sourceId: revision.id };
    return getRevision({ noteId: note.id, agencyId: note.agency_id, revisionId: revision.id }, db);
  });
  queueCommittedClinicalSourceChange(committedReference);
  return result;
}

// Independent additions preserve both the signed original and current amendment
// approvals. Their own creator signs; they never assert author/supervisor approval.
export async function appendRevisionAddendum(input, source = clinicalPool) {
  if (!['addendum', 'late_entry'].includes(input.entryKind) || input.authorAttested !== true || !id(input.actorUserId)) throw fail(400, 'Choose and attest to an independently signed addendum or late entry.');
  if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 20000 || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 2000) throw fail(400, 'Enter addition text and a reason.');
  let committedReference;
  const result = await transaction(source, async db => {
    const note = await lockedNote(db, input.noteId, input.agencyId);
    await ensureOriginalRevision({ db, note, session: await sessionFor(db, note) });
    const head = await heads(db, note.id, note.agency_id), revision = await revisionRow(db, note.id, note.agency_id, head.effective_revision_id);
    const [result] = await db.execute(`INSERT INTO clinical_note_addenda(clinical_note_id,agency_id,client_id,body,created_by_user_id,entry_kind,entry_reason,author_signed_at)
      VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP(6))`, [note.id, note.agency_id, note.client_id, maybeEncryptNotePayload(input.body.trim()), input.actorUserId, input.entryKind, input.reason.trim()]);
    const [[addition]] = await db.execute('SELECT id,author_signed_at FROM clinical_note_addenda WHERE id=?', [result.insertId]);
    const contentHash = hash({ body: input.body.trim(), reason: input.reason.trim(), entryKind: input.entryKind, actorUserId: id(input.actorUserId), authorSignedAt: iso(addition.author_signed_at), revisionId: Number(revision.id) });
    const signatureId = await insertSignature(db, { ...revision, content_hash: contentHash }, id(input.actorUserId), 'addendum_sign',
      { addendumId: Number(result.insertId), entryKind: input.entryKind, signedByUserId: id(input.actorUserId), signedAt: iso(addition.author_signed_at), boundRevisionContentHash: revision.content_hash });
    committedReference = { agencyId: note.agency_id, clientId: note.client_id, sourceKind: 'note_entry', sourceId: result.insertId };
    return { id: Number(result.insertId), revisionId: Number(revision.id), signatureId, contentHash, signedAt: iso(addition.author_signed_at) };
  });
  queueCommittedClinicalSourceChange(committedReference);
  return result;
}
