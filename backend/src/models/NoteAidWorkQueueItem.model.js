import pool from '../config/database.js';
import { decryptChatText, encryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';

const STATUSES = new Set(['not_started', 'started', 'completed', 'signed']);
const TERMINAL_TTL_HOURS = 24;

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clampText(v, maxLen) {
  const s = v === null || v === undefined ? '' : String(v);
  const trimmed = s.trim();
  if (!maxLen) return trimmed;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'pending' || s === 'queued') return 'not_started';
  if (s === 'active' || s === 'in_progress') return 'started';
  if (s === 'done' || s === 'complete') return 'completed';
  if (s === 'completed_signed') return 'signed';
  return STATUSES.has(s) ? s : 'not_started';
}

function encryptPayload(obj) {
  const plain = JSON.stringify(obj && typeof obj === 'object' ? obj : {});
  if (!isChatEncryptionConfigured()) return plain;
  const { ciphertextB64, ivB64, authTagB64, keyId } = encryptChatText(plain);
  return JSON.stringify({
    _enc: true,
    keyId,
    iv: ivB64,
    tag: authTagB64,
    ciphertext: ciphertextB64
  });
}

function decryptPayload(raw) {
  if (raw === null || raw === undefined) return {};
  const text = String(raw);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed?._enc && parsed.iv && parsed.tag) {
      if (!parsed.ciphertext) return {};
      const plain = decryptChatText({
        ciphertextB64: parsed.ciphertext,
        ivB64: parsed.iv,
        authTagB64: parsed.tag,
        keyId: parsed.keyId || null
      });
      try {
        const obj = JSON.parse(plain || '{}');
        return obj && typeof obj === 'object' ? obj : {};
      } catch {
        return {};
      }
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toApiItem(row) {
  if (!row) return null;
  const payload = decryptPayload(row.payload_enc);
  const status = normalizeStatus(row.status);
  return {
    id: row.client_key || `srv_${row.id}`,
    serverId: Number(row.id),
    clientKey: row.client_key,
    agencyId: row.agency_id != null ? Number(row.agency_id) : null,
    clientId: row.client_id != null ? Number(row.client_id) : null,
    organizationId: row.organization_id != null ? Number(row.organization_id) : null,
    officeEventId: row.office_event_id != null ? Number(row.office_event_id) : null,
    clinicalSessionId: row.clinical_session_id != null ? Number(row.clinical_session_id) : null,
    taskId: row.task_id != null ? Number(row.task_id) : null,
    draftId: row.draft_id != null ? Number(row.draft_id) : null,
    clinicalNoteId: row.clinical_note_id != null ? Number(row.clinical_note_id) : null,
    date: row.date_of_service ? String(row.date_of_service).slice(0, 10) : null,
    serviceCode: row.service_code || null,
    noteKind: row.note_kind || null,
    timeLabel: row.time_label || null,
    status,
    docStatus: status,
    clientName: payload.clientName || '',
    action: payload.action || '',
    participantsSummary: payload.participantsSummary || null,
    locationLabel: payload.locationLabel || null,
    clientDob: payload.clientDob || null,
    durationMinutes: payload.durationMinutes != null ? Number(payload.durationMinutes) : null,
    scheduledStart: payload.scheduledStart || null,
    scheduledEnd: payload.scheduledEnd || null,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    signedAt: row.signed_at || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null
  };
}

function buildPayloadFromItem(item = {}) {
  return {
    clientName: String(item.clientName || item.client_name || '').trim(),
    action: String(item.action || '').trim(),
    participantsSummary: item.participantsSummary || item.participants_summary || null,
    locationLabel: item.locationLabel || item.location_label || null,
    clientDob: item.clientDob || item.client_dob || null,
    durationMinutes: item.durationMinutes ?? item.duration_minutes ?? null,
    scheduledStart: item.scheduledStart || item.scheduled_start || null,
    scheduledEnd: item.scheduledEnd || item.scheduled_end || null
  };
}

function resolveClientKey(item = {}) {
  const key = String(item.clientKey || item.client_key || item.id || '').trim();
  if (key && !/^srv_\d+$/.test(key)) return clampText(key, 96);
  if (item.taskId || item.task_id) return clampText(`task_${item.taskId || item.task_id}`, 96);
  return clampText(`wq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, 96);
}

function rowValuesFromItem(userId, item = {}) {
  const status = normalizeStatus(item.status || item.docStatus);
  const startedAt = item.startedAt || item.started_at || (status === 'started' || status === 'completed' || status === 'signed' ? new Date() : null);
  const completedAt = item.completedAt || item.completed_at || (status === 'completed' ? new Date() : null);
  const signedAt = item.signedAt || item.signed_at || (status === 'signed' ? new Date() : null);
  return {
    userId,
    agencyId: safeInt(item.agencyId ?? item.agency_id),
    clientId: safeInt(item.clientId ?? item.client_id),
    organizationId: safeInt(item.organizationId ?? item.organization_id),
    officeEventId: safeInt(item.officeEventId ?? item.office_event_id),
    clinicalSessionId: safeInt(item.clinicalSessionId ?? item.clinical_session_id),
    taskId: safeInt(item.taskId ?? item.task_id),
    draftId: status === 'signed' ? null : safeInt(item.draftId ?? item.draft_id),
    clinicalNoteId: safeInt(item.clinicalNoteId ?? item.clinical_note_id),
    clientKey: resolveClientKey(item),
    dateOfService: item.date || item.dateOfService || item.date_of_service
      ? String(item.date || item.dateOfService || item.date_of_service).slice(0, 10)
      : null,
    serviceCode: item.serviceCode || item.service_code
      ? clampText(item.serviceCode || item.service_code, 32).toUpperCase()
      : null,
    noteKind: item.noteKind || item.note_kind
      ? clampText(item.noteKind || item.note_kind, 48)
      : null,
    timeLabel: item.timeLabel || item.time_label
      ? clampText(item.timeLabel || item.time_label, 32)
      : null,
    status,
    payloadEnc: encryptPayload(buildPayloadFromItem(item)),
    startedAt: startedAt ? new Date(startedAt) : null,
    completedAt: completedAt ? new Date(completedAt) : null,
    signedAt: signedAt ? new Date(signedAt) : null
  };
}

class NoteAidWorkQueueItem {
  static async purgeExpiredTerminal({ hours = TERMINAL_TTL_HOURS } = {}) {
    const h = Math.max(1, Number(hours) || TERMINAL_TTL_HOURS);
    const [result] = await pool.execute(
      `DELETE FROM note_aid_work_queue_items
       WHERE (status = 'signed' AND signed_at IS NOT NULL AND signed_at < (NOW() - INTERVAL ${h} HOUR))
          OR (status = 'completed' AND completed_at IS NOT NULL AND completed_at < (NOW() - INTERVAL ${h} HOUR))`
    );
    return Number(result?.affectedRows || 0);
  }

  static async listForUser(userId, { purgeExpired = true } = {}) {
    const uid = safeInt(userId);
    if (!uid) return [];
    if (purgeExpired) {
      await this.purgeExpiredTerminal();
    }
    const [rows] = await pool.execute(
      `SELECT *
       FROM note_aid_work_queue_items
       WHERE user_id = ?
       ORDER BY
         CASE status
           WHEN 'not_started' THEN 0
           WHEN 'started' THEN 1
           WHEN 'completed' THEN 2
           WHEN 'signed' THEN 3
           ELSE 4
         END,
         date_of_service IS NULL, date_of_service ASC,
         id ASC`,
      [uid]
    );
    return (rows || []).map(toApiItem);
  }

  static async findByIdForUser({ id, userId }) {
    const rowId = safeInt(id);
    const uid = safeInt(userId);
    if (!rowId || !uid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM note_aid_work_queue_items WHERE id = ? AND user_id = ? LIMIT 1`,
      [rowId, uid]
    );
    return rows?.[0] ? toApiItem(rows[0]) : null;
  }

  static async findByClientKeyForUser({ clientKey, userId }) {
    const uid = safeInt(userId);
    const key = clampText(clientKey, 96);
    if (!uid || !key) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM note_aid_work_queue_items WHERE user_id = ? AND client_key = ? LIMIT 1`,
      [uid, key]
    );
    return rows?.[0] ? toApiItem(rows[0]) : null;
  }

  static async insertRow(vals) {
    const [result] = await pool.execute(
      `INSERT INTO note_aid_work_queue_items
        (user_id, agency_id, client_id, organization_id, office_event_id, clinical_session_id,
         task_id, draft_id, clinical_note_id, client_key, date_of_service, service_code,
         note_kind, time_label, status, payload_enc, started_at, completed_at, signed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vals.userId,
        vals.agencyId,
        vals.clientId,
        vals.organizationId,
        vals.officeEventId,
        vals.clinicalSessionId,
        vals.taskId,
        vals.draftId,
        vals.clinicalNoteId,
        vals.clientKey,
        vals.dateOfService,
        vals.serviceCode,
        vals.noteKind,
        vals.timeLabel,
        vals.status,
        vals.payloadEnc,
        vals.startedAt,
        vals.completedAt,
        vals.signedAt
      ]
    );
    return this.findByIdForUser({ id: result.insertId, userId: vals.userId });
  }

  static async updateRow(id, userId, vals) {
    await pool.execute(
      `UPDATE note_aid_work_queue_items
       SET agency_id = ?, client_id = ?, organization_id = ?, office_event_id = ?,
           clinical_session_id = ?, task_id = ?, draft_id = ?, clinical_note_id = ?,
           date_of_service = ?, service_code = ?, note_kind = ?, time_label = ?,
           status = ?, payload_enc = ?, started_at = ?, completed_at = ?, signed_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        vals.agencyId,
        vals.clientId,
        vals.organizationId,
        vals.officeEventId,
        vals.clinicalSessionId,
        vals.taskId,
        vals.draftId,
        vals.clinicalNoteId,
        vals.dateOfService,
        vals.serviceCode,
        vals.noteKind,
        vals.timeLabel,
        vals.status,
        vals.payloadEnc,
        vals.startedAt,
        vals.completedAt,
        vals.signedAt,
        id,
        userId
      ]
    );
    return this.findByIdForUser({ id, userId });
  }

  /**
   * Full-queue reconcile for the owning user.
   * Upserts by client_key (or server id), deletes rows not present in `items`.
   */
  static async syncForUser(userId, items = []) {
    const uid = safeInt(userId);
    if (!uid) throw new Error('Invalid userId');
    await this.purgeExpiredTerminal();

    const list = Array.isArray(items) ? items : [];
    const [existingRows] = await pool.execute(
      `SELECT id, client_key FROM note_aid_work_queue_items WHERE user_id = ?`,
      [uid]
    );
    const byKey = new Map((existingRows || []).map((r) => [String(r.client_key), Number(r.id)]));
    const byId = new Map((existingRows || []).map((r) => [Number(r.id), String(r.client_key)]));
    const keepIds = new Set();
    const out = [];

    for (const item of list) {
      const vals = rowValuesFromItem(uid, item);
      let rowId = safeInt(item.serverId || item.server_id);
      if (!rowId && byKey.has(vals.clientKey)) rowId = byKey.get(vals.clientKey);
      // If frontend still uses numeric id as item.id after prior sync
      if (!rowId && safeInt(item.id) && byId.has(safeInt(item.id))) {
        rowId = safeInt(item.id);
        vals.clientKey = byId.get(rowId) || vals.clientKey;
      }

      let saved;
      if (rowId) {
        saved = await this.updateRow(rowId, uid, vals);
        keepIds.add(rowId);
      } else {
        saved = await this.insertRow(vals);
        if (saved?.serverId) keepIds.add(saved.serverId);
      }
      if (saved) out.push(saved);
    }

    const toDelete = (existingRows || [])
      .map((r) => Number(r.id))
      .filter((id) => id && !keepIds.has(id));
    if (toDelete.length) {
      const placeholders = toDelete.map(() => '?').join(',');
      await pool.execute(
        `DELETE FROM note_aid_work_queue_items WHERE user_id = ? AND id IN (${placeholders})`,
        [uid, ...toDelete]
      );
    }

    return out;
  }

  static async appendForUser(userId, items = []) {
    const uid = safeInt(userId);
    if (!uid) throw new Error('Invalid userId');
    const list = Array.isArray(items) ? items : [];
    const out = [];
    for (const item of list) {
      const vals = rowValuesFromItem(uid, item);
      const existing = await this.findByClientKeyForUser({ clientKey: vals.clientKey, userId: uid });
      if (existing?.serverId) {
        out.push(await this.updateRow(existing.serverId, uid, vals));
      } else {
        out.push(await this.insertRow(vals));
      }
    }
    return out;
  }

  static async patchForUser({ id, userId, patch = {} }) {
    const uid = safeInt(userId);
    const rowId = safeInt(id);
    if (!uid || !rowId) return null;
    const current = await this.findByIdForUser({ id: rowId, userId: uid });
    if (!current) return null;
    const merged = { ...current, ...patch, id: current.clientKey, serverId: rowId, clientKey: current.clientKey };
    const vals = rowValuesFromItem(uid, merged);
    vals.clientKey = current.clientKey;
    return this.updateRow(rowId, uid, vals);
  }

  static async deleteForUser({ id, userId }) {
    const uid = safeInt(userId);
    const rowId = safeInt(id);
    if (!uid || !rowId) return 0;
    const [result] = await pool.execute(
      `DELETE FROM note_aid_work_queue_items WHERE id = ? AND user_id = ?`,
      [rowId, uid]
    );
    return Number(result?.affectedRows || 0);
  }

  static async clearForUser(userId) {
    const uid = safeInt(userId);
    if (!uid) return 0;
    const [result] = await pool.execute(
      `DELETE FROM note_aid_work_queue_items WHERE user_id = ?`,
      [uid]
    );
    return Number(result?.affectedRows || 0);
  }
}

export default NoteAidWorkQueueItem;
export { TERMINAL_TTL_HOURS };
