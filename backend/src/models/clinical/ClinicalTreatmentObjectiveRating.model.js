import crypto from 'crypto';
import clinicalPool from '../../config/clinicalDatabase.js';

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

export function fingerprintPlanText(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 64);
}

/** Distance to goal: lower is closer (works whether higher or lower scores are better). */
export function distanceToGoal(value, target) {
  if (value == null || target == null) return null;
  return Math.abs(Number(value) - Number(target));
}

export function computeProgressLabel({ previousValue, newValue, target }) {
  if (newValue == null || target == null) return null;
  const n = Number(newValue);
  const t = Number(target);
  if (n === t) return 'improved';
  if (previousValue == null || previousValue === '') return 'unchanged';
  const prevDist = distanceToGoal(previousValue, t);
  const nextDist = distanceToGoal(n, t);
  if (prevDist == null || nextDist == null) return 'unchanged';
  if (nextDist < prevDist) return 'progressing';
  if (nextDist > prevDist) return 'regressed';
  return 'unchanged';
}

class ClinicalTreatmentObjectiveRating {
  static async create({
    agencyId,
    clientId,
    objectiveId,
    goalId = null,
    treatmentPlanId = null,
    ratedByUserId,
    scaleValue = null,
    scaleTargetAtRating = null,
    disposition = 'rated',
    progressLabel = null,
    clinicalNoteId = null,
    draftId = null,
    dateOfService = null,
    notes = null,
    raterKind = 'clinician',
    raterLabel = null
  }) {
    const agency = safeInt(agencyId);
    const client = safeInt(clientId);
    const objective = safeInt(objectiveId);
    const rater = safeInt(ratedByUserId);
    if (!agency || !client || !objective || !rater) {
      throw new Error('agencyId, clientId, objectiveId, and ratedByUserId are required');
    }
    const kind = String(raterKind || 'clinician').trim().toLowerCase();
    const safeKind = ['clinician', 'client', 'other'].includes(kind) ? kind : 'clinician';
    const label = raterLabel
      ? clampText(raterLabel, 120)
      : (safeKind === 'clinician' ? 'clinical observation' : safeKind);
    const disp = clampText(disposition || 'rated', 32) || 'rated';
    const scale =
      disp === 'rated' && scaleValue != null && scaleValue !== ''
        ? Math.max(1, Math.min(10, Number(scaleValue)))
        : null;
    const target =
      scaleTargetAtRating == null || scaleTargetAtRating === ''
        ? null
        : Math.max(1, Math.min(10, Number(scaleTargetAtRating)));

    let insertId = null;
    try {
      const [result] = await clinicalPool.execute(
        `INSERT INTO clinical_treatment_objective_ratings
         (agency_id, client_id, objective_id, goal_id, treatment_plan_id, rated_by_user_id,
          scale_value, scale_target_at_rating, disposition, progress_label,
          clinical_note_id, draft_id, date_of_service, notes, rater_kind, rater_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          agency,
          client,
          objective,
          safeInt(goalId),
          safeInt(treatmentPlanId),
          rater,
          scale,
          target,
          disp,
          progressLabel ? clampText(progressLabel, 32) : null,
          safeInt(clinicalNoteId),
          safeInt(draftId),
          dateOfService ? String(dateOfService).slice(0, 10) : null,
          notes ? clampText(notes, 500) : null,
          safeKind,
          label
        ]
      );
      insertId = result.insertId;
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [result] = await clinicalPool.execute(
        `INSERT INTO clinical_treatment_objective_ratings
         (agency_id, client_id, objective_id, goal_id, treatment_plan_id, rated_by_user_id,
          scale_value, scale_target_at_rating, disposition, progress_label,
          clinical_note_id, draft_id, date_of_service, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          agency,
          client,
          objective,
          safeInt(goalId),
          safeInt(treatmentPlanId),
          rater,
          scale,
          target,
          disp,
          progressLabel ? clampText(progressLabel, 32) : null,
          safeInt(clinicalNoteId),
          safeInt(draftId),
          dateOfService ? String(dateOfService).slice(0, 10) : null,
          notes ? clampText(notes, 500) : null
        ]
      );
      insertId = result.insertId;
    }

    // Keep objective.scale_current in sync for clinician ratings only.
    if (disp === 'rated' && scale != null && safeKind === 'clinician') {
      await clinicalPool.execute(
        `UPDATE clinical_treatment_plan_objectives
         SET scale_current = ?
         WHERE id = ? AND superseded_at IS NULL`,
        [scale, objective]
      );
    }

    return this.findById(insertId);
  }

  static async findById(id) {
    const rid = safeInt(id);
    if (!rid) return null;
    const [rows] = await clinicalPool.execute(
      `SELECT * FROM clinical_treatment_objective_ratings WHERE id = ? LIMIT 1`,
      [rid]
    );
    return rows?.[0] || null;
  }

  static async listByClient({ agencyId, clientId, limit = 200 }) {
    const agency = safeInt(agencyId);
    const client = safeInt(clientId);
    if (!agency || !client) return [];
    const lim = Math.max(1, Math.min(500, Number(limit) || 200));
    const [rows] = await clinicalPool.execute(
      `SELECT r.*, o.objective_text, o.scale_target, g.goal_text, g.goal_index, o.objective_index
       FROM clinical_treatment_objective_ratings r
       LEFT JOIN clinical_treatment_plan_objectives o ON o.id = r.objective_id
       LEFT JOIN clinical_treatment_plan_goals g ON g.id = COALESCE(r.goal_id, o.goal_id)
       WHERE r.agency_id = ? AND r.client_id = ?
       ORDER BY r.rated_at DESC, r.id DESC
       LIMIT ${lim}`,
      [agency, client]
    );
    return rows || [];
  }

  static async latestByObjectiveIds({ objectiveIds = [] }) {
    const ids = (objectiveIds || []).map((id) => safeInt(id)).filter(Boolean);
    if (!ids.length) return {};
    const [rows] = await clinicalPool.execute(
      `SELECT r.*
       FROM clinical_treatment_objective_ratings r
       INNER JOIN (
         SELECT objective_id, MAX(id) AS max_id
         FROM clinical_treatment_objective_ratings
         WHERE objective_id IN (${ids.map(() => '?').join(',')})
         GROUP BY objective_id
       ) latest ON latest.max_id = r.id`,
      ids
    );
    const map = {};
    for (const row of rows || []) {
      map[String(row.objective_id)] = row;
    }
    return map;
  }

  /** Latest rating for objective + rater + date of service (dedupe key). */
  static async findLatestForDedupe({
    objectiveId,
    raterKind = 'clinician',
    dateOfService = null
  }) {
    const oid = safeInt(objectiveId);
    if (!oid) return null;
    const kind = String(raterKind || 'clinician').trim().toLowerCase();
    const dos = dateOfService ? String(dateOfService).slice(0, 10) : null;
    const params = [oid, kind];
    let dosSql = ' AND date_of_service IS NULL';
    if (dos) {
      dosSql = ' AND date_of_service = ?';
      params.push(dos);
    }
    try {
      const [rows] = await clinicalPool.execute(
        `SELECT *
         FROM clinical_treatment_objective_ratings
         WHERE objective_id = ?
           AND COALESCE(rater_kind, 'clinician') = ?
           ${dosSql}
         ORDER BY rated_at DESC, id DESC
         LIMIT 1`,
        params
      );
      return rows?.[0] || null;
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await clinicalPool.execute(
        `SELECT *
         FROM clinical_treatment_objective_ratings
         WHERE objective_id = ?
           ${dos ? 'AND date_of_service = ?' : 'AND date_of_service IS NULL'}
         ORDER BY rated_at DESC, id DESC
         LIMIT 1`,
        dos ? [oid, dos] : [oid]
      );
      return rows?.[0] || null;
    }
  }

  /** Ratings tied to a signed note (by note id, draft id, or session DOS). */
  static async listForClinicalNote({
    agencyId,
    clientId,
    clinicalNoteId = null,
    draftId = null,
    dateOfService = null
  }) {
    const agency = safeInt(agencyId);
    const client = safeInt(clientId);
    if (!agency || !client) return [];
    const nid = safeInt(clinicalNoteId);
    const did = safeInt(draftId);
    const dos = dateOfService ? String(dateOfService).slice(0, 10) : null;
    const orParts = [];
    const params = [agency, client];
    if (nid) {
      orParts.push('r.clinical_note_id = ?');
      params.push(nid);
    }
    if (did) {
      orParts.push('r.draft_id = ?');
      params.push(did);
    }
    if (dos) {
      orParts.push('r.date_of_service = ?');
      params.push(dos);
    }
    if (!orParts.length) return [];
    const [rows] = await clinicalPool.execute(
      `SELECT r.*, o.objective_text, o.scale_target, g.goal_text, g.goal_index, o.objective_index
       FROM clinical_treatment_objective_ratings r
       LEFT JOIN clinical_treatment_plan_objectives o ON o.id = r.objective_id
       LEFT JOIN clinical_treatment_plan_goals g ON g.id = COALESCE(r.goal_id, o.goal_id)
       WHERE r.agency_id = ? AND r.client_id = ?
         AND (${orParts.join(' OR ')})
       ORDER BY g.goal_index ASC, o.objective_index ASC, r.rater_kind ASC, r.id ASC`,
      params
    );
    return rows || [];
  }

  /** Attach session ratings to a chart note after approve/sign. */
  static async linkToClinicalNote({
    agencyId,
    clientId,
    clinicalNoteId,
    draftId = null,
    dateOfService = null
  }) {
    const agency = safeInt(agencyId);
    const client = safeInt(clientId);
    const nid = safeInt(clinicalNoteId);
    if (!agency || !client || !nid) return 0;
    const did = safeInt(draftId);
    const dos = dateOfService ? String(dateOfService).slice(0, 10) : null;
    const orParts = [];
    const params = [nid, agency, client];
    if (did) {
      orParts.push('draft_id = ?');
      params.push(did);
    }
    if (dos) {
      orParts.push('date_of_service = ?');
      params.push(dos);
    }
    if (!orParts.length) return 0;
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_treatment_objective_ratings
       SET clinical_note_id = ?
       WHERE clinical_note_id IS NULL
         AND agency_id = ?
         AND client_id = ?
         AND (${orParts.join(' OR ')})`,
      params
    );
    return Number(result?.affectedRows || 0);
  }

  static async deleteByClient({ clientId, agencyId = null }) {
    const cid = safeInt(clientId);
    if (!cid) return 0;
    const aid = safeInt(agencyId);
    const [result] = await clinicalPool.execute(
      aid
        ? 'DELETE FROM clinical_treatment_objective_ratings WHERE client_id = ? AND agency_id = ?'
        : 'DELETE FROM clinical_treatment_objective_ratings WHERE client_id = ?',
      aid ? [cid, aid] : [cid]
    );
    return Number(result?.affectedRows || 0);
  }
}

export default ClinicalTreatmentObjectiveRating;
