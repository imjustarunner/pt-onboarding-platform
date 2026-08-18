import crypto from 'crypto';
import pool from '../config/database.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeDob(dob) {
  if (!dob) return null;
  const s = String(dob).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 255);
}

export function hashDob(dob) {
  const normalized = normalizeDob(dob);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(`session-recording-dob:${normalized}`).digest('hex');
}

class SessionRecordingConsent {
  static async create(row = {}) {
    const agencyId = safeInt(row.agencyId);
    const userId = safeInt(row.createdByUserId);
    const name = normalizeName(row.signerFullName);
    const dob = normalizeDob(row.signerDob);
    if (!agencyId || !userId || !name || !dob) {
      throw new Error('agencyId, createdByUserId, signerFullName, and signerDob are required');
    }
    const [result] = await pool.execute(
      `INSERT INTO session_recording_consents (
        agency_id, client_id, session_recording_id, signer_full_name, signer_dob, signer_dob_hash,
        matched_by, document_template_id, task_id, signed_document_id, signed_at, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        safeInt(row.clientId),
        safeInt(row.sessionRecordingId),
        name,
        dob,
        hashDob(dob),
        row.matchedBy || 'none',
        safeInt(row.documentTemplateId),
        safeInt(row.taskId),
        safeInt(row.signedDocumentId),
        row.signedAt || null,
        userId
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const cid = safeInt(id);
    if (!cid) return null;
    const [rows] = await pool.execute('SELECT * FROM session_recording_consents WHERE id = ? LIMIT 1', [cid]);
    return rows?.[0] || null;
  }

  static async findOnFile({ agencyId, clientId = null, signerFullName = null, signerDob = null }) {
    const aid = safeInt(agencyId);
    if (!aid) return null;
    if (clientId) {
      const [rows] = await pool.execute(
        `SELECT * FROM session_recording_consents
         WHERE agency_id = ? AND client_id = ? AND signed_at IS NOT NULL
         ORDER BY signed_at DESC LIMIT 1`,
        [aid, safeInt(clientId)]
      );
      if (rows?.[0]) return rows[0];
      try {
        const [phiRows] = await pool.execute(
          `SELECT id, client_id, created_at
           FROM client_phi_documents
           WHERE client_id = ? AND agency_id = ?
             AND document_type = 'audio_recording_consent'
             AND removed_at IS NULL
           ORDER BY id DESC LIMIT 1`,
          [safeInt(clientId), aid]
        );
        if (phiRows?.[0]) {
          return {
            id: null,
            client_id: phiRows[0].client_id,
            signed_at: phiRows[0].created_at,
            matched_by: 'client_id',
            source: 'client_file'
          };
        }
      } catch {
        // older deployments may not have this table/column
      }
    }
    const name = normalizeName(signerFullName);
    const dob = normalizeDob(signerDob);
    if (name && dob) {
      const [rows] = await pool.execute(
        `SELECT * FROM session_recording_consents
         WHERE agency_id = ? AND signer_full_name = ? AND signer_dob = ? AND signed_at IS NOT NULL
         ORDER BY signed_at DESC LIMIT 1`,
        [aid, name, dob]
      );
      if (rows?.[0]) return rows[0];
    }
    return null;
  }

  static async update(id, patch = {}) {
    const cid = safeInt(id);
    if (!cid) throw new Error('Invalid id');
    const updates = [];
    const values = [];
    if (patch.clientId !== undefined) {
      updates.push('client_id = ?');
      values.push(safeInt(patch.clientId));
    }
    if (patch.sessionRecordingId !== undefined) {
      updates.push('session_recording_id = ?');
      values.push(safeInt(patch.sessionRecordingId));
    }
    if (patch.matchedBy !== undefined) {
      updates.push('matched_by = ?');
      values.push(String(patch.matchedBy));
    }
    if (patch.taskId !== undefined) {
      updates.push('task_id = ?');
      values.push(safeInt(patch.taskId));
    }
    if (patch.signedDocumentId !== undefined) {
      updates.push('signed_document_id = ?');
      values.push(safeInt(patch.signedDocumentId));
    }
    if (patch.signedAt !== undefined) {
      updates.push('signed_at = ?');
      values.push(patch.signedAt);
    }
    if (patch.documentTemplateId !== undefined) {
      updates.push('document_template_id = ?');
      values.push(safeInt(patch.documentTemplateId));
    }
    if (!updates.length) return this.findById(cid);
    values.push(cid);
    await pool.execute(`UPDATE session_recording_consents SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(cid);
  }

  static async findMatchingClient({ agencyId, fullName, dateOfBirth }) {
    const aid = safeInt(agencyId);
    const name = normalizeName(fullName);
    const dob = normalizeDob(dateOfBirth);
    if (!aid || !name || !dob) return null;
    const [rows] = await pool.execute(
      `SELECT id, agency_id, full_name, initials, date_of_birth
       FROM clients
       WHERE agency_id = ?
         AND date_of_birth = ?
         AND LOWER(TRIM(full_name)) = LOWER(?)
       LIMIT 2`,
      [aid, dob, name]
    );
    if (!rows?.length) return null;
    if (rows.length > 1) return { ambiguous: true, matches: rows };
    return { ambiguous: false, client: rows[0] };
  }
}

export default SessionRecordingConsent;
