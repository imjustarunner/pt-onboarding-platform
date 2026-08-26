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
    clientId = null,
    officeEventId = null,
    clinicalSessionId = null,
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
    const cid = clientId === null || clientId === undefined ? null : safeInt(clientId);
    const oeid = officeEventId === null || officeEventId === undefined ? null : safeInt(officeEventId);
    const csid = clinicalSessionId === null || clinicalSessionId === undefined ? null : safeInt(clinicalSessionId);
    const pid = programId === null || programId === undefined ? null : safeInt(programId);

    const svc = serviceCode ? clampText(serviceCode, 32).toUpperCase() : null;
    const dos = dateOfService ? String(dateOfService).slice(0, 10) : null; // YYYY-MM-DD
    const init = initials ? clampText(initials, 16) : null;
    const input = inputText === null || inputText === undefined ? null : String(inputText);
    const out = outputJson === null || outputJson === undefined ? null : String(outputJson);

    const [result] = await pool.execute(
      `INSERT INTO clinical_note_drafts
       (user_id, agency_id, client_id, office_event_id, clinical_session_id, service_code, program_id, date_of_service, initials, input_text, output_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, aid, cid, oeid, csid, svc, pid, dos, init, input, out]
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
    if (patch.clientId !== undefined) {
      const cid = patch.clientId === null ? null : safeInt(patch.clientId);
      updates.push('client_id = ?');
      values.push(cid);
    }
    if (patch.officeEventId !== undefined) {
      const oeid = patch.officeEventId === null ? null : safeInt(patch.officeEventId);
      updates.push('office_event_id = ?');
      values.push(oeid);
    }
    if (patch.clinicalSessionId !== undefined) {
      const csid = patch.clinicalSessionId === null ? null : safeInt(patch.clinicalSessionId);
      updates.push('clinical_session_id = ?');
      values.push(csid);
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
    if (patch.archivedAt !== undefined) {
      // null clears archive; Date/string sets it; true uses NOW()
      if (patch.archivedAt === null) {
        updates.push('archived_at = NULL');
      } else if (patch.archivedAt === true) {
        updates.push('archived_at = NOW()');
      } else {
        updates.push('archived_at = ?');
        values.push(patch.archivedAt);
      }
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

  static async listRecentForUser({
    userId,
    agencyId = null,
    agencyIds = null,
    days = 7,
    limit = 50,
    archiveStatus = 'all'
  }) {
    const uid = safeInt(userId);
    if (!uid) return [];
    const aids = Array.isArray(agencyIds)
      ? agencyIds.map((x) => safeInt(x)).filter(Boolean)
      : (agencyId === null || agencyId === undefined ? [] : [safeInt(agencyId)].filter(Boolean));
    const lim = Math.max(1, Math.min(500, Number(limit) || 50));
    const status = String(archiveStatus || 'all').toLowerCase();
    // Active: recent window. Archived: up to 7 years (retention max).
    const maxDays = status === 'archived' || status === 'all' ? 2555 : 30;
    const d = Math.max(1, Math.min(maxDays, Number(days) || (status === 'archived' ? 2555 : 7)));
    const where = [
      'user_id = ?',
      'created_at >= (NOW() - INTERVAL ? DAY)'
    ];
    const params = [uid, d];
    if (aids.length === 1) {
      where.push('agency_id = ?');
      params.push(aids[0]);
    } else if (aids.length > 1) {
      where.push(`agency_id IN (${aids.map(() => '?').join(',')})`);
      params.push(...aids);
    }
    if (status === 'active') {
      where.push('archived_at IS NULL');
    } else if (status === 'archived') {
      where.push('archived_at IS NOT NULL');
    }
    const whereSql = where.map((clause) => `d.${clause}`).join(' AND ');
    const [rows] = await pool.execute(
      `SELECT
         d.*,
         c.full_name AS client_full_name,
         c.client_type AS client_type,
         a.name AS agency_name
       FROM clinical_note_drafts d
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN agencies a ON a.id = d.agency_id
       WHERE ${whereSql}
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT ${lim}`,
      params
    );
    return rows || [];
  }

  /**
   * Chart feed: drafts linked to a client (agency-scoped, any author).
   */
  static async listForClient({ clientId, agencyId, limit = 100 }) {
    const cid = safeInt(clientId);
    const aid = safeInt(agencyId);
    if (!cid || !aid) return [];
    const lim = Math.max(1, Math.min(200, Number(limit) || 100));
    const [rows] = await pool.execute(
      `SELECT
         d.*,
         c.full_name AS client_full_name,
         c.client_type AS client_type,
         a.name AS agency_name,
         u.first_name AS author_first_name,
         u.last_name AS author_last_name
       FROM clinical_note_drafts d
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN agencies a ON a.id = d.agency_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.client_id = ?
         AND d.agency_id = ?
         AND d.archived_at IS NULL
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT ${lim}`,
      [cid, aid]
    );
    return rows || [];
  }

  static async setArchivedForUser({ draftId, userId, archived }) {
    return this.updateForUser({
      draftId,
      userId,
      patch: { archivedAt: archived ? true : null }
    });
  }

  /** Soft-archive active drafts older than N days (does not delete). */
  static async autoArchiveOlderThanDays({ days = 7 }) {
    const d = Math.max(1, Math.min(365, Number(days) || 7));
    const [result] = await pool.execute(
      `UPDATE clinical_note_drafts
       SET archived_at = NOW()
       WHERE archived_at IS NULL
         AND created_at < (NOW() - INTERVAL ? DAY)`,
      [d]
    );
    return Number(result?.affectedRows || 0);
  }

  /** Hard-delete drafts older than N days (default 7 years ≈ 2555 days). */
  static async hardDeleteOlderThanDays({ days = 2555 }) {
    const d = Math.max(1, Math.min(4000, Number(days) || 2555));
    const [result] = await pool.execute(
      `DELETE FROM clinical_note_drafts
       WHERE created_at < (NOW() - INTERVAL ? DAY)`,
      [d]
    );
    return Number(result?.affectedRows || 0);
  }

  static async deleteForUser({ userId, agencyId = null, draftIds = [] }) {
    const uid = safeInt(userId);
    if (!uid) throw new Error('Invalid userId');
    const ids = Array.isArray(draftIds)
      ? draftIds.map((id) => safeInt(id)).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!ids.length) return 0;

    const aid = agencyId === null || agencyId === undefined ? null : safeInt(agencyId);
    const where = ['user_id = ?', `id IN (${ids.map(() => '?').join(', ')})`];
    const params = [uid, ...ids];
    if (aid) {
      where.push('agency_id = ?');
      params.push(aid);
    }

    const [result] = await pool.execute(
      `DELETE FROM clinical_note_drafts
       WHERE ${where.join(' AND ')}`,
      params
    );
    return Number(result?.affectedRows || 0);
  }
}

export default ClinicalNoteDraft;

