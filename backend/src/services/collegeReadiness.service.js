import crypto from 'crypto';
import pool from '../config/database.js';
import {
  calculateCollegeReadinessScore,
  calculateWeightedCollegeReadinessScore,
  calculateCollegeConfidenceGap,
  calculateCollegeSupportGap,
  collegeReadinessStatusLabel,
  domainsForContext,
  buildSummary,
  LAUNCH_STAGES
} from './collegeReadiness.scoring.js';

export {
  calculateCollegeReadinessScore,
  calculateWeightedCollegeReadinessScore,
  calculateCollegeConfidenceGap,
  calculateCollegeSupportGap,
  collegeReadinessStatusLabel,
  domainsForContext,
  buildSummary,
  LAUNCH_STAGES
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
    launchSystem: d.launch_system,
    launchStage: d.launch_stage,
    weight: Number(d.weight || 0),
    color: d.color,
    icon: d.icon,
    displayOrder: Number(d.display_order || 0),
    isOptional: !!d.is_optional,
    studentVersions: parseJson(d.student_versions_json, []) || [],
    availableModes: parseJson(d.available_modes_json, ['full']) || ['full'],
    scoreLabels: parseJson(d.score_labels_json, {}) || {},
    reflectionOptions: parseJson(d.reflection_options_json, []) || [],
    checklistSuggestions: parseJson(d.checklist_suggestions_json, []) || [],
    primaryQuestion: d.primary_question || '',
    reflectionPrompt: d.reflection_prompt || ''
  };
}

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM college_readiness_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM college_readiness_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'College Readiness template not found');

  const [domains] = await pool.execute(
    `SELECT * FROM college_readiness_template_domains
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
    `SELECT * FROM college_readiness_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    domainKey: r.domain_key,
    readinessScore: r.readiness_score == null ? null : Number(r.readiness_score),
    confidenceScore: r.confidence_score == null ? null : Number(r.confidence_score),
    supportAvailabilityScore:
      r.support_availability_score == null ? null : Number(r.support_availability_score),
    reflectionChips: parseJson(r.reflection_chips_json, []) || [],
    supportPreference: r.support_preference || 'none',
    note: r.note || '',
    noteVisibility: r.note_visibility || 'assigned-support-team'
  }));
}

async function loadSupportRequests(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM college_readiness_support_requests WHERE assessment_id = ? ORDER BY id ASC`,
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
      `SELECT * FROM college_readiness_templates WHERE id = ? LIMIT 1`,
      [row.template_id]
    );
    if (trows?.[0]) {
      const [domains] = await pool.execute(
        `SELECT * FROM college_readiness_template_domains
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
  const studentVersion = row.student_version || 'senior';
  const summary =
    parseJson(row.summary_json, null) ||
    buildSummary(template, responses, { mode, studentVersion });

  return {
    id: Number(row.id),
    agencyId: row.agency_id == null ? null : Number(row.agency_id),
    templateId: Number(row.template_id),
    templateVersion: Number(row.template_version || 1),
    studentUserId: row.student_user_id == null ? null : Number(row.student_user_id),
    clientId: row.client_id == null ? null : Number(row.client_id),
    mode,
    studentVersion,
    status: row.status,
    accessToken: row.access_token,
    context: parseJson(row.context_json, {}) || {},
    responses,
    supportRequests,
    summary,
    collegeReadinessScore:
      row.college_readiness_score == null
        ? summary.collegeReadinessScore
        : Number(row.college_readiness_score),
    selectedPriorities: parseJson(row.selected_priorities_json, []) || [],
    launchPlans: parseJson(row.launch_plans_json, []) || [],
    checklist: parseJson(row.checklist_json, []) || [],
    deadlines: parseJson(row.deadlines_json, []) || [],
    firstSemesterPlan: parseJson(row.first_semester_plan_json, null),
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
    `SELECT * FROM college_readiness_assessments WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function getAssessmentByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM college_readiness_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function createAssessment({
  agencyId = null,
  studentUserId = null,
  clientId = null,
  counselorUserId = null,
  mode = 'full',
  studentVersion = 'senior',
  context = {}
} = {}) {
  const template = await getDefaultTemplate({ agencyId });
  const accessToken = newAccessToken();
  const safeMode = ['full', 'quick', 'application', 'transition'].includes(mode) ? mode : 'full';
  const safeVersion = [
    'junior',
    'senior',
    'first-generation',
    'community-college',
    'residential-four-year',
    'transfer',
    'returning-adult',
    'custom'
  ].includes(studentVersion)
    ? studentVersion
    : 'senior';

  const [result] = await pool.execute(
    `INSERT INTO college_readiness_assessments
      (agency_id, template_id, template_version, student_user_id, client_id, counselor_user_id,
       mode, student_version, status, access_token, context_json, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, NOW())`,
    [
      agencyId ? Number(agencyId) : null,
      template.id,
      template.version,
      studentUserId ? Number(studentUserId) : null,
      clientId ? Number(clientId) : null,
      counselorUserId || null,
      safeMode,
      safeVersion,
      accessToken,
      JSON.stringify({ guest: !studentUserId, ...context })
    ]
  );
  return getAssessmentById(result.insertId);
}

export async function upsertDomainResponse({
  assessmentId,
  domainKey,
  readinessScore = undefined,
  confidenceScore = undefined,
  supportAvailabilityScore = undefined,
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

  if (readinessScore !== undefined && readinessScore !== null) {
    validateScore(readinessScore, 'Readiness');
  }
  if (confidenceScore !== undefined && confidenceScore !== null) {
    validateScore(confidenceScore, 'Confidence');
  }
  if (supportAvailabilityScore !== undefined && supportAvailabilityScore !== null) {
    validateScore(supportAvailabilityScore, 'Support availability');
  }

  const existing = assessment.responses.find((r) => r.domainKey === key);
  const nextReady =
    readinessScore === undefined ? existing?.readinessScore ?? null : readinessScore;
  const nextConf =
    confidenceScore === undefined ? existing?.confidenceScore ?? null : confidenceScore;
  const nextSupportAvail =
    supportAvailabilityScore === undefined
      ? existing?.supportAvailabilityScore ?? null
      : supportAvailabilityScore;
  const nextChips =
    reflectionChips === undefined
      ? existing?.reflectionChips || []
      : Array.isArray(reflectionChips)
        ? reflectionChips
        : [];
  const nextSupportPref =
    supportPreference === undefined
      ? existing?.supportPreference || 'none'
      : String(supportPreference || 'none');
  const nextNote = note === undefined ? existing?.note || '' : String(note || '');
  const nextVis =
    noteVisibility === undefined
      ? existing?.noteVisibility || 'assigned-support-team'
      : String(noteVisibility || 'assigned-support-team');

  await pool.execute(
    `INSERT INTO college_readiness_responses
      (assessment_id, domain_key, readiness_score, confidence_score, support_availability_score,
       reflection_chips_json, support_preference, note, note_visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       readiness_score = VALUES(readiness_score),
       confidence_score = VALUES(confidence_score),
       support_availability_score = VALUES(support_availability_score),
       reflection_chips_json = VALUES(reflection_chips_json),
       support_preference = VALUES(support_preference),
       note = VALUES(note),
       note_visibility = VALUES(note_visibility),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      nextReady,
      nextConf,
      nextSupportAvail,
      JSON.stringify(nextChips),
      nextSupportPref,
      nextNote || null,
      nextVis
    ]
  );

  if (nextSupportPref && nextSupportPref !== 'none') {
    const [existingReq] = await pool.execute(
      `SELECT id FROM college_readiness_support_requests
       WHERE assessment_id = ? AND domain_key = ? AND status IN ('submitted','acknowledged','scheduled','in_progress')
       LIMIT 1`,
      [Number(assessmentId), key]
    );
    if (!existingReq?.[0]) {
      await pool.execute(
        `INSERT INTO college_readiness_support_requests
          (assessment_id, domain_key, requested_support, description, status)
         VALUES (?, ?, ?, ?, 'submitted')`,
        [Number(assessmentId), key, nextSupportPref, nextNote || null]
      );
    }
  }

  return getAssessmentById(assessmentId);
}

export async function updatePlansAndChecklist({
  assessmentId,
  selectedPriorities = undefined,
  launchPlans = undefined,
  checklist = undefined,
  deadlines = undefined,
  firstSemesterPlan = undefined
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
    launchPlans === undefined
      ? assessment.launchPlans
      : Array.isArray(launchPlans)
        ? launchPlans
        : [];
  const checks =
    checklist === undefined
      ? assessment.checklist
      : Array.isArray(checklist)
        ? checklist
        : [];
  const dlines =
    deadlines === undefined
      ? assessment.deadlines
      : Array.isArray(deadlines)
        ? deadlines
        : [];
  const firstPlan =
    firstSemesterPlan === undefined ? assessment.firstSemesterPlan : firstSemesterPlan;

  await pool.execute(
    `UPDATE college_readiness_assessments
     SET selected_priorities_json = ?,
         launch_plans_json = ?,
         checklist_json = ?,
         deadlines_json = ?,
         first_semester_plan_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(plans),
      JSON.stringify(checks),
      JSON.stringify(dlines),
      firstPlan == null ? null : JSON.stringify(firstPlan),
      Number(assessmentId)
    ]
  );
  return getAssessmentById(assessmentId);
}

export async function completeAssessment({ assessmentId }) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'reviewed') return assessment;

  const activeDomains = domainsForContext(assessment.template, {
    mode: assessment.mode,
    studentVersion: assessment.studentVersion
  });
  const missing = activeDomains.filter((d) => {
    const r = assessment.responses.find((x) => x.domainKey === d.key);
    return !r || r.readinessScore == null;
  });
  if (missing.length) {
    throw err(400, `All domains require a score. Missing: ${missing.map((d) => d.key).join(', ')}`);
  }

  const summary = buildSummary(assessment.template, assessment.responses, {
    mode: assessment.mode,
    studentVersion: assessment.studentVersion
  });
  await pool.execute(
    `UPDATE college_readiness_assessments
     SET status = 'completed',
         summary_json = ?,
         college_readiness_score = ?,
         completed_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [JSON.stringify(summary), summary.collegeReadinessScore, Number(assessmentId)]
  );
  return getAssessmentById(assessmentId);
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
    `SELECT id, mode, student_version, status, college_readiness_score, summary_json,
            access_token, started_at, completed_at, created_at
     FROM college_readiness_assessments
     WHERE ${where}
     ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
     LIMIT 50`,
    params
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    mode: r.mode,
    studentVersion: r.student_version,
    status: r.status,
    collegeReadinessScore:
      r.college_readiness_score == null ? null : Number(r.college_readiness_score),
    summary: parseJson(r.summary_json, null),
    accessToken: r.access_token,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at
  }));
}
