import crypto from 'crypto';
import pool from '../config/database.js';
import {
  buildFamilyFunctioningSummary,
  domainsForContext,
  calculateFamilyFunctioningIndex,
  calculateImportanceWeightedFamilyIndex,
  calculateFamilyOpportunityScore,
  familyFunctioningIndexLabel,
  domainStatusLabel
} from './familyFunctioning.scoring.js';

export {
  buildFamilyFunctioningSummary,
  buildFamilyFunctioningSummary as buildSummary,
  domainsForContext,
  calculateFamilyFunctioningIndex,
  calculateImportanceWeightedFamilyIndex,
  calculateFamilyOpportunityScore,
  familyFunctioningIndexLabel,
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
    familySystem: d.family_system,
    weight: Number(d.weight || 0),
    color: d.color,
    icon: d.icon,
    displayOrder: Number(d.display_order || 0),
    isOptional: !!d.is_optional,
    isSensitive: !!d.is_sensitive,
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
      `SELECT * FROM family_functioning_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM family_functioning_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Family Functioning template not found');

  const [domains] = await pool.execute(
    `SELECT * FROM family_functioning_template_domains
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
    `SELECT * FROM family_functioning_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    domainKey: r.domain_key,
    currentFunctioningScore:
      r.current_functioning_score == null ? null : Number(r.current_functioning_score),
    personalImportanceScore:
      r.personal_importance_score == null ? null : Number(r.personal_importance_score),
    supportNeedScore: r.support_need_score == null ? null : Number(r.support_need_score),
    reflectionChips: parseJson(r.reflection_chips_json, []) || [],
    currentSupports: parseJson(r.current_supports_json, []) || [],
    barriers: parseJson(r.barriers_json, []) || [],
    personalStrengths: parseJson(r.personal_strengths_json, []) || [],
    personalDefinition: r.personal_definition || '',
    supportPreference: r.support_preference || 'none',
    privateReflection: r.private_reflection || '',
    noteVisibility: r.note_visibility || 'private',
    seasonStatus: r.season_status || 'active',
    preferNotToAnswer: !!r.prefer_not_to_answer
  }));
}

async function hydrateAssessment(row) {
  if (!row) return null;
  let template = await getDefaultTemplate({ agencyId: row.agency_id });
  if (Number(row.template_id) !== Number(template.id)) {
    const [trows] = await pool.execute(
      `SELECT * FROM family_functioning_templates WHERE id = ? LIMIT 1`,
      [row.template_id]
    );
    if (trows?.[0]) {
      const [domains] = await pool.execute(
        `SELECT * FROM family_functioning_template_domains
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
  const participantVersion = row.participant_version || 'general-household';
  const context = parseJson(row.context_json, {}) || {};
  const priorityKeys = parseJson(row.selected_priorities_json, []) || [];
  const summary =
    parseJson(row.summary_json, null) ||
    buildFamilyFunctioningSummary(template, responses, {
      mode,
      participantVersion,
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
    companionAssessmentId:
      row.companion_assessment_id == null ? null : Number(row.companion_assessment_id),
    cycleId: row.cycle_id || null,
    mode,
    participantVersion,
    status: row.status,
    accessToken: row.access_token,
    context,
    responses,
    summary,
    familyFunctioningIndex:
      row.family_functioning_index == null
        ? summary.familyFunctioningIndex
        : Number(row.family_functioning_index),
    importanceWeightedIndex:
      row.importance_weighted_index == null
        ? summary.importanceWeightedIndex
        : Number(row.importance_weighted_index),
    selectedPriorities: priorityKeys,
    supportPlans: parseJson(row.support_plans_json, []) || [],
    weeklyCommitments: parseJson(row.weekly_commitments_json, []) || [],
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
    `SELECT * FROM family_functioning_assessments WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function getAssessmentByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM family_functioning_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  return hydrateAssessment(rows?.[0] || null);
}

const SAFE_MODES = ['full', 'quick', 'seasonal-review', 'transition', 'targeted'];

export async function createAssessment({
  agencyId = null,
  participantUserId = null,
  clientId = null,
  coachUserId = null,
  counselorUserId = null,
  mode = 'full',
  participantVersion = 'general-household',
  context = {},
  cycleId = null
} = {}) {
  const template = await getDefaultTemplate({ agencyId });
  const accessToken = newAccessToken();
  const safeMode = SAFE_MODES.includes(mode) ? mode : 'full';

  const [result] = await pool.execute(
    `INSERT INTO family_functioning_assessments
      (agency_id, template_id, template_version, participant_user_id, client_id,
       coach_user_id, counselor_user_id, cycle_id, mode, participant_version, status,
       access_token, context_json, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, NOW())`,
    [
      agencyId ? Number(agencyId) : null,
      template.id,
      template.version,
      participantUserId ? Number(participantUserId) : null,
      clientId ? Number(clientId) : null,
      coachUserId || null,
      counselorUserId || null,
      cycleId || null,
      safeMode,
      participantVersion || 'general-household',
      accessToken,
      JSON.stringify({ guest: !participantUserId, ...context })
    ]
  );
  return getAssessmentById(result.insertId);
}

export async function upsertDomainResponse({
  assessmentId,
  domainKey,
  currentFunctioningScore = undefined,
  personalImportanceScore = undefined,
  supportNeedScore = undefined,
  reflectionChips = undefined,
  currentSupports = undefined,
  barriers = undefined,
  personalStrengths = undefined,
  personalDefinition = undefined,
  supportPreference = undefined,
  privateReflection = undefined,
  noteVisibility = undefined,
  seasonStatus = undefined,
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
  validateScore(currentFunctioningScore, 'Current functioning');
  validateScore(personalImportanceScore, 'Personal importance');
  validateScore(supportNeedScore, 'Support need');

  const existing = assessment.responses.find((r) => r.domainKey === key);
  const nextFunctioning =
    currentFunctioningScore === undefined
      ? existing?.currentFunctioningScore ?? null
      : currentFunctioningScore;
  const nextImportance =
    personalImportanceScore === undefined
      ? existing?.personalImportanceScore ?? null
      : personalImportanceScore;
  const nextSupportNeed =
    supportNeedScore === undefined ? existing?.supportNeedScore ?? null : supportNeedScore;
  const nextChips =
    reflectionChips === undefined
      ? existing?.reflectionChips || []
      : Array.isArray(reflectionChips)
        ? reflectionChips
        : [];
  const nextSupports =
    currentSupports === undefined
      ? existing?.currentSupports || []
      : Array.isArray(currentSupports)
        ? currentSupports
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

  const savedNote = nextVisibility === 'do-not-save' ? null : nextNote || null;

  await pool.execute(
    `INSERT INTO family_functioning_responses
      (assessment_id, domain_key, current_functioning_score, personal_importance_score,
       support_need_score, reflection_chips_json, current_supports_json,
       barriers_json, personal_strengths_json, personal_definition, support_preference,
       private_reflection, note_visibility, season_status, prefer_not_to_answer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       current_functioning_score = VALUES(current_functioning_score),
       personal_importance_score = VALUES(personal_importance_score),
       support_need_score = VALUES(support_need_score),
       reflection_chips_json = VALUES(reflection_chips_json),
       current_supports_json = VALUES(current_supports_json),
       barriers_json = VALUES(barriers_json),
       personal_strengths_json = VALUES(personal_strengths_json),
       personal_definition = VALUES(personal_definition),
       support_preference = VALUES(support_preference),
       private_reflection = VALUES(private_reflection),
       note_visibility = VALUES(note_visibility),
       season_status = VALUES(season_status),
       prefer_not_to_answer = VALUES(prefer_not_to_answer),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      nextPrefer || nextSeason === 'not-relevant' ? null : nextFunctioning,
      nextImportance,
      nextSupportNeed,
      JSON.stringify(nextChips),
      JSON.stringify(nextSupports),
      JSON.stringify(nextBarriers),
      JSON.stringify(nextStrengths),
      nextDefinition || null,
      nextPref,
      savedNote,
      nextVisibility,
      nextSeason,
      nextPrefer ? 1 : 0
    ]
  );

  const supportTriggers = [
    'strategy',
    'guided-reflection',
    'accountability',
    'coach',
    'counselor',
    'family-group',
    'practical-help',
    'private-follow-up',
    'support-today'
  ];
  if (supportTriggers.includes(nextPref)) {
    const urgency = nextPref === 'support-today' ? 'today' : 'routine';
    const visibility =
      nextPref === 'support-today' ? 'restricted' : 'participant-and-recipient';
    await pool.execute(
      `INSERT INTO family_functioning_support_requests
        (assessment_id, domain_key, requested_support, urgency, message_visibility, status)
       VALUES (?, ?, ?, ?, ?, 'submitted')`,
      [Number(assessmentId), key, nextPref, urgency, visibility]
    );
  }

  return getAssessmentById(assessmentId);
}

export async function updatePlans({
  assessmentId,
  selectedPriorities = undefined,
  supportPlans = undefined,
  developmentPlans = undefined,
  weeklyCommitments = undefined,
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
    supportPlans !== undefined
      ? supportPlans || []
      : developmentPlans !== undefined
        ? developmentPlans || []
        : assessment.supportPlans;

  await pool.execute(
    `UPDATE family_functioning_assessments
     SET selected_priorities_json = ?,
         support_plans_json = ?,
         weekly_commitments_json = ?,
         context_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(plans),
      JSON.stringify(
        weeklyCommitments === undefined
          ? assessment.weeklyCommitments
          : weeklyCommitments || []
      ),
      JSON.stringify(
        context === undefined ? assessment.context : { ...assessment.context, ...context }
      ),
      Number(assessmentId)
    ]
  );
  return getAssessmentById(assessmentId);
}

export async function completeAssessment({
  assessmentId,
  selectedPriorities = [],
  supportPlans = [],
  developmentPlans = []
} = {}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed') return assessment;

  const domains = domainsForContext(assessment.template, {
    mode: assessment.mode,
    participantVersion: assessment.participantVersion
  });
  const missing = domains.filter((d) => {
    const r = assessment.responses.find((x) => x.domainKey === d.key);
    return (
      !r ||
      (!r.preferNotToAnswer &&
        r.seasonStatus !== 'not-relevant' &&
        r.currentFunctioningScore == null)
    );
  });
  if (missing.length) {
    throw err(
      400,
      `All domains need a score, Prefer not to answer, or Not Relevant. Missing: ${missing
        .map((d) => d.key)
        .join(', ')}`
    );
  }

  const maxP = Number(assessment.template.settings?.maxPriorities || 3);
  const priorities = [...new Set((selectedPriorities || []).map(String))]
    .filter((k) => domains.some((d) => d.key === k))
    .slice(0, maxP);

  const summary = buildFamilyFunctioningSummary(assessment.template, assessment.responses, {
    mode: assessment.mode,
    participantVersion: assessment.participantVersion,
    priorityKeys: priorities
  });

  const plans = supportPlans?.length
    ? supportPlans
    : developmentPlans?.length
      ? developmentPlans
      : assessment.supportPlans || [];

  await pool.execute(
    `UPDATE family_functioning_assessments
     SET status = 'completed',
         selected_priorities_json = ?,
         support_plans_json = ?,
         summary_json = ?,
         family_functioning_index = ?,
         importance_weighted_index = ?,
         completed_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(plans),
      JSON.stringify(summary),
      summary.familyFunctioningIndex,
      summary.importanceWeightedIndex,
      Number(assessmentId)
    ]
  );
  const __completed = await getAssessmentById(assessmentId);
  /* assessment-deliverables-hub-hook */
  try {
    const { scheduleDeliverableGeneration } = await import('./assessmentDeliverable.service.js');
    scheduleDeliverableGeneration({ family: 'family_functioning', assessment: __completed });
  } catch (e) {
    console.warn('[family_functioning] deliverable hook failed', e?.message || e);
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
    `SELECT id, status, mode, participant_version, family_functioning_index, completed_at, created_at
     FROM family_functioning_assessments
     WHERE ${clauses.join(' OR ')}
     ORDER BY id DESC
     LIMIT 50`,
    params
  );
  return rows || [];
}
