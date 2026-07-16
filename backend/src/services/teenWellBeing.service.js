import crypto from 'crypto';
import pool from '../config/database.js';
import {
  buildTeenWellBeingSummary,
  domainsForContext,
  calculateTeenWellBeingIndex,
  calculateTeenSupportOpportunityScore,
  teenWellBeingIndexLabel,
  domainStatusLabel
} from './teenWellBeing.scoring.js';

export {
  buildTeenWellBeingSummary,
  domainsForContext,
  calculateTeenWellBeingIndex,
  calculateTeenSupportOpportunityScore,
  teenWellBeingIndexLabel,
  domainStatusLabel
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
    wellbeingSystem: d.wellbeing_system,
    wellBeingSystem: d.wellbeing_system,
    weight: Number(d.weight || 0),
    color: d.color,
    icon: d.icon,
    displayOrder: Number(d.display_order || 0),
    isSensitive: !!d.is_sensitive,
    isActive: !!d.is_active,
    ageVersions: parseJson(d.age_versions_json, []) || [],
    availableModes: parseJson(d.available_modes_json, ['full']) || ['full'],
    scoreLabels: parseJson(d.score_labels_json, {}) || {},
    reflectionOptions: parseJson(d.reflection_options_json, []) || [],
    supportSuggestions: parseJson(d.support_suggestions_json, []) || [],
    primaryQuestion: d.primary_question || '',
    reflectionPrompt: d.reflection_prompt || ''
  };
}

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM teen_wellbeing_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM teen_wellbeing_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Teen Well-Being template not found');

  const [domains] = await pool.execute(
    `SELECT * FROM teen_wellbeing_template_domains
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
    `SELECT * FROM teen_wellbeing_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    domainKey: r.domain_key,
    currentExperienceScore:
      r.current_experience_score == null ? null : Number(r.current_experience_score),
    score: r.current_experience_score == null ? null : Number(r.current_experience_score),
    importanceScore: r.importance_score == null ? null : Number(r.importance_score),
    supportNeedScore: r.support_need_score == null ? null : Number(r.support_need_score),
    reflectionChips: parseJson(r.reflection_chips_json, []) || [],
    supportPreference: r.support_preference || 'none',
    writtenReflection: r.written_reflection || '',
    note: r.written_reflection || '',
    reflectionVisibility: r.reflection_visibility || 'private',
    preferNotToAnswer: !!r.prefer_not_to_answer
  }));
}

async function loadSupportRequests(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM teen_wellbeing_support_requests WHERE assessment_id = ? ORDER BY id ASC`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    domainKey: r.domain_key,
    requestedSupport: r.requested_support,
    urgency: r.urgency,
    message: r.message || '',
    messageVisibility: r.message_visibility,
    status: r.status
  }));
}

async function hydrateAssessment(row) {
  if (!row) return null;
  let template = await getDefaultTemplate({ agencyId: row.agency_id });
  if (Number(row.template_id) !== Number(template.id)) {
    const [trows] = await pool.execute(
      `SELECT * FROM teen_wellbeing_templates WHERE id = ? LIMIT 1`,
      [row.template_id]
    );
    if (trows?.[0]) {
      const [domains] = await pool.execute(
        `SELECT * FROM teen_wellbeing_template_domains
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
  const ageVersion = row.age_version || 'ages-15-to-18';
  const context = parseJson(row.context_json, {}) || {};
  const priorityKeys = parseJson(row.selected_priorities_json, []) || [];
  const summary =
    parseJson(row.summary_json, null) ||
    buildTeenWellBeingSummary(template, responses, {
      mode,
      ageVersion,
      priorityKeys
    });

  return {
    id: Number(row.id),
    agencyId: row.agency_id == null ? null : Number(row.agency_id),
    templateId: Number(row.template_id),
    templateVersion: Number(row.template_version || 1),
    participantUserId:
      row.participant_user_id == null ? null : Number(row.participant_user_id),
    clientId: row.client_id == null ? null : Number(row.client_id),
    mode,
    ageVersion,
    setting: row.setting || null,
    status: row.status,
    accessToken: row.access_token,
    context,
    responses,
    supportRequests,
    summary,
    teenWellBeingIndex:
      row.teen_wellbeing_index == null
        ? summary.teenWellBeingIndex
        : Number(row.teen_wellbeing_index),
    selectedPriorities: priorityKeys,
    wellbeingPlans: parseJson(row.wellbeing_plans_json, []) || [],
    supportNetwork: parseJson(row.support_network_json, []) || [],
    weeklyCheckIns: parseJson(row.weekly_checkins_json, []) || [],
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
    `SELECT * FROM teen_wellbeing_assessments WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function getAssessmentByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM teen_wellbeing_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function createAssessment({
  agencyId = null,
  participantUserId = null,
  clientId = null,
  counselorUserId = null,
  coachUserId = null,
  mode = 'full',
  ageVersion = 'ages-15-to-18',
  setting = 'self-guided',
  context = {}
} = {}) {
  const template = await getDefaultTemplate({ agencyId });
  const accessToken = newAccessToken();
  const safeMode = ['full', 'weekly', 'quick', 'transition', 'targeted'].includes(mode)
    ? mode
    : 'full';
  const safeAge = ['ages-12-to-14', 'ages-15-to-18', 'transition-age-youth', 'custom'].includes(
    ageVersion
  )
    ? ageVersion
    : 'ages-15-to-18';

  const [result] = await pool.execute(
    `INSERT INTO teen_wellbeing_assessments
      (agency_id, template_id, template_version, participant_user_id, client_id,
       counselor_user_id, coach_user_id, mode, age_version, setting, status,
       access_token, context_json, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, NOW())`,
    [
      agencyId ? Number(agencyId) : null,
      template.id,
      template.version,
      participantUserId ? Number(participantUserId) : null,
      clientId ? Number(clientId) : null,
      counselorUserId || null,
      coachUserId || null,
      safeMode,
      safeAge,
      setting || 'self-guided',
      accessToken,
      JSON.stringify({ guest: !participantUserId, ...context })
    ]
  );
  return getAssessmentById(result.insertId);
}

export async function upsertDomainResponse({
  assessmentId,
  domainKey,
  currentExperienceScore = undefined,
  score = undefined,
  importanceScore = undefined,
  supportNeedScore = undefined,
  reflectionChips = undefined,
  supportPreference = undefined,
  writtenReflection = undefined,
  note = undefined,
  reflectionVisibility = undefined,
  preferNotToAnswer = undefined
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    throw err(409, 'Completed assessments cannot be edited');
  }

  const key = String(domainKey || '').trim();
  if (!assessment.template.domains.some((d) => d.key === key)) {
    throw err(400, 'Unknown domain');
  }

  const validateScore = (n, label) => {
    if (n === undefined || n === null) return;
    const v = Number(n);
    if (!Number.isInteger(v) || v < 1 || v > 10) throw err(400, `${label} must be 1–10`);
  };

  const incomingScore =
    currentExperienceScore !== undefined ? currentExperienceScore : score;
  validateScore(incomingScore, 'Current experience');
  validateScore(importanceScore, 'Importance');
  validateScore(supportNeedScore, 'Support need');

  const existing = assessment.responses.find((r) => r.domainKey === key);
  const nextScore =
    incomingScore === undefined ? existing?.currentExperienceScore ?? null : incomingScore;
  const nextImportance =
    importanceScore === undefined ? existing?.importanceScore ?? null : importanceScore;
  const nextSupportNeed =
    supportNeedScore === undefined ? existing?.supportNeedScore ?? null : supportNeedScore;
  const nextChips =
    reflectionChips === undefined
      ? existing?.reflectionChips || []
      : Array.isArray(reflectionChips)
        ? reflectionChips
        : [];
  const nextPref =
    supportPreference === undefined
      ? existing?.supportPreference || 'none'
      : String(supportPreference);
  const reflectionText =
    writtenReflection !== undefined
      ? writtenReflection
      : note !== undefined
        ? note
        : existing?.writtenReflection || '';
  const nextVisibility =
    reflectionVisibility === undefined
      ? existing?.reflectionVisibility || 'private'
      : String(reflectionVisibility);
  const nextPrefer =
    preferNotToAnswer === undefined
      ? !!existing?.preferNotToAnswer
      : !!preferNotToAnswer;

  const savedReflection = nextVisibility === 'do-not-save' ? null : reflectionText || null;

  await pool.execute(
    `INSERT INTO teen_wellbeing_responses
      (assessment_id, domain_key, current_experience_score, importance_score, support_need_score,
       reflection_chips_json, support_preference, written_reflection, reflection_visibility,
       prefer_not_to_answer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       current_experience_score = VALUES(current_experience_score),
       importance_score = VALUES(importance_score),
       support_need_score = VALUES(support_need_score),
       reflection_chips_json = VALUES(reflection_chips_json),
       support_preference = VALUES(support_preference),
       written_reflection = VALUES(written_reflection),
       reflection_visibility = VALUES(reflection_visibility),
       prefer_not_to_answer = VALUES(prefer_not_to_answer),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      nextPrefer ? null : nextScore,
      nextImportance,
      nextSupportNeed,
      JSON.stringify(nextChips),
      nextPref,
      savedReflection,
      nextVisibility,
      nextPrefer ? 1 : 0
    ]
  );

  if (['help-today', 'private-follow-up', 'counselor'].includes(nextPref) && nextPref !== 'none') {
    const urgency = nextPref === 'help-today' ? 'today' : 'soon';
    await pool.execute(
      `INSERT INTO teen_wellbeing_support_requests
        (assessment_id, domain_key, requested_support, urgency, status)
       VALUES (?, ?, ?, ?, 'submitted')`,
      [Number(assessmentId), key, nextPref, urgency]
    );
  }

  return getAssessmentById(assessmentId);
}

export async function updatePlans({
  assessmentId,
  selectedPriorities = undefined,
  wellbeingPlans = undefined,
  supportNetwork = undefined,
  weeklyCheckIns = undefined,
  context = undefined
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'archived') throw err(409, 'Archived assessments cannot be edited');

  const maxP = Number(assessment.template.settings?.maxPriorities || 3);
  const priorities =
    selectedPriorities === undefined
      ? assessment.selectedPriorities
      : [...new Set((selectedPriorities || []).map(String))].slice(0, maxP);
  const plans =
    wellbeingPlans === undefined ? assessment.wellbeingPlans : wellbeingPlans || [];
  const network =
    supportNetwork === undefined ? assessment.supportNetwork : supportNetwork || [];
  const checkIns =
    weeklyCheckIns === undefined ? assessment.weeklyCheckIns : weeklyCheckIns || [];
  const nextContext =
    context === undefined ? assessment.context : { ...assessment.context, ...context };

  await pool.execute(
    `UPDATE teen_wellbeing_assessments
     SET selected_priorities_json = ?,
         wellbeing_plans_json = ?,
         support_network_json = ?,
         weekly_checkins_json = ?,
         context_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(plans),
      JSON.stringify(network),
      JSON.stringify(checkIns),
      JSON.stringify(nextContext),
      Number(assessmentId)
    ]
  );
  return getAssessmentById(assessmentId);
}

export async function completeAssessment({
  assessmentId,
  selectedPriorities = [],
  wellbeingPlans = []
} = {}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed') return assessment;

  const domains = domainsForContext(assessment.template, {
    mode: assessment.mode,
    ageVersion: assessment.ageVersion
  });
  const missing = domains.filter((d) => {
    const r = assessment.responses.find((x) => x.domainKey === d.key);
    return !r || (!r.preferNotToAnswer && r.currentExperienceScore == null);
  });
  if (missing.length) {
    throw err(
      400,
      `All domains need a score or Prefer not to answer. Missing: ${missing
        .map((d) => d.key)
        .join(', ')}`
    );
  }

  const maxP = Number(assessment.template.settings?.maxPriorities || 3);
  const priorities = [...new Set((selectedPriorities || []).map(String))]
    .filter((k) => domains.some((d) => d.key === k))
    .slice(0, maxP);

  const summary = buildTeenWellBeingSummary(assessment.template, assessment.responses, {
    mode: assessment.mode,
    ageVersion: assessment.ageVersion,
    priorityKeys: priorities
  });

  await pool.execute(
    `UPDATE teen_wellbeing_assessments
     SET status = 'completed',
         selected_priorities_json = ?,
         wellbeing_plans_json = ?,
         summary_json = ?,
         teen_wellbeing_index = ?,
         completed_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(wellbeingPlans || assessment.wellbeingPlans || []),
      JSON.stringify(summary),
      summary.teenWellBeingIndex,
      Number(assessmentId)
    ]
  );
  const __completed = await getAssessmentById(assessmentId);
  /* assessment-deliverables-hub-hook */
  try {
    const { scheduleDeliverableGeneration } = await import('./assessmentDeliverable.service.js');
    scheduleDeliverableGeneration({ family: 'teen_wellbeing', assessment: __completed });
  } catch (e) {
    console.warn('[teen_wellbeing] deliverable hook failed', e?.message || e);
  }
  return __completed;
}

export async function listSubjectAssessments({ participantUserId = null, clientId = null } = {}) {
  const clauses = [];
  const params = [];
  if (participantUserId) {
    clauses.push('participant_user_id = ?');
    params.push(Number(participantUserId));
  }
  if (clientId) {
    clauses.push('client_id = ?');
    params.push(Number(clientId));
  }
  if (!clauses.length) return [];
  const [rows] = await pool.execute(
    `SELECT id, status, mode, age_version, teen_wellbeing_index, completed_at, created_at
     FROM teen_wellbeing_assessments
     WHERE ${clauses.join(' OR ')}
     ORDER BY id DESC
     LIMIT 50`,
    params
  );
  return rows || [];
}
