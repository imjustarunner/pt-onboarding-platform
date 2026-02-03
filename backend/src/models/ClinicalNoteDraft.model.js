import pool from '../config/database.js';

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

class ClinicalNoteDraft {
  static async create({
    userId,
    agencyId = null,
    serviceCode = null,
    programId = null,
    dateOfService = null,
    initials = null,
    inputText = null,
    outputJson = null
  }) {
    const uid = safeInt(userId);
    if (!uid) throw new Error('Invalid userId');

    const aid = agencyId === null || agencyId === undefined ? null : safeInt(agencyId);
    const pid = programId === null || programId === undefined ? null : safeInt(programId);

    const svc = serviceCode ? clampText(serviceCode, 32).toUpperCase() : null;
    const dos = dateOfService ? String(dateOfService).slice(0, 10) : null; // YYYY-MM-DD
    const init = initials ? clampText(initials, 16) : null;
    const input = inputText === null || inputText === undefined ? null : String(inputText);
    const out = outputJson === null || outputJson === undefined ? null : String(outputJson);

    const [result] = await pool.execute(
      `INSERT INTO clinical_note_drafts
       (user_id, agency_id, service_code, program_id, date_of_service, initials, input_text, output_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, aid, svc, pid, dos, init, input, out]
    );
    return this.findByIdForUser({ draftId: result.insertId, userId: uid });
  }

  static async findByIdForUser({ draftId, userId }) {
    const id = safeInt(draftId);
    const uid = safeInt(userId);
    if (!id || !uid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM clinical_note_drafts
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [id, uid]
    );
    return rows?.[0] || null;
  }

  static async updateForUser({
    draftId,
    userId,
    patch = {}
  }) {
    const id = safeInt(draftId);
    const uid = safeInt(userId);
    if (!id || !uid) throw new Error('Invalid draftId/userId');

    const updates = [];
    const values = [];

    if (patch.agencyId !== undefined) {
      const aid = patch.agencyId === null ? null : safeInt(patch.agencyId);
      updates.push('agency_id = ?');
      values.push(aid);
    }
    if (patch.serviceCode !== undefined) {
      const svc = patch.serviceCode === null ? null : clampText(patch.serviceCode, 32).toUpperCase();
      updates.push('service_code = ?');
      values.push(svc);
    }
    if (patch.programId !== undefined) {
      const pid = patch.programId === null ? null : safeInt(patch.programId);
      updates.push('program_id = ?');
      values.push(pid);
    }
    if (patch.dateOfService !== undefined) {
      const dos = patch.dateOfService === null ? null : String(patch.dateOfService).slice(0, 10);
      updates.push('date_of_service = ?');
      values.push(dos);
    }
    if (patch.initials !== undefined) {
      const init = patch.initials === null ? null : clampText(patch.initials, 16);
      updates.push('initials = ?');
      values.push(init);
    }
    if (patch.inputText !== undefined) {
      const input = patch.inputText === null ? null : String(patch.inputText);
      updates.push('input_text = ?');
      values.push(input);
    }
    if (patch.outputJson !== undefined) {
      const out = patch.outputJson === null ? null : String(patch.outputJson);
      updates.push('output_json = ?');
      values.push(out);
    }

    if (!updates.length) return this.findByIdForUser({ draftId: id, userId: uid });

    values.push(id, uid);
    const [result] = await pool.execute(
      `UPDATE clinical_note_drafts
       SET ${updates.join(', ')}
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      values
    );

    if ((result?.affectedRows || 0) < 1) return null;
    return this.findByIdForUser({ draftId: id, userId: uid });
  }

  static async listRecentForUser({ userId, agencyId = null, days = 7, limit = 50 }) {
    const uid = safeInt(userId);
    if (!uid) return [];
    const aid = agencyId === null || agencyId === undefined ? null : safeInt(agencyId);
    const lim = Math.max(1, Math.min(200, Number(limit) || 50));
    const d = Math.max(1, Math.min(30, Number(days) || 7));
    const where = [
      'user_id = ?',
      ...(aid ? ['agency_id = ?'] : []),
      'created_at >= (NOW() - INTERVAL ? DAY)'
    ];
    const params = [uid, ...(aid ? [aid] : []), d];
    const [rows] = await pool.execute(
      `SELECT *
       FROM clinical_note_drafts
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT ${lim}`,
      params
    );
    return rows || [];
  }

  static async hardDeleteOlderThanDays({ days = 14 }) {
    const d = Math.max(1, Math.min(365, Number(days) || 14));
    const [result] = await pool.execute(
      `DELETE FROM clinical_note_drafts
       WHERE created_at < (NOW() - INTERVAL ? DAY)`,
      [d]
    );
    return Number(result?.affectedRows || 0);
  }
}

export default ClinicalNoteDraft;

