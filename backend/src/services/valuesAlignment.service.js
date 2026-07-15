import crypto from 'crypto';
import pool from '../config/database.js';
import {
  buildLifeAlignmentSummary,
  calculateAlignmentGap,
  calculateAlignmentOpportunity,
  gapStatusLabel,
  averageGapLabel,
  CORE_VALUE_KEYS
} from './valuesAlignment.scoring.js';

export {
  calculateAlignmentGap,
  calculateAlignmentOpportunity,
  gapStatusLabel,
  averageGapLabel,
  buildLifeAlignmentSummary,
  CORE_VALUE_KEYS
};

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function newAccessToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function mapValueRow(c) {
  return {
    id: Number(c.id),
    key: c.value_key,
    label: c.label,
    definition: c.definition,
    category: c.category,
    color: c.color,
    icon: c.icon,
    displayOrder: Number(c.display_order || 0)
  };
}

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM values_alignment_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM values_alignment_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Values Alignment template not found');

  const [vals] = await pool.execute(
    `SELECT * FROM values_alignment_template_values
     WHERE template_id = ? AND is_active = 1
     ORDER BY display_order ASC, id ASC`,
    [template.id]
  );

  return {
    id: Number(template.id),
    agencyId: template.agency_id == null ? null : Number(template.agency_id),
    name: template.name,
    description: template.description,
    version: Number(template.version || 1),
    settings: parseJson(template.settings_json, {}),
    values: (vals || []).map(mapValueRow)
  };
}

function buildSummary(template, responses, priorityKeys = []) {
  return buildLifeAlignmentSummary(template, responses, priorityKeys);
}

function coreKeysForTemplate(template) {
  const fromSettings = template?.settings?.coreValueKeys;
  if (Array.isArray(fromSettings) && fromSettings.length) return fromSettings.map(String);
  return CORE_VALUE_KEYS;
}

async function loadResponses(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM values_alignment_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => {
    const current =
      r.current_life_score != null
        ? Number(r.current_life_score)
        : r.alignment_score == null
          ? null
          : Number(r.alignment_score);
    const ideal =
      r.ideal_life_score != null
        ? Number(r.ideal_life_score)
        : r.importance_score == null
          ? null
          : Number(r.importance_score);
    return {
      valueKey: r.value_key,
      currentLifeScore: current,
      idealLifeScore: ideal,
      confidenceToChangeScore:
        r.confidence_to_change_score == null ? null : Number(r.confidence_to_change_score),
      personalDefinition: r.personal_definition || '',
      seasonStatus: r.season_status || 'active',
      // Legacy mirrors (Ideal ≈ importance, Current ≈ alignment)
      importanceScore: ideal,
      alignmentScore: current,
      reflectionChips: parseJson(r.reflection_chips_json, []) || [],
      note: r.note || ''
    };
  });
}

async function loadCommitments(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM values_alignment_commitments WHERE assessment_id = ? ORDER BY id ASC`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    valueKey: r.value_key,
    title: r.title || '',
    behavior: r.behavior || '',
    startingAlignmentScore:
      r.starting_alignment_score == null ? null : Number(r.starting_alignment_score),
    desiredAlignmentScore:
      r.desired_alignment_score == null ? null : Number(r.desired_alignment_score),
    obstacles: r.obstacles || '',
    supportNeeded: r.support_needed || '',
    firstStep: r.first_step || '',
    targetDate: r.target_date || null,
    confidenceScore: r.confidence_score == null ? null : Number(r.confidence_score),
    status: r.status
  }));
}

async function hydrateAssessment(row) {
  if (!row) return null;
  const template = await getDefaultTemplate({ agencyId: row.agency_id });
  // Prefer template snapshot by id if different
  let tpl = template;
  if (Number(row.template_id) !== Number(template.id)) {
    const [trows] = await pool.execute(
      `SELECT * FROM values_alignment_templates WHERE id = ? LIMIT 1`,
      [row.template_id]
    );
    if (trows?.[0]) {
      const [vals] = await pool.execute(
        `SELECT * FROM values_alignment_template_values
         WHERE template_id = ? AND is_active = 1
         ORDER BY display_order ASC, id ASC`,
        [trows[0].id]
      );
      tpl = {
        id: Number(trows[0].id),
        agencyId: trows[0].agency_id == null ? null : Number(trows[0].agency_id),
        name: trows[0].name,
        description: trows[0].description,
        version: Number(trows[0].version || 1),
        settings: parseJson(trows[0].settings_json, {}),
        values: (vals || []).map(mapValueRow)
      };
    }
  }

  const responses = await loadResponses(row.id);
  const commitments = await loadCommitments(row.id);
  const priorityKeys = parseJson(row.priority_keys_json, []) || [];
  const summary =
    parseJson(row.summary_json, null) || buildSummary(tpl, responses, priorityKeys);

  return {
    id: Number(row.id),
    agencyId: row.agency_id == null ? null : Number(row.agency_id),
    templateId: Number(row.template_id),
    templateVersion: Number(row.template_version || 1),
    clientId: row.client_id == null ? null : Number(row.client_id),
    subjectUserId: row.subject_user_id == null ? null : Number(row.subject_user_id),
    status: row.status,
    accessToken: row.access_token,
    selectedKeys: parseJson(row.selected_keys_json, []) || [],
    rankedKeys: parseJson(row.ranked_keys_json, []) || [],
    priorityKeys,
    context: parseJson(row.context_json, {}) || {},
    responses,
    commitments,
    summary,
    template: tpl,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getAssessmentById(id) {
  const [rows] = await pool.execute(
    `SELECT * FROM values_alignment_assessments WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function getAssessmentByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM values_alignment_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function createAssessment({
  agencyId = null,
  clientId = null,
  subjectUserId = null,
  assignedByUserId = null,
  coachUserId = null
} = {}) {
  const template = await getDefaultTemplate({ agencyId });
  const accessToken = newAccessToken();
  const [result] = await pool.execute(
    `INSERT INTO values_alignment_assessments
      (agency_id, template_id, template_version, client_id, subject_user_id,
       assigned_by_user_id, coach_user_id, status, access_token, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'selecting', ?, NOW())`,
    [
      agencyId ? Number(agencyId) : null,
      template.id,
      template.version,
      clientId ? Number(clientId) : null,
      subjectUserId ? Number(subjectUserId) : null,
      assignedByUserId || null,
      coachUserId || null,
      accessToken
    ]
  );
  return getAssessmentById(result.insertId);
}

export async function updateSelection({ assessmentId, selectedKeys = [], rankedKeys = null, status = null }) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    throw err(409, 'Completed assessments cannot be edited');
  }
  const settings = assessment.template.settings || {};
  const maxSelect = Number(settings.maxSelect || 12);
  const keys = [...new Set((selectedKeys || []).map(String))].slice(0, maxSelect);
  for (const k of keys) {
    if (!assessment.template.values.some((v) => v.key === k)) {
      throw err(400, `Unknown value: ${k}`);
    }
  }
  let ranked = rankedKeys;
  if (ranked != null) {
    ranked = [...new Set((ranked || []).map(String))].filter((k) => keys.includes(k));
  } else {
    ranked = assessment.rankedKeys.filter((k) => keys.includes(k));
  }
  const nextStatus = status || (ranked.length ? 'ranking' : 'selecting');
  await pool.execute(
    `UPDATE values_alignment_assessments
     SET selected_keys_json = ?, ranked_keys_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [JSON.stringify(keys), JSON.stringify(ranked), nextStatus, Number(assessmentId)]
  );
  return getAssessmentById(assessmentId);
}

export async function upsertValueResponse({
  assessmentId,
  valueKey,
  importanceScore = undefined,
  alignmentScore = undefined,
  currentLifeScore = undefined,
  idealLifeScore = undefined,
  confidenceToChangeScore = undefined,
  personalDefinition = undefined,
  seasonStatus = undefined,
  reflectionChips = undefined,
  note = undefined
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    throw err(409, 'Completed assessments cannot be edited');
  }
  const key = String(valueKey || '').trim();
  if (!assessment.template.values.some((v) => v.key === key)) {
    throw err(400, 'Unknown value');
  }
  const validateScore = (n, label) => {
    if (n === undefined || n === null) return;
    const v = Number(n);
    if (!Number.isInteger(v) || v < 1 || v > 10) throw err(400, `${label} must be 1–10`);
  };

  // Prefer explicit Current/Ideal; fall back to legacy Importance/Alignment naming
  const incomingCurrent =
    currentLifeScore !== undefined ? currentLifeScore : alignmentScore;
  const incomingIdeal =
    idealLifeScore !== undefined ? idealLifeScore : importanceScore;

  validateScore(incomingCurrent, 'Current Life');
  validateScore(incomingIdeal, 'Ideal Life');
  validateScore(confidenceToChangeScore, 'Confidence to Change');

  const existing = assessment.responses.find((r) => r.valueKey === key);
  const nextCurrent =
    incomingCurrent === undefined ? existing?.currentLifeScore ?? null : incomingCurrent;
  const nextIdeal =
    incomingIdeal === undefined ? existing?.idealLifeScore ?? null : incomingIdeal;
  const nextConfidence =
    confidenceToChangeScore === undefined
      ? existing?.confidenceToChangeScore ?? null
      : confidenceToChangeScore;
  const nextDefinition =
    personalDefinition === undefined
      ? existing?.personalDefinition ?? ''
      : String(personalDefinition || '');
  const nextSeason =
    seasonStatus === undefined ? existing?.seasonStatus || 'active' : String(seasonStatus);
  const nextChips =
    reflectionChips === undefined
      ? existing?.reflectionChips || []
      : Array.isArray(reflectionChips)
        ? reflectionChips
        : [];
  const nextNote = note === undefined ? existing?.note ?? '' : String(note || '');

  await pool.execute(
    `INSERT INTO values_alignment_responses
      (assessment_id, value_key, importance_score, alignment_score,
       current_life_score, ideal_life_score, confidence_to_change_score,
       personal_definition, season_status, reflection_chips_json, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       importance_score = VALUES(importance_score),
       alignment_score = VALUES(alignment_score),
       current_life_score = VALUES(current_life_score),
       ideal_life_score = VALUES(ideal_life_score),
       confidence_to_change_score = VALUES(confidence_to_change_score),
       personal_definition = VALUES(personal_definition),
       season_status = VALUES(season_status),
       reflection_chips_json = VALUES(reflection_chips_json),
       note = VALUES(note),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      nextIdeal,
      nextCurrent,
      nextCurrent,
      nextIdeal,
      nextConfidence,
      nextDefinition || null,
      nextSeason,
      JSON.stringify(nextChips),
      nextNote || null
    ]
  );

  if (assessment.status !== 'scoring') {
    await pool.execute(
      `UPDATE values_alignment_assessments
       SET status = 'scoring', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [Number(assessmentId)]
    );
  }
  return getAssessmentById(assessmentId);
}

export async function completeAssessment({ assessmentId, priorityKeys = [], context = undefined }) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed') return assessment;

  const coreKeys = coreKeysForTemplate(assessment.template);
  const ranked = assessment.rankedKeys?.length
    ? assessment.rankedKeys
    : assessment.selectedKeys?.length
      ? assessment.selectedKeys
      : coreKeys;

  const missing = ranked.filter((k) => {
    const r = assessment.responses.find((x) => x.valueKey === k);
    if (r?.seasonStatus === 'not_relevant') return false;
    return (
      !r ||
      r.currentLifeScore == null ||
      r.idealLifeScore == null
    );
  });
  if (missing.length) {
    throw err(
      400,
      `All assessed values need Current Life and Ideal Life scores. Missing: ${missing.join(', ')}`
    );
  }

  const maxP = Number(assessment.template.settings?.maxPriorities || 3);
  const priorities = [...new Set((priorityKeys || []).map(String))]
    .filter((k) => ranked.includes(k))
    .slice(0, maxP);

  const summary = buildSummary(assessment.template, assessment.responses, priorities);
  const nextContext =
    context === undefined ? assessment.context || {} : { ...(assessment.context || {}), ...context };

  await pool.execute(
    `UPDATE values_alignment_assessments
     SET status = 'completed',
         priority_keys_json = ?,
         summary_json = ?,
         context_json = ?,
         selected_keys_json = ?,
         ranked_keys_json = ?,
         completed_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(summary),
      JSON.stringify(nextContext),
      JSON.stringify(ranked),
      JSON.stringify(ranked),
      Number(assessmentId)
    ]
  );
  return getAssessmentById(assessmentId);
}

export async function upsertCommitment({
  assessmentId,
  valueKey,
  title,
  behavior,
  startingAlignmentScore,
  desiredAlignmentScore,
  obstacles,
  supportNeeded,
  firstStep,
  targetDate,
  confidenceScore,
  status = 'draft',
  commitmentId = null
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  const key = String(valueKey || '').trim();
  if (!assessment.template.values.some((v) => v.key === key)) {
    throw err(400, 'Unknown value');
  }

  if (commitmentId) {
    await pool.execute(
      `UPDATE values_alignment_commitments SET
         title = ?, behavior = ?, starting_alignment_score = ?, desired_alignment_score = ?,
         obstacles = ?, support_needed = ?, first_step = ?, target_date = ?,
         confidence_score = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND assessment_id = ?`,
      [
        title || null,
        behavior || null,
        startingAlignmentScore ?? null,
        desiredAlignmentScore ?? null,
        obstacles || null,
        supportNeeded || null,
        firstStep || null,
        targetDate || null,
        confidenceScore ?? null,
        status || 'draft',
        Number(commitmentId),
        Number(assessmentId)
      ]
    );
  } else {
    await pool.execute(
      `INSERT INTO values_alignment_commitments
        (assessment_id, value_key, title, behavior, starting_alignment_score, desired_alignment_score,
         obstacles, support_needed, first_step, target_date, confidence_score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(assessmentId),
        key,
        title || null,
        behavior || null,
        startingAlignmentScore ?? null,
        desiredAlignmentScore ?? null,
        obstacles || null,
        supportNeeded || null,
        firstStep || null,
        targetDate || null,
        confidenceScore ?? null,
        status || 'draft'
      ]
    );
  }
  return getAssessmentById(assessmentId);
}

export async function listAssessmentsForSubject({ agencyId, clientId = null, subjectUserId = null }) {
  const params = [Number(agencyId)];
  let where = 'agency_id = ?';
  if (clientId) {
    where += ' AND client_id = ?';
    params.push(Number(clientId));
  } else if (subjectUserId) {
    where += ' AND subject_user_id = ?';
    params.push(Number(subjectUserId));
  } else {
    return [];
  }
  const [rows] = await pool.execute(
    `SELECT id, status, started_at, completed_at, summary_json, access_token, created_at, updated_at
     FROM values_alignment_assessments
     WHERE ${where}
     ORDER BY COALESCE(completed_at, created_at) DESC, id DESC`,
    params
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    status: r.status,
    accessToken: r.access_token,
    summary: parseJson(r.summary_json, null),
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export { buildSummary };
