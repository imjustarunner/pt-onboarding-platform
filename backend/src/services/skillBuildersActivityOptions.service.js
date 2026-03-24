import pool from '../config/database.js';
import { loadSessionCurriculumRow } from './skillBuildersSessionClinical.service.js';

function mapActivityRow(r) {
  return {
    id: Number(r.id),
    skillsGroupId: r.skillsGroupId != null ? Number(r.skillsGroupId) : null,
    sessionId: r.sessionId != null ? Number(r.sessionId) : null,
    programDocumentId: r.programDocumentId != null ? Number(r.programDocumentId) : null,
    label: String(r.label || '').trim(),
    sortOrder: Number(r.sortOrder) || 0,
    isActive: r.isActive === 1 || r.isActive === true
  };
}

/**
 * Activities stored on a program library PDF (skill_builders_event_program_documents).
 */
export async function listActivityOptionsForProgramDocument(programDocumentId) {
  const pdid = Number(programDocumentId);
  if (!Number.isFinite(pdid) || pdid <= 0) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, skills_group_id AS skillsGroupId, session_id AS sessionId, program_document_id AS programDocumentId,
              label, sort_order AS sortOrder, is_active AS isActive
       FROM skill_builders_activity_options
       WHERE program_document_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [pdid]
    );
    return (rows || []).map(mapActivityRow);
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

export async function getActivityOptionById(optionId) {
  const oid = Number(optionId);
  if (!Number.isFinite(oid) || oid <= 0) return null;
  try {
    const [rows] = await pool.execute(`SELECT * FROM skill_builders_activity_options WHERE id = ? LIMIT 1`, [oid]);
    return rows?.[0] || null;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

/**
 * Clinical Aid / H2014: prefer activities on the library PDF attached to this session (source_program_document_id),
 * else per-session options, else group-level.
 */
export async function resolveActivityOptionsForClinicalSession({ skillsGroupId, sessionId }) {
  const gid = Number(skillsGroupId);
  const sid = Number(sessionId);
  if (!Number.isFinite(gid) || gid <= 0) return [];
  if (!Number.isFinite(sid) || sid <= 0) return listActivityOptionsForSkillsGroup(gid, null);

  try {
    const cur = await loadSessionCurriculumRow(sid);
    const pdid = cur?.source_program_document_id != null ? Number(cur.source_program_document_id) : null;
    if (Number.isFinite(pdid) && pdid > 0) {
      const pdOpts = await listActivityOptionsForProgramDocument(pdid);
      if (pdOpts.length) return pdOpts;
    }
  } catch {
    /* fall through */
  }

  return listActivityOptionsForSkillsGroup(gid, sid);
}

/**
 * List activity options for Clinical Aid (session- or group-level rows only; not program-document rows).
 * If `sessionId` is set and any rows exist for that session, return only those.
 * Otherwise return group-level options (session_id IS NULL).
 */
export async function listActivityOptionsForSkillsGroup(skillsGroupId, sessionId = null) {
  const gid = Number(skillsGroupId);
  if (!Number.isFinite(gid) || gid <= 0) return [];
  const sid = sessionId != null ? Number(sessionId) : null;

  try {
    if (Number.isFinite(sid) && sid > 0) {
      const [sessionRows] = await pool.execute(
        `SELECT id, skills_group_id AS skillsGroupId, session_id AS sessionId, program_document_id AS programDocumentId,
                label, sort_order AS sortOrder, is_active AS isActive
         FROM skill_builders_activity_options
         WHERE skills_group_id = ? AND session_id = ? AND program_document_id IS NULL
         ORDER BY sort_order ASC, id ASC`,
        [gid, sid]
      );
      if ((sessionRows || []).length) {
        return (sessionRows || []).map(mapActivityRow);
      }
    }

    const [rows] = await pool.execute(
      `SELECT id, skills_group_id AS skillsGroupId, session_id AS sessionId, program_document_id AS programDocumentId,
              label, sort_order AS sortOrder, is_active AS isActive
       FROM skill_builders_activity_options
       WHERE skills_group_id = ? AND session_id IS NULL AND program_document_id IS NULL
       ORDER BY sort_order ASC, id ASC`,
      [gid]
    );
    return (rows || []).map(mapActivityRow);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') return [];
    throw e;
  }
}

async function nextSortOrder(skillsGroupId, sessionId) {
  const gid = Number(skillsGroupId);
  const sid = sessionId != null ? Number(sessionId) : null;
  if (Number.isFinite(sid) && sid > 0) {
    const [maxRows] = await pool.execute(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM skill_builders_activity_options
       WHERE skills_group_id = ? AND session_id = ? AND program_document_id IS NULL`,
      [gid, sid]
    );
    return Number(maxRows?.[0]?.n) || 0;
  }
  const [maxRows] = await pool.execute(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM skill_builders_activity_options
     WHERE skills_group_id = ? AND session_id IS NULL AND program_document_id IS NULL`,
    [gid]
  );
  return Number(maxRows?.[0]?.n) || 0;
}

async function nextSortOrderProgramDocument(programDocumentId) {
  const pdid = Number(programDocumentId);
  const [maxRows] = await pool.execute(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM skill_builders_activity_options WHERE program_document_id = ?`,
    [pdid]
  );
  return Number(maxRows?.[0]?.n) || 0;
}

export async function createActivityOption({ skillsGroupId, label, sessionId = null, programDocumentId = null }) {
  const lab = String(label || '').trim().slice(0, 255);
  if (!lab) throw new Error('Invalid activity option');

  if (programDocumentId != null) {
    const pdid = Number(programDocumentId);
    if (!Number.isFinite(pdid) || pdid <= 0) throw new Error('Invalid program document');
    const [chk] = await pool.execute(`SELECT id FROM skill_builders_event_program_documents WHERE id = ? LIMIT 1`, [pdid]);
    if (!chk?.[0]) throw new Error('Program document not found');
    const sortOrder = await nextSortOrderProgramDocument(pdid);
    const [r] = await pool.execute(
      `INSERT INTO skill_builders_activity_options (skills_group_id, session_id, program_document_id, label, sort_order, is_active)
       VALUES (NULL, NULL, ?, ?, ?, 1)`,
      [pdid, lab, sortOrder]
    );
    return Number(r.insertId);
  }

  const gid = Number(skillsGroupId);
  if (!Number.isFinite(gid) || gid <= 0) throw new Error('Invalid activity option');

  let sidSql = null;
  if (sessionId != null) {
    const s = Number(sessionId);
    if (!Number.isFinite(s) || s <= 0) throw new Error('Invalid session');
    const [chk] = await pool.execute(
      `SELECT id FROM skill_builders_event_sessions WHERE id = ? AND skills_group_id = ? LIMIT 1`,
      [s, gid]
    );
    if (!chk?.[0]) throw new Error('Session does not belong to this skills group');
    sidSql = s;
  }

  const sortOrder = await nextSortOrder(gid, sidSql);
  const [r] = await pool.execute(
    `INSERT INTO skill_builders_activity_options (skills_group_id, session_id, program_document_id, label, sort_order, is_active)
     VALUES (?, ?, NULL, ?, ?, 1)`,
    [gid, sidSql, lab, sortOrder]
  );
  return Number(r.insertId);
}

export async function updateActivityOptionById(optionId, { label, sortOrder, isActive }) {
  const oid = Number(optionId);
  if (!Number.isFinite(oid) || oid <= 0) throw new Error('Invalid id');
  const updates = [];
  const vals = [];
  if (label !== undefined) {
    updates.push('label = ?');
    vals.push(String(label || '').trim().slice(0, 255));
  }
  if (sortOrder !== undefined) {
    updates.push('sort_order = ?');
    vals.push(Number(sortOrder) || 0);
  }
  if (isActive !== undefined) {
    updates.push('is_active = ?');
    vals.push(isActive ? 1 : 0);
  }
  if (!updates.length) return 0;
  vals.push(oid);
  const [res] = await pool.execute(`UPDATE skill_builders_activity_options SET ${updates.join(', ')} WHERE id = ?`, vals);
  return Number(res?.affectedRows || 0);
}

export async function deleteActivityOptionById(optionId) {
  const oid = Number(optionId);
  const [res] = await pool.execute(`DELETE FROM skill_builders_activity_options WHERE id = ?`, [oid]);
  return Number(res?.affectedRows || 0);
}

/** @deprecated use updateActivityOptionById after access check */
export async function updateActivityOption({ optionId, skillsGroupId, label, sortOrder, isActive }) {
  const gid = Number(skillsGroupId);
  const row = await getActivityOptionById(optionId);
  if (!row || Number(row.skills_group_id) !== gid) return 0;
  return updateActivityOptionById(optionId, { label, sortOrder, isActive });
}

/** @deprecated */
export async function deleteActivityOption({ optionId, skillsGroupId }) {
  const gid = Number(skillsGroupId);
  const row = await getActivityOptionById(optionId);
  if (!row || Number(row.skills_group_id) !== gid) return 0;
  return deleteActivityOptionById(optionId);
}
