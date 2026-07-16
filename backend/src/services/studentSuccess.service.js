import crypto from 'crypto';
import pool from '../config/database.js';
import {
  calculateStudentSuccessScore,
  calculateWeightedStudentSuccessScore,
  calculateStudentOpportunityScore,
  studentSuccessStatusLabel,
  domainsForContext,
  buildSummary
} from './studentSuccess.scoring.js';

export {
  calculateStudentSuccessScore,
  calculateWeightedStudentSuccessScore,
  calculateStudentOpportunityScore,
  studentSuccessStatusLabel,
  domainsForContext,
  buildSummary
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

function mapDomain(d) {
  return {
    id: Number(d.id),
    key: d.domain_key,
    label: d.label,
    shortLabel: d.short_label,
    definition: d.definition,
    successSystem: d.success_system,
    weight: Number(d.weight || 0),
    color: d.color,
    icon: d.icon,
    displayOrder: Number(d.display_order || 0),
    isOptional: !!d.is_optional,
    ageGroups: parseJson(d.age_groups_json, []) || [],
    availableModes: parseJson(d.available_modes_json, ['full']) || ['full'],
    scoreLabels: parseJson(d.score_labels_json, {}) || {},
    reflectionOptions: parseJson(d.reflection_options_json, []) || [],
    primaryQuestion: d.primary_question || '',
    reflectionPrompt: d.reflection_prompt || ''
  };
}

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM student_success_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM student_success_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Student Success template not found');

  const [domains] = await pool.execute(
    `SELECT * FROM student_success_template_domains
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
    domains: (domains || []).map(mapDomain)
  };
}

async function loadResponses(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM student_success_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    domainKey: r.domain_key,
    score: r.score == null ? null : Number(r.score),
    importanceScore: r.importance_score == null ? null : Number(r.importance_score),
    confidenceScore: r.confidence_score == null ? null : Number(r.confidence_score),
    reflectionChips: parseJson(r.reflection_chips_json, []) || [],
    supportPreference: r.support_preference || 'none',
    note: r.note || '',
    noteVisibility: r.note_visibility || 'assigned-support-team'
  }));
}

async function loadSupportRequests(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM student_success_support_requests WHERE assessment_id = ? ORDER BY id ASC`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    domainKey: r.domain_key,
    requestedSupport: r.requested_support,
    description: r.description || '',
    visibility: r.visibility,
    status: r.status
  }));
}

async function hydrateAssessment(row) {
  if (!row) return null;
  let template = await getDefaultTemplate({ agencyId: row.agency_id });
  if (Number(row.template_id) !== Number(template.id)) {
    const [trows] = await pool.execute(
      `SELECT * FROM student_success_templates WHERE id = ? LIMIT 1`,
      [row.template_id]
    );
    if (trows?.[0]) {
      const [domains] = await pool.execute(
        `SELECT * FROM student_success_template_domains
         WHERE template_id = ? AND is_active = 1
         ORDER BY display_order ASC, id ASC`,
        [trows[0].id]
      );
      template = {
        id: Number(trows[0].id),
        agencyId: trows[0].agency_id == null ? null : Number(trows[0].agency_id),
        name: trows[0].name,
        description: trows[0].description,
        version: Number(trows[0].version || 1),
        settings: parseJson(trows[0].settings_json, {}),
        domains: (domains || []).map(mapDomain)
      };
    }
  }

  const responses = await loadResponses(row.id);
  const supportRequests = await loadSupportRequests(row.id);
  const mode = row.mode || 'full';
  const educationLevel = row.education_level || 'high-school';
  const context = parseJson(row.context_json, {}) || {};
  const summary =
    parseJson(row.summary_json, null) ||
    buildSummary(template, responses, { mode, educationLevel });

  return {
    id: Number(row.id),
    agencyId: row.agency_id == null ? null : Number(row.agency_id),
    templateId: Number(row.template_id),
    templateVersion: Number(row.template_version || 1),
    studentUserId: row.student_user_id == null ? null : Number(row.student_user_id),
    clientId: row.client_id == null ? null : Number(row.client_id),
    mode,
    educationLevel,
    status: row.status,
    accessToken: row.access_token,
    context,
    responses,
    supportRequests,
    summary,
    studentSuccessScore:
      row.student_success_score == null ? summary.studentSuccessScore : Number(row.student_success_score),
    selectedPriorities: parseJson(row.selected_priorities_json, []) || [],
    successPlans: parseJson(row.success_plans_json, []) || [],
    template,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getAssessmentById(id) {
  const [rows] = await pool.execute(
    `SELECT * FROM student_success_assessments WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function getAssessmentByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM student_success_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function createAssessment({
  agencyId = null,
  studentUserId = null,
  clientId = null,
  coachUserId = null,
  mode = 'full',
  educationLevel = 'high-school',
  context = {}
} = {}) {
  const template = await getDefaultTemplate({ agencyId });
  const accessToken = newAccessToken();
  const safeMode = ['full', 'weekly', 'transition', 'targeted'].includes(mode) ? mode : 'full';
  const safeLevel = [
    'upper-elementary',
    'middle-school',
    'high-school',
    'college',
    'adult-education',
    'other'
  ].includes(educationLevel)
    ? educationLevel
    : 'high-school';

  const [result] = await pool.execute(
    `INSERT INTO student_success_assessments
      (agency_id, template_id, template_version, student_user_id, client_id, coach_user_id,
       mode, education_level, status, access_token, context_json, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, NOW())`,
    [
      agencyId ? Number(agencyId) : null,
      template.id,
      template.version,
      studentUserId ? Number(studentUserId) : null,
      clientId ? Number(clientId) : null,
      coachUserId || null,
      safeMode,
      safeLevel,
      accessToken,
      JSON.stringify({ guest: !studentUserId, ...context })
    ]
  );
  return getAssessmentById(result.insertId);
}

export async function upsertDomainResponse({
  assessmentId,
  domainKey,
  score = undefined,
  importanceScore = undefined,
  confidenceScore = undefined,
  reflectionChips = undefined,
  supportPreference = undefined,
  note = undefined,
  noteVisibility = undefined
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    throw err(409, 'Completed assessments cannot be edited');
  }
  const key = String(domainKey || '').trim();
  const domain = assessment.template.domains.find((d) => d.key === key);
  if (!domain) throw err(400, 'Unknown domain');

  const validateScore = (v, label) => {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw err(400, `${label} must be 1–10`);
    return n;
  };

  if (score !== undefined && score !== null) validateScore(score, 'Score');
  if (importanceScore !== undefined && importanceScore !== null) {
    validateScore(importanceScore, 'Importance');
  }
  if (confidenceScore !== undefined && confidenceScore !== null) {
    validateScore(confidenceScore, 'Confidence');
  }

  const existing = assessment.responses.find((r) => r.domainKey === key);
  const nextScore = score === undefined ? existing?.score ?? null : score;
  const nextImp =
    importanceScore === undefined ? existing?.importanceScore ?? null : importanceScore;
  const nextConf =
    confidenceScore === undefined ? existing?.confidenceScore ?? null : confidenceScore;
  const nextChips =
    reflectionChips === undefined
      ? existing?.reflectionChips || []
      : Array.isArray(reflectionChips)
        ? reflectionChips
        : [];
  const nextSupport =
    supportPreference === undefined
      ? existing?.supportPreference || 'none'
      : String(supportPreference || 'none');
  const nextNote = note === undefined ? existing?.note || '' : String(note || '');
  const nextVis =
    noteVisibility === undefined
      ? existing?.noteVisibility || 'assigned-support-team'
      : String(noteVisibility || 'assigned-support-team');

  await pool.execute(
    `INSERT INTO student_success_responses
      (assessment_id, domain_key, score, importance_score, confidence_score,
       reflection_chips_json, support_preference, note, note_visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       score = VALUES(score),
       importance_score = VALUES(importance_score),
       confidence_score = VALUES(confidence_score),
       reflection_chips_json = VALUES(reflection_chips_json),
       support_preference = VALUES(support_preference),
       note = VALUES(note),
       note_visibility = VALUES(note_visibility),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      nextScore,
      nextImp,
      nextConf,
      JSON.stringify(nextChips),
      nextSupport,
      nextNote || null,
      nextVis
    ]
  );

  if (nextSupport && nextSupport !== 'none') {
    const [existingReq] = await pool.execute(
      `SELECT id FROM student_success_support_requests
       WHERE assessment_id = ? AND domain_key = ? AND status IN ('submitted','acknowledged','scheduled','in_progress')
       LIMIT 1`,
      [Number(assessmentId), key]
    );
    if (!existingReq?.[0]) {
      await pool.execute(
        `INSERT INTO student_success_support_requests
          (assessment_id, domain_key, requested_support, description, status)
         VALUES (?, ?, ?, ?, 'submitted')`,
        [Number(assessmentId), key, nextSupport, nextNote || null]
      );
    }
  }

  return getAssessmentById(assessmentId);
}

export async function updatePrioritiesAndPlans({
  assessmentId,
  selectedPriorities = undefined,
  successPlans = undefined
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');

  const priorities =
    selectedPriorities === undefined
      ? assessment.selectedPriorities
      : Array.isArray(selectedPriorities)
        ? selectedPriorities.slice(0, 3)
        : [];
  const plans =
    successPlans === undefined
      ? assessment.successPlans
      : Array.isArray(successPlans)
        ? successPlans
        : [];

  await pool.execute(
    `UPDATE student_success_assessments
     SET selected_priorities_json = ?,
         success_plans_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [JSON.stringify(priorities), JSON.stringify(plans), Number(assessmentId)]
  );
  return getAssessmentById(assessmentId);
}

export async function completeAssessment({ assessmentId }) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'reviewed') return assessment;

  const activeDomains = domainsForContext(assessment.template, {
    mode: assessment.mode,
    educationLevel: assessment.educationLevel
  });
  const missing = activeDomains.filter((d) => {
    const r = assessment.responses.find((x) => x.domainKey === d.key);
    return !r || r.score == null;
  });
  if (missing.length) {
    throw err(400, `All domains require a score. Missing: ${missing.map((d) => d.key).join(', ')}`);
  }

  const summary = buildSummary(assessment.template, assessment.responses, {
    mode: assessment.mode,
    educationLevel: assessment.educationLevel
  });
  await pool.execute(
    `UPDATE student_success_assessments
     SET status = 'completed',
         summary_json = ?,
         student_success_score = ?,
         completed_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [JSON.stringify(summary), summary.studentSuccessScore, Number(assessmentId)]
  );
  const __completed = await getAssessmentById(assessmentId);
  /* assessment-deliverables-hub-hook */
  try {
    const { scheduleDeliverableGeneration } = await import('./assessmentDeliverable.service.js');
    scheduleDeliverableGeneration({ family: 'student_success', assessment: __completed });
  } catch (e) {
    console.warn('[student_success] deliverable hook failed', e?.message || e);
  }
  return __completed;
}

export async function listAssessmentsForStudent({
  agencyId,
  studentUserId = null,
  clientId = null
}) {
  const params = [];
  let where = '1=1';
  if (agencyId) {
    where += ' AND agency_id = ?';
    params.push(Number(agencyId));
  }
  if (studentUserId) {
    where += ' AND student_user_id = ?';
    params.push(Number(studentUserId));
  } else if (clientId) {
    where += ' AND client_id = ?';
    params.push(Number(clientId));
  } else {
    return [];
  }
  const [rows] = await pool.execute(
    `SELECT id, mode, education_level, status, student_success_score, summary_json,
            access_token, started_at, completed_at, created_at
     FROM student_success_assessments
     WHERE ${where}
     ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
     LIMIT 50`,
    params
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    mode: r.mode,
    educationLevel: r.education_level,
    status: r.status,
    studentSuccessScore: r.student_success_score == null ? null : Number(r.student_success_score),
    summary: parseJson(r.summary_json, null),
    accessToken: r.access_token,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at
  }));
}
