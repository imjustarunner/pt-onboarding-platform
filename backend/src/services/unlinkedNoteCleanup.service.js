import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { decryptChatText } from './chatEncryption.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dateOnly = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);

// Fail closed if an old queue payload cannot be read: it may contain the only
// appointment reference. Never include note text or decrypted payloads in previews.
function queueIsUnlinked(row) {
  if (row.clinical_session_id || row.office_event_id || row.clinical_note_id || row.task_id
    || row.signed_at || row.status === 'signed') return false;
  try {
    let payload = JSON.parse(row.payload_enc || '{}');
    if (payload?._enc) payload = JSON.parse(decryptChatText({
      ciphertextB64: payload.ciphertext, ivB64: payload.iv,
      authTagB64: payload.tag, keyId: payload.keyId || null
    }));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    return !['appointmentId', 'appointment_id', 'clinicalSessionId', 'clinical_session_id',
      'officeEventId', 'office_event_id', 'clinicalNoteId', 'taskId'].some(key => payload[key]);
  } catch { return false; }
}

async function assertOwner(actor, db) {
  const userId = positiveId(actor?.id);
  if (!userId || actor.role !== 'super_admin') throw fail(403, 'Super admin access required.');
  const [[current]] = await db.execute('SELECT id, role, is_active, is_archived FROM users WHERE id = ?', [userId]);
  if (current?.role !== 'super_admin' || !Number(current.is_active) || Number(current.is_archived)) {
    throw fail(403, 'An active superadmin account is required.');
  }
  return userId;
}

async function candidates(userId, db, clinical, lock = false) {
  const [drafts] = await db.execute(`SELECT id, user_id, agency_id, client_id, service_code, date_of_service,
      initials, created_at, updated_at, archived_at,
      SHA2(CONCAT(COALESCE(input_text,''), CHAR(0), COALESCE(output_json,'')), 256) AS content_revision
    FROM clinical_note_drafts WHERE user_id = ? AND clinical_session_id IS NULL AND office_event_id IS NULL
    ORDER BY id${lock ? ' FOR UPDATE' : ''}`, [userId]);
  // Include other owners' references so removing one's draft cannot orphan
  // another clinician's work. Only the requesting user's rows can be deleted.
  const [queue] = await db.execute(`SELECT q.* FROM note_aid_work_queue_items q
    WHERE q.user_id = ? OR q.draft_id IN (SELECT id FROM clinical_note_drafts
      WHERE user_id = ? AND clinical_session_id IS NULL AND office_event_id IS NULL)
    ORDER BY q.id${lock ? ' FOR UPDATE' : ''}`, [userId, userId]);
  const protectedDrafts = new Set();
  for (let offset = 0; offset < drafts.length; offset += 200) {
    const ids = drafts.slice(offset, offset + 200).map(row => String(row.id));
    const placeholders = ids.map(() => '?').join(',');
    // Existing chart records (including deleted records and immutable signature
    // history) are never removed by this temporary draft cleanup tool.
    const [notes] = await clinical.execute(`SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.draftId')) AS draft_id
      FROM clinical_notes WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.draftId')) IN (${placeholders})`, ids);
    const [ratings] = await clinical.execute(`SELECT DISTINCT draft_id FROM clinical_treatment_objective_ratings
      WHERE draft_id IN (${placeholders})`, ids);
    for (const row of [...notes, ...ratings]) protectedDrafts.add(Number(row.draft_id));
  }
  const byDraft = new Map();
  for (const row of queue) {
    if (!row.draft_id) continue;
    const linked = byDraft.get(Number(row.draft_id)) || [];
    linked.push(row);
    byDraft.set(Number(row.draft_id), linked);
  }
  const items = [];
  const add = (kind, row, related) => items.push({
    kind, id: Number(row.id), version: digest([row, related]),
    agencyId: row.agency_id, clientId: row.client_id, initials: row.initials || '',
    dateOfService: dateOnly(row.date_of_service), serviceCode: row.service_code || '',
    workQueueCount: related.length, queueIds: related.map(item => Number(item.id)),
    queueKeys: related.map(item => item.client_key)
  });
  for (const draft of drafts) {
    const related = byDraft.get(Number(draft.id)) || [];
    if (protectedDrafts.has(Number(draft.id)) || related.some(row => Number(row.user_id) !== userId || !queueIsUnlinked(row))) continue;
    add('draft', draft, related);
  }
  for (const row of queue) {
    if (Number(row.user_id) === userId && !row.draft_id && queueIsUnlinked(row)) add('work_queue', row, [row]);
  }
  return items;
}

// Dependency injection keeps tests entirely offline; no agent application login
// or production credentials are needed to implement or verify the tool.
export function createUnlinkedNoteCleanup({ db = pool, clinical = clinicalPool } = {}) {
  return {
    async preview(actor) {
      const userId = await assertOwner(actor, db);
      const all = await candidates(userId, db, clinical);
      return { items: all.slice(0, 200).map(({ queueIds, queueKeys, ...item }) => item), total: all.length };
    },
    async remove(actor, selection, audit = {}) {
      if (!Array.isArray(selection) || !selection.length || selection.length > 200
        || selection.some(item => !['draft', 'work_queue'].includes(item?.kind) || !positiveId(item.id)
          || !/^[a-f0-9]{64}$/.test(item.version || ''))
        || new Set(selection.map(item => `${item.kind}:${item.id}`)).size !== selection.length) {
        throw fail(400, 'Select between 1 and 200 reviewed items.');
      }
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const userId = await assertOwner(actor, conn);
        const current = new Map((await candidates(userId, conn, clinical, true)).map(item => [`${item.kind}:${item.id}`, item]));
        const selected = selection.map(item => {
          const row = current.get(`${item.kind}:${item.id}`);
          if (!row || row.version !== item.version) throw fail(409, 'An item changed or is now linked to a record. Refresh the preview and review your selection again.');
          return row;
        });
        const draftIds = selected.filter(row => row.kind === 'draft').map(row => row.id);
        const queueIds = [...new Set(selected.flatMap(row => row.queueIds))];
        if (queueIds.length) {
          const [deleted] = await conn.execute(`DELETE FROM note_aid_work_queue_items
            WHERE user_id = ? AND id IN (${queueIds.map(() => '?').join(',')})`, [userId, ...queueIds]);
          if (deleted.affectedRows !== queueIds.length) throw fail(409, 'My Work changed. Refresh the preview.');
        }
        if (draftIds.length) {
          const [deleted] = await conn.execute(`DELETE FROM clinical_note_drafts
            WHERE user_id = ? AND clinical_session_id IS NULL AND office_event_id IS NULL
              AND id IN (${draftIds.map(() => '?').join(',')})`, [userId, ...draftIds]);
          if (deleted.affectedRows !== draftIds.length) throw fail(409, 'The drafts changed. Refresh the preview.');
        }
        const result = { deletedDraftIds: draftIds, deletedWorkQueueIds: queueIds,
          deletedWorkQueueKeys: [...new Set(selected.flatMap(row => row.queueKeys))],
          clientIds: [...new Set(selected.map(row => row.clientId).filter(Boolean))] };
        // Audit persistence is part of the deletion transaction. Failure aborts
        // the cleanup. This records the human actually clicking the UI button.
        await conn.execute(`INSERT INTO user_activity_log
          (action_type, user_id, ip_address, user_agent, session_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?)`, ['note_aid_unlinked_test_cleanup_deleted', userId,
          audit.ipAddress || null, audit.userAgent || null, audit.sessionId || null,
          JSON.stringify({ ...result, scope: 'own_unlinked_drafts_and_work_queue' })]);
        await conn.commit();
        return result;
      } catch (error) { await conn.rollback(); throw error; }
      finally { conn.release(); }
    }
  };
}

export default createUnlinkedNoteCleanup();
