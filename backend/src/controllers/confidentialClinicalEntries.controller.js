import { CONFIDENTIAL_ATTESTATION } from '../../../frontend/src/utils/confidentialAttestation.js';
import clinicalDb from '../config/clinicalDatabase.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import { requireNarrivaClient, narrivaError } from '../services/narrivaAccess.service.js';
import { requireStaffCareEligibility } from '../services/staffCareEligibility.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import { buildClinicalIntakeSourceContext } from '../services/noteAidIntakeSources.service.js';

function id(value) {
  if (value == null || value === '') return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw narrivaError(400, 'Invalid clinical record reference.');
  return result;
}

async function chartAccess(req) {
  const agencyId = id(req.query.agencyId);
  const clientId = id(req.params.clientId);
  await requireNarrivaClient(req.user, agencyId, clientId);
  await requireStaffCareEligibility(req.user.id, agencyId);
  return { agencyId, clientId, authorId: id(req.user.id) };
}

async function documentScope(req, { agencyId, clientId, authorId }) {
  const noteId = id(req.query.noteId);
  const draftId = id(req.query.draftId);
  if (noteId && draftId) throw narrivaError(400, 'Select one note.');
  if (noteId) {
    const [[note]] = await clinicalDb.execute(
      'SELECT clinical_session_id,metadata_json FROM clinical_notes WHERE id=? AND agency_id=? AND client_id=? AND created_by_user_id=? AND is_deleted=0',
      [noteId, agencyId, clientId, authorId]
    );
    if (!note) throw narrivaError(404, 'Note unavailable.');
    const meta = typeof note.metadata_json === 'string' ? JSON.parse(note.metadata_json) : note.metadata_json;
    return { noteId, draftId: id(meta?.draftId), sessionId: id(note.clinical_session_id) };
  }
  if (draftId) {
    const draft = await ClinicalNoteDraft.findByIdForUser({ draftId, userId: authorId });
    if (!draft || Number(draft.client_id) !== clientId || Number(draft.agency_id) !== agencyId || !draft.clinical_session_id) {
      throw narrivaError(404, 'Session draft unavailable.');
    }
    return { noteId: null, draftId, sessionId: id(draft.clinical_session_id) };
  }
  return { noteId: null, draftId: null, sessionId: null };
}

async function entryFilter(req, scope) {
  const { noteId, draftId, sessionId } = await documentScope(req, scope);
  const base = 'agency_id=? AND client_id=? AND author_user_id=?';
  const params = [scope.agencyId, scope.clientId, scope.authorId];
  if (!noteId && !draftId) return { sql: base, params };
  return {
    sql: base + ' AND (clinical_note_id=? OR (draft_id=? AND clinical_session_id=?))',
    params: [...params, noteId, draftId, sessionId]
  };
}

function audit(req, scope, actionType, targetId) {
  return logAuditEvent(req, {
    agencyId: scope.agencyId, actionType, targetType: 'clinical_confidential_entry',
    targetId, metadata: { clientId: scope.clientId }, required: true
  });
}

const handle = action => async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    await action(req, res);
  } catch (error) {
    next(error);
  }
};

export const listEntries = handle(async (req, res) => {
  const scope = await chartAccess(req);
  const filter = await entryFilter(req, scope);
  // The body requires an explicit, separately audited read.
  const [rows] = await clinicalDb.execute(
    'SELECT id,created_at,clinical_note_id,draft_id FROM clinical_confidential_entries WHERE ' + filter.sql + ' ORDER BY id DESC',
    filter.params
  );
  await audit(req, scope, 'clinical_confidential_list', null);
  res.json({ entries: rows.map(row => ({
    id: row.id, createdAt: row.created_at, kind: row.clinical_note_id || row.draft_id ? 'addendum' : 'note'
  })) });
});

export const readEntry = handle(async (req, res) => {
  const scope = await chartAccess(req);
  const entryId = id(req.params.entryId);
  const filter = await entryFilter(req, scope);
  const [[entry]] = await clinicalDb.execute(
    'SELECT body_encrypted FROM clinical_confidential_entries WHERE id=? AND ' + filter.sql,
    [entryId, ...filter.params]
  );
  if (!entry) throw narrivaError(404, 'Confidential entry unavailable.');
  await audit(req, scope, 'clinical_confidential_open', entryId);
  res.json({ body: JSON.parse(maybeDecryptNotePayload(entry.body_encrypted)).body });
});

export const createEntry = handle(async (req, res) => {
  const scope = await chartAccess(req);
  const { noteId, draftId, sessionId } = await documentScope(req, scope);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const key = String(req.body?.requestKey || '');
  if (!body || body.length > 32000 || req.body?.attested !== true || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key)) {
    throw narrivaError(400, 'Enter your note and confirm the confidentiality attestation.');
  }
  const ciphertext = maybeEncryptNotePayload(JSON.stringify({ body, attestation: CONFIDENTIAL_ATTESTATION }));
  const db = await clinicalDb.getConnection();
  try {
    await db.beginTransaction();
    await db.execute(
      'INSERT INTO clinical_confidential_entries (agency_id,client_id,author_user_id,clinical_session_id,clinical_note_id,draft_id,request_key,body_encrypted,attestation_version) VALUES(?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE id=id',
      [scope.agencyId, scope.clientId, scope.authorId, sessionId, noteId, draftId, key, ciphertext]
    );
    const [[row]] = await db.execute(
      'SELECT id,agency_id,client_id,clinical_note_id,draft_id,clinical_session_id,body_encrypted FROM clinical_confidential_entries WHERE author_user_id=? AND request_key=?',
      [scope.authorId, key]
    );
    if (Number(row.agency_id) !== scope.agencyId || Number(row.client_id) !== scope.clientId ||
        id(row.clinical_note_id) !== noteId || id(row.clinical_session_id) !== sessionId || id(row.draft_id) !== draftId ||
        JSON.parse(maybeDecryptNotePayload(row.body_encrypted)).body !== body) {
      throw narrivaError(409, 'This save belongs to another entry. Reopen the editor.');
    }
    await audit(req, scope, 'clinical_confidential_save', row.id);
    await db.commit();
    res.status(201).json({ id: row.id });
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
});

export const enrollmentSections = handle(async (req, res) => {
  const scope = await chartAccess(req);
  const context = await buildClinicalIntakeSourceContext(scope);
  await logAuditEvent(req, {
    agencyId: scope.agencyId, actionType: 'clinical_enrollment_note_import',
    targetType: 'client', targetId: scope.clientId, required: true
  });
  res.json({ sections: context.manualSections || {} });
});
