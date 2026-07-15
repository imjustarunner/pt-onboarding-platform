import crypto from 'crypto';
import pool from '../config/database.js';
import {
  buildSavageBlueprintSummary,
  domainsForContext,
  calculateSavageScore,
  calculatePriorityWeightedScore,
  calculateOpportunityScore,
  savageScoreLabel,
  domainStatusLabel
} from './savageBlueprint.scoring.js';

export {
  buildSavageBlueprintSummary,
  domainsForContext,
  calculateSavageScore,
  calculatePriorityWeightedScore,
  calculateOpportunityScore,
  savageScoreLabel,
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
    savageSystem: d.savage_system,
    weight: Number(d.weight || 0),
    color: d.color,
    icon: d.icon,
    displayOrder: Number(d.display_order || 0),
    isOptional: !!d.is_optional,
    isSensitive: !!d.is_sensitive,
    allowsNotApplicable: !!d.allows_not_applicable,
    isActive: !!d.is_active,
    participantVersions: parseJson(d.participant_versions_json, []) || [],
    availableModes: parseJson(d.available_modes_json, ['full']) || ['full'],
    scoreLabels: parseJson(d.score_labels_json, {}) || {},
    reflectionOptions: parseJson(d.reflection_options_json, []) || [],
    actionSuggestions: parseJson(d.action_suggestions_json, []) || [],
    relatedAssessmentIds: parseJson(d.related_assessment_ids_json, []) || [],
    primaryQuestion: d.primary_question || '',
    reflectionPrompt: d.reflection_prompt || ''
  };
}

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM savage_blueprint_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM savage_blueprint_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Savage Blueprint template not found');

  const [domains] = await pool.execute(
    `SELECT * FROM savage_blueprint_template_domains
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
    `SELECT * FROM savage_blueprint_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    domainKey: r.domain_key,
    currentPerformanceScore:
      r.current_performance_score == null ? null : Number(r.current_performance_score),
    personalPriorityScore:
      r.personal_priority_score == null ? null : Number(r.personal_priority_score),
    momentumScore: r.momentum_score == null ? null : Number(r.momentum_score),
    effortCostScore: r.effort_cost_score == null ? null : Number(r.effort_cost_score),
    reflectionChips: parseJson(r.reflection_chips_json, []) || [],
    barriers: parseJson(r.barriers_json, []) || [],
    personalStrengths: parseJson(r.personal_strengths_json, []) || [],
    personalDefinition: r.personal_definition || '',
    supportPreference: r.support_preference || 'none',
    privateReflection: r.private_reflection || '',
    noteVisibility: r.note_visibility || 'private',
    seasonStatus: r.season_status || 'active',
    preferNotToAnswer: !!r.prefer_not_to_answer,
    isNotApplicable: !!r.is_not_applicable
  }));
}

async function hydrateAssessment(row) {
  if (!row) return null;
  let template = await getDefaultTemplate({ agencyId: row.agency_id });
  if (Number(row.template_id) !== Number(template.id)) {
    const [trows] = await pool.execute(
      `SELECT * FROM savage_blueprint_templates WHERE id = ? LIMIT 1`,
      [row.template_id]
    );
    if (trows?.[0]) {
      const [domains] = await pool.execute(
        `SELECT * FROM savage_blueprint_template_domains
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
  const mode = row.mode || 'full';
  const participantVersion = row.participant_version || 'general-adult';
  const context = parseJson(row.context_json, {}) || {};
  const priorityKeys = parseJson(row.selected_priorities_json, []) || [];
  const fatherhoodApplicable = context.fatherhoodApplicable !== false;
  const summary =
    parseJson(row.summary_json, null) ||
    buildSavageBlueprintSummary(template, responses, {
      mode,
      participantVersion,
      fatherhoodApplicable,
      priorityKeys,
      context
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
    participantVersion,
    status: row.status,
    accessToken: row.access_token,
    context,
    responses,
    summary,
    savageScore:
      row.savage_score == null ? summary.savageScore : Number(row.savage_score),
    priorityWeightedScore:
      row.priority_weighted_score == null
        ? summary.priorityWeightedScore
        : Number(row.priority_weighted_score),
    selectedPriorities: priorityKeys,
    commitmentPlans: parseJson(row.commitment_plans_json, []) || [],
    focusBoard: parseJson(row.focus_board_json, {}) || {},
    weeklyCheckins: parseJson(row.weekly_checkins_json, []) || [],
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
    `SELECT * FROM savage_blueprint_assessments WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function getAssessmentByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM savage_blueprint_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  return hydrateAssessment(rows?.[0] || null);
}

const SAFE_MODES = ['full', 'quick', 'annual-review', 'retreat', 'targeted'];

export async function createAssessment({
  agencyId = null,
  participantUserId = null,
  clientId = null,
  coachUserId = null,
  counselorUserId = null,
  mentorUserId = null,
  mode = 'full',
  participantVersion = 'general-adult',
  context = {}
} = {}) {
  const template = await getDefaultTemplate({ agencyId });
  const accessToken = newAccessToken();
  const safeMode = SAFE_MODES.includes(mode) ? mode : 'full';

  const [result] = await pool.execute(
    `INSERT INTO savage_blueprint_assessments
      (agency_id, template_id, template_version, participant_user_id, client_id,
       coach_user_id, counselor_user_id, mentor_user_id,
       mode, participant_version, status, access_token, context_json, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, NOW())`,
    [
      agencyId ? Number(agencyId) : null,
      template.id,
      template.version,
      participantUserId ? Number(participantUserId) : null,
      clientId ? Number(clientId) : null,
      coachUserId || null,
      counselorUserId || null,
      mentorUserId || null,
      safeMode,
      participantVersion || 'general-adult',
      accessToken,
      JSON.stringify({ guest: !participantUserId, fatherhoodApplicable: true, ...context })
    ]
  );
  return getAssessmentById(result.insertId);
}

export async function upsertDomainResponse({
  assessmentId,
  domainKey,
  currentPerformanceScore = undefined,
  personalPriorityScore = undefined,
  momentumScore = undefined,
  effortCostScore = undefined,
  reflectionChips = undefined,
  barriers = undefined,
  personalStrengths = undefined,
  personalDefinition = undefined,
  supportPreference = undefined,
  privateReflection = undefined,
  noteVisibility = undefined,
  seasonStatus = undefined,
  preferNotToAnswer = undefined,
  isNotApplicable = undefined
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
  validateScore(currentPerformanceScore, 'Current performance');
  validateScore(personalPriorityScore, 'Personal priority');
  validateScore(momentumScore, 'Momentum');
  validateScore(effortCostScore, 'Effort cost');

  const existing = assessment.responses.find((r) => r.domainKey === key);
  const nextPerformance =
    currentPerformanceScore === undefined
      ? existing?.currentPerformanceScore ?? null
      : currentPerformanceScore;
  const nextPriority =
    personalPriorityScore === undefined
      ? existing?.personalPriorityScore ?? null
      : personalPriorityScore;
  const nextMomentum =
    momentumScore === undefined ? existing?.momentumScore ?? null : momentumScore;
  const nextEffort =
    effortCostScore === undefined ? existing?.effortCostScore ?? null : effortCostScore;
  const nextChips =
    reflectionChips === undefined
      ? existing?.reflectionChips || []
      : Array.isArray(reflectionChips)
        ? reflectionChips
        : [];
  const nextBarriers =
    barriers === undefined
      ? existing?.barriers || []
      : Array.isArray(barriers)
        ? barriers
        : [];
  const nextStrengths =
    personalStrengths === undefined
      ? existing?.personalStrengths || []
      : Array.isArray(personalStrengths)
        ? personalStrengths
        : [];
  const nextDefinition =
    personalDefinition === undefined
      ? existing?.personalDefinition || ''
      : String(personalDefinition || '');
  const nextPref =
    supportPreference === undefined
      ? existing?.supportPreference || 'none'
      : String(supportPreference);
  const nextNote =
    privateReflection === undefined
      ? existing?.privateReflection || ''
      : String(privateReflection || '');
  const nextVisibility =
    noteVisibility === undefined ? existing?.noteVisibility || 'private' : String(noteVisibility);
  const nextSeason =
    seasonStatus === undefined ? existing?.seasonStatus || 'active' : String(seasonStatus);
  const nextPrefer =
    preferNotToAnswer === undefined ? !!existing?.preferNotToAnswer : !!preferNotToAnswer;
  const nextNa =
    isNotApplicable === undefined ? !!existing?.isNotApplicable : !!isNotApplicable;

  const savedNote = nextVisibility === 'do-not-save' ? null : nextNote || null;
  const clearScore = nextPrefer || nextSeason === 'not-relevant' || nextNa;

  await pool.execute(
    `INSERT INTO savage_blueprint_responses
      (assessment_id, domain_key, current_performance_score, personal_priority_score,
       momentum_score, effort_cost_score, reflection_chips_json, barriers_json,
       personal_strengths_json, personal_definition, support_preference,
       private_reflection, note_visibility, season_status, prefer_not_to_answer, is_not_applicable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       current_performance_score = VALUES(current_performance_score),
       personal_priority_score = VALUES(personal_priority_score),
       momentum_score = VALUES(momentum_score),
       effort_cost_score = VALUES(effort_cost_score),
       reflection_chips_json = VALUES(reflection_chips_json),
       barriers_json = VALUES(barriers_json),
       personal_strengths_json = VALUES(personal_strengths_json),
       personal_definition = VALUES(personal_definition),
       support_preference = VALUES(support_preference),
       private_reflection = VALUES(private_reflection),
       note_visibility = VALUES(note_visibility),
       season_status = VALUES(season_status),
       prefer_not_to_answer = VALUES(prefer_not_to_answer),
       is_not_applicable = VALUES(is_not_applicable),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      clearScore ? null : nextPerformance,
      nextPriority,
      nextMomentum,
      nextEffort,
      JSON.stringify(nextChips),
      JSON.stringify(nextBarriers),
      JSON.stringify(nextStrengths),
      nextDefinition || null,
      nextPref,
      savedNote,
      nextVisibility,
      nextSeason,
      nextPrefer ? 1 : 0,
      nextNa ? 1 : 0
    ]
  );

  return getAssessmentById(assessmentId);
}

export async function updatePlans({
  assessmentId,
  selectedPriorities = undefined,
  commitmentPlans = undefined,
  weeklyCheckins = undefined,
  focusBoard = undefined,
  context = undefined
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'archived') throw err(409, 'Archived assessments cannot be edited');

  const maxP = Number(assessment.template.settings?.maxPriorities || 2);
  const priorities =
    selectedPriorities === undefined
      ? assessment.selectedPriorities
      : [...new Set((selectedPriorities || []).map(String))].slice(0, maxP);

  await pool.execute(
    `UPDATE savage_blueprint_assessments
     SET selected_priorities_json = ?,
         commitment_plans_json = ?,
         weekly_checkins_json = ?,
         focus_board_json = ?,
         context_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(
        commitmentPlans === undefined ? assessment.commitmentPlans : commitmentPlans || []
      ),
      JSON.stringify(
        weeklyCheckins === undefined ? assessment.weeklyCheckins : weeklyCheckins || []
      ),
      JSON.stringify(focusBoard === undefined ? assessment.focusBoard : focusBoard || {}),
      JSON.stringify(
        context === undefined ? assessment.context : { ...assessment.context, ...context }
      ),
      Number(assessmentId)
    ]
  );
  return getAssessmentById(assessmentId);
}

/** The Savage Week — light weekly check-in stub (7 ratings). */
export async function addWeeklyCheckin({
  assessmentId,
  note = '',
  ratings = {},
  domainKeys = []
} = {}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  const cleanRatings = {};
  for (const [k, v] of Object.entries(ratings || {})) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 10) cleanRatings[String(k)] = n;
  }
  const entry = {
    at: new Date().toISOString(),
    note: String(note || '').slice(0, 2000),
    ratings: cleanRatings,
    domainKeys: (domainKeys || []).map(String).slice(0, 7)
  };
  const weeklyCheckins = [...(assessment.weeklyCheckins || []), entry].slice(-26);
  return updatePlans({ assessmentId, weeklyCheckins });
}

export async function completeAssessment({
  assessmentId,
  selectedPriorities = [],
  commitmentPlans = [],
  focusBoard = {}
} = {}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed') return assessment;

  const fatherhoodApplicable = assessment.context?.fatherhoodApplicable !== false;
  const domains = domainsForContext(assessment.template, {
    mode: assessment.mode,
    participantVersion: assessment.participantVersion,
    fatherhoodApplicable
  });
  const missing = domains.filter((d) => {
    const r = assessment.responses.find((x) => x.domainKey === d.key);
    return (
      !r ||
      (!r.preferNotToAnswer &&
        r.seasonStatus !== 'not-relevant' &&
        !r.isNotApplicable &&
        r.currentPerformanceScore == null)
    );
  });
  if (missing.length) {
    throw err(
      400,
      `All active domains need a score, Prefer not to answer, Not applicable, or Not Relevant. Missing: ${missing
        .map((d) => d.key)
        .join(', ')}`
    );
  }

  const maxP = Number(assessment.template.settings?.maxPriorities || 2);
  const priorities = [...new Set((selectedPriorities || []).map(String))]
    .filter((k) => domains.some((d) => d.key === k))
    .slice(0, maxP);

  const summary = buildSavageBlueprintSummary(assessment.template, assessment.responses, {
    mode: assessment.mode,
    participantVersion: assessment.participantVersion,
    fatherhoodApplicable,
    priorityKeys: priorities,
    context: assessment.context
  });

  await pool.execute(
    `UPDATE savage_blueprint_assessments
     SET status = 'completed',
         selected_priorities_json = ?,
         commitment_plans_json = ?,
         focus_board_json = ?,
         summary_json = ?,
         savage_score = ?,
         priority_weighted_score = ?,
         completed_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(commitmentPlans || assessment.commitmentPlans || []),
      JSON.stringify(focusBoard || assessment.focusBoard || {}),
      JSON.stringify(summary),
      summary.savageScore,
      summary.priorityWeightedScore,
      Number(assessmentId)
    ]
  );
  return getAssessmentById(assessmentId);
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
    `SELECT id, status, mode, participant_version, savage_score, completed_at, created_at
     FROM savage_blueprint_assessments
     WHERE ${clauses.join(' OR ')}
     ORDER BY id DESC
     LIMIT 50`,
    params
  );
  return rows || [];
}
