import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { recordClientDemographics, recordClientGuardians } from './recordClientIdentity.service.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import { requireNarrivaClient } from './narrivaAccess.service.js';
import { getApprovedClinicalContext } from './clinicalNoteVersionBilling.service.js';
import { getRevisionSummary } from './clinicalNoteVersion.service.js';
import { downloadMaterial } from './sessionSupportingMaterials.service.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';
import { shareableFile } from './guardianFileShares.service.js';
import { sharedNotePredicate } from './sharedClinicalChart.service.js';
import { logAuditEvent } from './auditEvent.service.js';
import { generateClinicalRecordPdf } from './clinicalRecordPdf.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value || '{}') : value || {}; } catch { return {}; } };
const restricted = row => [parse(row.metadata_json).restricted, parse(row.metadata_json).privatePsychotherapyNote].some(value => value === true || value === 'true');
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const originalDocumentTypes = new Set(['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/rtf', 'text/csv']);
const exportableFile = document => shareableFile(document) || (document.document_type !== 'private_client_medical_history' && document.scan_status === 'clean' && !document.quarantine_path && originalDocumentTypes.has(document.mime_type));
const serviceDate = (value, timeZone = 'America/Denver') => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const instant = value instanceof Date ? value : new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(String(value)) ? String(value).replace(' ', 'T') : `${String(value).replace(' ', 'T')}Z`);
  if (!Number.isFinite(+instant)) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

function treatmentPlanFilename(client, timeZone, now) {
  const person = String(client.full_name || client.recordDemographics?.fullName || '').trim().split(/\s+/);
  const first = client.first_name || person[0] || '';
  const last = client.last_name || (person.length > 1 ? person.at(-1) : '');
  const initials = [first, last].map(name => String(name).normalize('NFD').match(/[A-Za-z]/)?.[0]?.toUpperCase() || '').join('');
  return [initials, 'treatmentplan', serviceDate(now, timeZone)].filter(Boolean).join('-') + '.pdf';
}

export function createClinicalRecordExporter(dependencies = {}) {
  const db = dependencies.clinicalDb || clinicalPool, main = dependencies.mainDb || pool;
  const access = dependencies.clientAccess || requireNarrivaClient;
  const noteModel = dependencies.noteModel || ClinicalNote, planModel = dependencies.planModel || ClinicalTreatmentPlan;
  const draftModel = dependencies.draftModel || ClinicalNoteDraft;
  const planApproval = dependencies.planApproval || (plan => import('./treatmentPlanApproval.service.js').then(service => service.getTreatmentPlanApproval(plan)));
  const approved = dependencies.approvedContext || getApprovedClinicalContext, revisionsFor = dependencies.revisions || getRevisionSummary;
  const render = dependencies.render || generateClinicalRecordPdf;
  const findAgency = dependencies.findAgency || (id => Agency.findById(id));
  const findUser = dependencies.findUser || (id => User.findById(id));
  const readObject = dependencies.readObject || (key => StorageService.readObject(key));
  const decryptDocument = dependencies.decryptDocument || ((document, buffer) => DocumentEncryptionService.decryptPhiDocumentBuffer(document, buffer));
  const material = dependencies.downloadMaterial || downloadMaterial;
  const phiDocuments = dependencies.phiDocuments || (id => ClientPhiDocument.findByClientId(id));
  const chartArtifacts = dependencies.chartArtifacts || (input => import('./clientChartArtifacts.service.js').then(service => service.assembleClientChartArtifacts(input)));
  const artifactView = dependencies.artifactView || (input => import('./clientChartArtifacts.service.js').then(service => service.renderChartArtifactView(input)));
  const intakeDocuments = dependencies.intakeDocuments || (id => import('../models/IntakeSubmissionDocument.model.js').then(model => model.default.listSignedForClient(id)));
  const renderArtifact = dependencies.renderArtifact || (async html => {
    const service = (await import('./documentSigning.service.js')).default;
    return service.convertHTMLToPDF(String(html).replace(/<details(?![^>]*\bopen\b)/gi, '<details open'), { disableFallback: true, networkIsolation: true, documentType: 'clinical_record_supporting_document' });
  });
  const supplement = dependencies.supplement || (args => import('./clinicalRecordSupplement.service.js').then(service => service.collectRecordSupplement(args)));
  const audit = dependencies.audit || logAuditEvent;
  const recordDemographics = dependencies.recordDemographics || recordClientDemographics;
  const recordGuardians = dependencies.recordGuardians || recordClientGuardians;

  return async function exportClinicalRecord(req, { noteId = null, draftId = null, planId = null, clientId = null, agencyId, includeDrafts = false, from = '', to = '' } = {}) {
    agencyId = positive(agencyId);
    if (!agencyId || (!positive(noteId) && !positive(draftId) && !positive(clientId))) throw fail(400, 'Choose a client or note and its clinical workspace.');
    if (planId != null && !positive(planId)) throw fail(400,'Choose a valid treatment plan.');
    const singleDocument = !!positive(noteId) || !!positive(draftId) || !!planId;
    for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+new Date(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) throw fail(400, 'Use valid export dates.');
    if (from && to && from > to) throw fail(400, 'The export end date must follow its start date.');
    let sourceNotes = planId ? [] : null;
    if (draftId) {
      const draft = await draftModel.findByIdForUser({ draftId: positive(draftId), userId: req.user.id });
      if (!draft || Number(draft.agency_id) !== agencyId || !positive(draft.client_id)) throw fail(404, 'Your client-linked draft is not available in this workspace.');
      const output = parse(maybeDecryptNotePayload(draft.output_json));
      const metadata = { ...parse(output.meta), dateOfService: draft.date_of_service, serviceCode: draft.service_code };
      if (restricted({ metadata_json: metadata })) throw fail(403, 'Restricted records require their authorized disclosure workflow.');
      clientId = positive(draft.client_id);
      sourceNotes = [{ id: draft.id, agency_id: agencyId, client_id: clientId, clinical_session_id: draft.clinical_session_id,
        created_by_user_id: req.user.id, title: draft.title || output.meta?.toolName || 'Clinical workspace draft', created_at: draft.created_at,
        note_payload: JSON.stringify({ sections: output.sections || { SessionNarrative: maybeDecryptNotePayload(draft.input_text) || '' } }), metadata_json: metadata, is_workspace_draft: true }];
      includeDrafts = true;
    }
    if (noteId) {
      const row = await noteModel.findById(positive(noteId));
      if (!row || row.is_deleted || Number(row.agency_id) !== agencyId) throw fail(404, 'Note not found in this workspace.');
      if (restricted(row)) throw fail(403, 'Restricted records require their authorized disclosure workflow.');
      clientId = positive(row.client_id);
      sourceNotes = [row];
      includeDrafts = !row.provider_signed_at || includeDrafts;
    }
    const client = await access(req.user, agencyId, positive(clientId));
    const [demographics, guardians] = await Promise.all([recordDemographics(client), recordGuardians(positive(clientId))]);
    client.recordDemographics = demographics;
    client.recordGuardians = guardians;
    const agency = await findAgency(agencyId);
    if (!agency) throw fail(404, 'Clinical workspace not found.');
    if (planId) sourceNotes = [];
    if (!sourceNotes) {
      const dateExpression = "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.snapshot_json,'$.metadataJson.dateOfService')),JSON_UNQUOTE(JSON_EXTRACT(v.snapshot_json,'$.encounterContext.dateOfService')),JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.dateOfService')),DATE(n.created_at))";
      const [rows] = await db.execute(`SELECT n.* FROM clinical_notes n LEFT JOIN clinical_note_revision_heads h ON h.clinical_note_id=n.id AND h.agency_id=n.agency_id LEFT JOIN clinical_note_revisions v ON v.id=h.effective_revision_id WHERE n.agency_id=? AND n.client_id=? AND n.is_deleted=0 AND ${sharedNotePredicate('n')} ${includeDrafts ? '' : 'AND n.provider_signed_at IS NOT NULL'} ${from ? `AND ${dateExpression}>=?` : ''} ${to ? `AND ${dateExpression}<=?` : ''} ORDER BY n.created_at,n.id LIMIT 1001`, [agencyId, clientId, ...(from ? [from] : []), ...(to ? [to] : [])]);
      sourceNotes = rows;
    }
    if (sourceNotes.length > 1000) throw fail(413, 'This record has more than 1,000 notes. Export a smaller date range.');
    const notes = [], plans = [], names = {}, manifest = [], attachments = [], seenFiles = new Set();
    let diagnoses = [];
    let attachmentBytes = 0;
    const includeAttachment = file => {
      attachmentBytes += file.buffer?.length || 0;
      if (attachmentBytes > 100 * 1024 * 1024) throw fail(413, 'This record exceeds the 100 MB export limit. Export a smaller date range.');
      attachments.push(file);
    };
    const nameFor = async id => {
      if (!positive(id) || names[id]) return;
      const user = await findUser(id);
      names[id] = [user?.first_name, user?.last_name, user?.credential || user?.credentials].filter(Boolean).join(' ') || `User ${id}`;
    };
    for (let note of sourceNotes) {
      const [[session]] = note.clinical_session_id ? await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?', [note.clinical_session_id, agencyId, clientId]) : [[{}]];
      if (note.clinical_session_id && !session) throw fail(409, 'A linked clinical session is unavailable. No incomplete record was exported.');
      const context = note.is_workspace_draft ? { note, session: session || {} } : await approved({ note, session: session || {} }, db);
      note = context.note;
      const metadata = parse(note.metadata_json);
      const date = serviceDate(metadata.dateOfService || metadata.date_of_service || parse(context.session?.metadata_json).serviceDate || context.session?.scheduled_start_at || note.created_at, context.session?.source_timezone || agency.timezone);
      if ((from && date < from) || (to && date > to)) continue;
      let addenda = [], revisions = [];
      if (note.provider_signed_at) {
        const summary = await revisionsFor({ noteId: note.id, agencyId }, db);
        revisions = summary.revisions || [];
        addenda = summary.currentAddenda || note.clinical_version_addenda || [];
        const pending = revisions.filter(revision => !revision.approval && revision.status !== 'original');
        if (!includeDrafts && pending.length) manifest.push({ name: `${note.title || 'Clinical note'} — proposed amendments`, disposition: 'Unapproved proposed versions excluded from the signed record', reason: `${pending.length} proposed version(s); obtain an explicitly marked draft export to review them.` });
      } else if (!note.is_workspace_draft) {
        const [rows] = await db.execute('SELECT * FROM clinical_note_addenda WHERE clinical_note_id=? AND agency_id=? ORDER BY created_at,id', [note.id, agencyId]);
        addenda = rows;
      }
      for (const actorId of [context.session?.provider_user_id, note.created_by_user_id, note.provider_signed_by_user_id, note.supervisor_cosigned_by_user_id, ...addenda.map(entry => entry.created_by_user_id), ...revisions.flatMap(revision => (revision.signatures || []).map(signature => signature.actorUserId))]) await nameFor(actorId);
      notes.push({ note, session: context.session || session || {}, addenda, revisions });
    }
    if (!singleDocument || planId) {
      if (!planId) [diagnoses] = await db.execute('SELECT icd10_code,description,is_primary,is_active,created_at,updated_at FROM clinical_diagnoses WHERE agency_id=? AND client_id=? ORDER BY created_at,id', [agencyId, clientId]);
      const [rows] = planId ? [[{id:positive(planId)}]] : await db.execute("SELECT id FROM clinical_treatment_plans WHERE agency_id=? AND client_id=? AND status<>'deleted' ORDER BY COALESCE(effective_date,DATE(created_at)),id", [agencyId, clientId]);
      for (const row of rows) {
        const plan = await planModel.findById(row.id);
        if (!plan || Number(plan.agency_id) !== agencyId || Number(plan.client_id) !== Number(clientId) || plan.status === 'deleted' || restricted(plan)) continue;
        if (planId && plan.status === 'draft') includeDrafts=true;
        if (!includeDrafts && plan.status === 'draft') continue;
        if (!includeDrafts && plan.status === 'void' && !plan.provider_signed_at) continue;
        const date = serviceDate(plan.effective_date || plan.created_at, agency.timezone);
        if ((from && date < from) || (to && date > to)) continue;
        const approval = await planApproval(plan);
        const providerId = approval.providerSignoff?.providerUserId || approval.providerSignoff?.provider_user_id || approval.providerSignoff?.actorUserId;
        const supervisorId = approval.supervisorSignoff?.supervisorUserId || approval.supervisorSignoff?.supervisor_user_id || approval.supervisorSignoff?.actorUserId;
        for (const actor of [providerId, supervisorId]) await nameFor(actor);
        plans.push({ ...plan, provider_signed_at: approval.providerApproved ? approval.providerSignedAt : null,
          supervisor_signed_at: approval.supervisorApproved ? approval.supervisorApprovedAt : null,
          supervisor_cosigned_at: null,
          providerSignoff: approval.providerSignoff ? { signedBy: names[providerId] || (providerId ? `User ${providerId}` : 'Recorded provider'), signedAt: approval.providerSignedAt, statement: approval.providerSignoff.statement } : null,
          supervisorSignoff: approval.supervisorSignoff ? { signedBy: names[supervisorId] || (supervisorId ? `User ${supervisorId}` : 'Recorded supervisor'), signedAt: approval.supervisorApprovedAt, statement: approval.supervisorSignoff.statement } : null,
          legacyRecordOnFile: approval.legacyRecordOnFile });
      }
    }
    const sessionIds = [...new Set(notes.map(item => positive(item.note.clinical_session_id)).filter(Boolean))];
    let linked = [];
    if (sessionIds.length) {
      [linked] = await db.execute(`SELECT * FROM clinical_documents WHERE agency_id=? AND client_id=? AND is_deleted=0 AND clinical_session_id IN (${sessionIds.map(() => '?').join(',')}) ORDER BY created_at,id`, [agencyId, clientId, ...sessionIds]);
    }
    const phiRows = await phiDocuments(clientId);
    const allowedPhi = phiRows.filter(document => Number(document.agency_id) === agencyId && Number(document.client_id) === Number(clientId));
    const selectedPhi = new Set();
    for (const document of linked) {
      if (restricted(document)) { manifest.push({ name: 'Restricted supporting document', disposition: 'Not included', reason: 'Separate authorized disclosure required.' }); continue; }
      const metadata = parse(document.metadata_json);
      const phi = allowedPhi.find(item => Number(item.id) === Number(metadata.phiDocumentId));
      if (phi) selectedPhi.add(Number(phi.id));
      if (document.document_type === 'session_supporting_material') {
        try {
          const file = await material(req, Number(document.clinical_session_id), Number(document.id));
          includeAttachment({ buffer: file.body, mimeType: file.type, name: `session-${document.id}-${StorageService.sanitizeFilename(file.name)}` });
          if (phi) seenFiles.add(Number(phi.id));
        } catch (error) {
          if (error.status === 413) throw error;
          if (![403, 404, 409].includes(error.status)) throw fail(503, 'A supporting file could not be read. No incomplete record was exported.');
          manifest.push({ name: document.title || 'Session supporting material', disposition: 'Not included', reason: error.status === 409 ? 'Pending security scan or quarantined.' : 'Unavailable or outside the permitted file scope.' });
          if (phi) seenFiles.add(Number(phi.id));
        }
      } else if (!phi) manifest.push({ name: document.title || document.original_name || 'Clinical document', disposition: 'Not included', reason: 'This legacy file lacks a verified client document link. Its storage address was not followed.' });
    }
    for (const document of allowedPhi) {
      if (seenFiles.has(Number(document.id)) || (singleDocument && !selectedPhi.has(Number(document.id)))) continue;
      if (document.removed_at || (document.expires_at && +new Date(document.expires_at) <= Date.now())) {
        manifest.push({ name: document.document_title || document.original_name || 'Supporting document', disposition: 'Not included', reason: 'The source document was removed or expired and was not retrieved.' });
        continue;
      }
      if (!exportableFile(document) || restricted(document)) {
        manifest.push({ name: document.document_title || document.original_name || 'Supporting document', disposition: 'Not included', reason: document.quarantine_path || (document.scan_status && document.scan_status !== 'clean') ? 'Pending security scan or quarantined.' : 'This document requires a separate authorized disclosure.' });
        continue;
      }
      try {
        const stored = await readObject(document.storage_path);
        const buffer = document.is_encrypted ? await decryptDocument(document, stored) : stored;
        includeAttachment({ buffer, mimeType: document.mime_type, name: `document-${document.id}-${StorageService.sanitizeFilename(document.original_name || document.document_title || 'supporting-document')}` });
      } catch (error) { if (error.status === 413) throw error; throw fail(503, 'A supporting document could not be read. No incomplete record was exported.'); }
    }
    if (!singleDocument) {
      const {pages,manifest:additionalManifest} = await supplement({user:req.user,agencyId,client,inRange:value=>{
        const date = serviceDate(value,agency.timezone);
        return (!from || date >= from) && (!to || (date && date <= to));
      }});
      manifest.push(...additionalManifest);
      for (const page of pages) includeAttachment({buffer:await renderArtifact(page.html),mimeType:'application/pdf',name:page.name});
      const bundle = await chartArtifacts({ clientId, client });
      const signed = await intakeDocuments(clientId);
      for (const artifact of bundle.artifacts || []) {
        const key = String(artifact.viewKey || '');
        if (!key || key.startsWith('phi-')) continue;
        // Signed intake paths come only from the same-client document reader,
        // never from browser-supplied paths or arbitrary remote URLs.
        if (key.startsWith('isd-')) {
          const document = signed.find(item => Number(item.id) === Number(key.slice(4)));
          if (!document?.signed_pdf_path) { manifest.push({ name: artifact.title, disposition: 'Not included', reason: 'The original signed intake file is unavailable.' }); continue; }
          try { includeAttachment({ buffer: await readObject(document.signed_pdf_path), mimeType: 'application/pdf', name: `intake-${document.id}-${StorageService.sanitizeFilename(artifact.title || 'signed-form')}.pdf` }); }
          catch (error) { if (error.status === 413) throw error; throw fail(503, 'A signed intake document could not be read. No incomplete record was exported.'); }
          continue;
        }
        const view = await artifactView({ client, viewKey: key });
        if (view.html) includeAttachment({ buffer: await renderArtifact(view.html), mimeType: 'application/pdf', name: `${StorageService.sanitizeFilename(key)}.pdf` });
        else if (view.packet) {
          const { clinicalValueHtml } = await import('./clinicalRecordPdf.service.js');
          includeAttachment({ buffer: await renderArtifact(`<h1>Signed enrollment packet record</h1>${clinicalValueHtml({ signedAt: view.packet.signed_at, packetVersion: view.packet.packet_version, contents: view.packet.contents })}`), mimeType: 'application/pdf', name: `${StorageService.sanitizeFilename(key)}.pdf` });
        } else manifest.push({ name: artifact.title || 'Chart supporting document', disposition: 'Not included', reason: 'The chart source is unavailable or requires its separate authorized download.' });
      }
    }
    if (planId && !plans.length) throw fail(404,'This treatment plan is unavailable in the selected chart.');
    const recordTitle = planId ? 'Treatment plan' : singleDocument ? notes[0]?.note.title || 'Clinical note' : 'Full medical record';
    const exportedAt = new Date();
    const bytes = await render({ agency, client, notes, plans, diagnoses, names, manifest, attachments, recordTitle, includeDrafts, singleDocument, exportedAt });
    await audit(req, { required: true, actionType: planId ? 'clinical_plan_pdf_exported' : singleDocument ? 'clinical_note_pdf_exported' : 'clinical_medical_record_pdf_exported', agencyId, clientId: Number(clientId), metadata: { clientId: Number(clientId), planId:positive(planId), actorRole: req.user.role, noticeVersion: req.headers?.['x-record-download-notice'] || null, deliveryStage: 'prepared_for_download', noteId: positive(noteId), draftId: positive(draftId), noteCount: notes.length, planCount: plans.length, attachmentCount: attachments.length, includeDrafts, from: from || null, to: to || null } });
    return { bytes, filename: planId ? treatmentPlanFilename(client, agency.timezone || 'America/Denver', exportedAt) : draftId ? `workspace-draft-${draftId}.pdf` : noteId ? `clinical-note-${noteId}.pdf` : `medical-record-${clientId}.pdf` };
  };
}
export default createClinicalRecordExporter();
