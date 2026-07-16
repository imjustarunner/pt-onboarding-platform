import crypto from 'crypto';
import pool from '../config/database.js';
import {
  buildRewardRegulationSummary,
  domainsForContext,
  calculateRewardRegulationScore,
  calculateImportanceWeightedScore,
  calculateChannelImpactIndex,
  rewardRegulationScoreLabel,
  domainStatusLabel
} from './rewardRegulation.scoring.js';

export {
  buildRewardRegulationSummary,
  domainsForContext,
  calculateRewardRegulationScore,
  calculateImportanceWeightedScore,
  calculateChannelImpactIndex,
  rewardRegulationScoreLabel,
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
    regulationSystem: d.regulation_system,
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

function mapChannel(c) {
  return {
    id: Number(c.id),
    key: c.channel_key,
    label: c.label,
    shortLabel: c.short_label,
    description: c.description,
    category: c.category,
    isSensitive: !!c.is_sensitive,
    isOptional: !!c.is_optional,
    isActive: !!c.is_active,
    displayOrder: Number(c.display_order || 0),
    color: c.color,
    supportRouting: parseJson(c.support_routing_json, []) || []
  };
}

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM reward_regulation_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM reward_regulation_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Reward Regulation template not found');

  const [domains] = await pool.execute(
    `SELECT * FROM reward_regulation_template_domains
     WHERE template_id = ? AND is_active = 1
     ORDER BY display_order ASC, id ASC`,
    [template.id]
  );
  const [channels] = await pool.execute(
    `SELECT * FROM reward_regulation_template_channels
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
    domains: (domains || []).map(mapDomain),
    channels: (channels || []).map(mapChannel)
  };
}

async function loadResponses(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM reward_regulation_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    domainKey: r.domain_key,
    currentRegulationScore:
      r.current_regulation_score == null ? null : Number(r.current_regulation_score),
    personalImportanceScore:
      r.personal_importance_score == null ? null : Number(r.personal_importance_score),
    momentumScore: r.momentum_score == null ? null : Number(r.momentum_score),
    reflectionChips: parseJson(r.reflection_chips_json, []) || [],
    barriers: parseJson(r.barriers_json, []) || [],
    strengths: parseJson(r.strengths_json, []) || [],
    supportPreference: r.support_preference || 'none',
    privateReflection: r.private_reflection || '',
    noteVisibility: r.note_visibility || 'private',
    seasonStatus: r.season_status || 'active',
    preferNotToAnswer: !!r.prefer_not_to_answer
  }));
}

async function loadChannelResponses(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM reward_regulation_channel_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    channelKey: r.channel_key,
    isRelevant: !!r.is_relevant,
    pullStrengthScore: r.pull_strength_score == null ? null : Number(r.pull_strength_score),
    frequencyScore: r.frequency_score == null ? null : Number(r.frequency_score),
    costScore: r.cost_score == null ? null : Number(r.cost_score),
    valueScore: r.value_score == null ? null : Number(r.value_score),
    controlScore: r.control_score == null ? null : Number(r.control_score),
    isPrivate: r.is_private == null ? true : !!r.is_private,
    notes: r.notes || '',
    supportPreference: r.support_preference || 'none',
    preferNotToAnswer: !!r.prefer_not_to_answer
  }));
}

async function hydrateAssessment(row) {
  if (!row) return null;
  let template = await getDefaultTemplate({ agencyId: row.agency_id });
  if (Number(row.template_id) !== Number(template.id)) {
    const [trows] = await pool.execute(
      `SELECT * FROM reward_regulation_templates WHERE id = ? LIMIT 1`,
      [row.template_id]
    );
    if (trows?.[0]) {
      const [domains] = await pool.execute(
        `SELECT * FROM reward_regulation_template_domains
         WHERE template_id = ? AND is_active = 1
         ORDER BY display_order ASC, id ASC`,
        [trows[0].id]
      );
      const [channels] = await pool.execute(
        `SELECT * FROM reward_regulation_template_channels
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
        domains: (domains || []).map(mapDomain),
        channels: (channels || []).map(mapChannel)
      };
    }
  }

  const responses = await loadResponses(row.id);
  const channelResponses = await loadChannelResponses(row.id);
  const mode = row.mode || 'full';
  const participantVersion = row.participant_version || 'general-adult';
  const context = parseJson(row.context_json, {}) || {};
  const priorityKeys = parseJson(row.selected_priorities_json, []) || [];

  const channelLookup = Object.fromEntries((template.channels || []).map((c) => [c.key, c]));
  const channelsForSummary = channelResponses.map((cr) => ({
    ...cr,
    label: channelLookup[cr.channelKey]?.label || cr.channelKey,
    shortLabel: channelLookup[cr.channelKey]?.shortLabel,
    color: channelLookup[cr.channelKey]?.color,
    isSensitive: !!channelLookup[cr.channelKey]?.isSensitive,
    category: channelLookup[cr.channelKey]?.category
  }));

  const summary =
    parseJson(row.summary_json, null) ||
    buildRewardRegulationSummary(template, responses, {
      mode,
      participantVersion,
      priorityKeys,
      context,
      channels: channelsForSummary
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
    channelResponses,
    summary,
    rewardRegulationScore:
      row.reward_regulation_score == null
        ? summary.rewardRegulationScore
        : Number(row.reward_regulation_score),
    priorityWeightedScore:
      row.priority_weighted_score == null
        ? summary.priorityWeightedScore
        : Number(row.priority_weighted_score),
    channelImpactIndex:
      row.channel_impact_index == null
        ? summary.channelImpactIndex
        : Number(row.channel_impact_index),
    selectedPriorities: priorityKeys,
    regulationPlans: parseJson(row.regulation_plans_json, []) || [],
    frictionBoard: parseJson(row.friction_board_json, {}) || {},
    weeklyCheckins: parseJson(row.weekly_checkins_json, []) || [],
    selectedChannels: parseJson(row.selected_channels_json, []) || [],
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
    `SELECT * FROM reward_regulation_assessments WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function getAssessmentByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM reward_regulation_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  return hydrateAssessment(rows?.[0] || null);
}

const SAFE_MODES = ['full', 'quick', 'targeted', 'weekly'];

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
    `INSERT INTO reward_regulation_assessments
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
      JSON.stringify({ guest: !participantUserId, ...context })
    ]
  );
  return getAssessmentById(result.insertId);
}

export async function upsertDomainResponse({
  assessmentId,
  domainKey,
  currentRegulationScore = undefined,
  personalImportanceScore = undefined,
  momentumScore = undefined,
  reflectionChips = undefined,
  barriers = undefined,
  strengths = undefined,
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
  validateScore(currentRegulationScore, 'Current regulation');
  validateScore(personalImportanceScore, 'Personal importance');
  validateScore(momentumScore, 'Momentum');

  const existing = assessment.responses.find((r) => r.domainKey === key);
  const nextRegulation =
    currentRegulationScore === undefined
      ? existing?.currentRegulationScore ?? null
      : currentRegulationScore;
  const nextImportance =
    personalImportanceScore === undefined
      ? existing?.personalImportanceScore ?? null
      : personalImportanceScore;
  const nextMomentum =
    momentumScore === undefined ? existing?.momentumScore ?? null : momentumScore;
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
    strengths === undefined
      ? existing?.strengths || []
      : Array.isArray(strengths)
        ? strengths
        : [];
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
  const clearScore = nextPrefer || nextSeason === 'not-relevant';

  await pool.execute(
    `INSERT INTO reward_regulation_responses
      (assessment_id, domain_key, current_regulation_score, personal_importance_score,
       momentum_score, reflection_chips_json, barriers_json, strengths_json,
       support_preference, private_reflection, note_visibility, season_status, prefer_not_to_answer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       current_regulation_score = VALUES(current_regulation_score),
       personal_importance_score = VALUES(personal_importance_score),
       momentum_score = VALUES(momentum_score),
       reflection_chips_json = VALUES(reflection_chips_json),
       barriers_json = VALUES(barriers_json),
       strengths_json = VALUES(strengths_json),
       support_preference = VALUES(support_preference),
       private_reflection = VALUES(private_reflection),
       note_visibility = VALUES(note_visibility),
       season_status = VALUES(season_status),
       prefer_not_to_answer = VALUES(prefer_not_to_answer),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      clearScore ? null : nextRegulation,
      nextImportance,
      nextMomentum,
      JSON.stringify(nextChips),
      JSON.stringify(nextBarriers),
      JSON.stringify(nextStrengths),
      nextPref,
      savedNote,
      nextVisibility,
      nextSeason,
      nextPrefer ? 1 : 0
    ]
  );

  return getAssessmentById(assessmentId);
}

export async function upsertChannelResponse({
  assessmentId,
  channelKey,
  isRelevant = undefined,
  pullStrengthScore = undefined,
  frequencyScore = undefined,
  costScore = undefined,
  valueScore = undefined,
  controlScore = undefined,
  isPrivate = undefined,
  notes = undefined,
  supportPreference = undefined,
  preferNotToAnswer = undefined
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    throw err(409, 'Completed assessments cannot be edited');
  }

  const key = String(channelKey || '').trim();
  const channelDef = assessment.template.channels.find((c) => c.key === key);
  if (!channelDef) throw err(400, 'Unknown channel');

  const validateScore = (n, label) => {
    if (n === undefined || n === null) return;
    const v = Number(n);
    if (!Number.isInteger(v) || v < 1 || v > 10) throw err(400, `${label} must be 1–10`);
  };
  validateScore(pullStrengthScore, 'Pull strength');
  validateScore(frequencyScore, 'Frequency');
  validateScore(costScore, 'Cost');
  validateScore(valueScore, 'Value');
  validateScore(controlScore, 'Control');

  const existing = assessment.channelResponses.find((r) => r.channelKey === key);
  const nextRelevant =
    isRelevant === undefined ? (existing?.isRelevant ?? true) : !!isRelevant;
  const nextPull =
    pullStrengthScore === undefined ? existing?.pullStrengthScore ?? null : pullStrengthScore;
  const nextFreq =
    frequencyScore === undefined ? existing?.frequencyScore ?? null : frequencyScore;
  const nextCost = costScore === undefined ? existing?.costScore ?? null : costScore;
  const nextValue = valueScore === undefined ? existing?.valueScore ?? null : valueScore;
  const nextControl =
    controlScore === undefined ? existing?.controlScore ?? null : controlScore;
  const nextPrivate =
    isPrivate === undefined
      ? existing?.isPrivate ?? !!channelDef.isSensitive
      : !!isPrivate;
  const nextNotes = notes === undefined ? existing?.notes || '' : String(notes || '');
  const nextPref =
    supportPreference === undefined
      ? existing?.supportPreference || 'none'
      : String(supportPreference);
  const nextPrefer =
    preferNotToAnswer === undefined ? !!existing?.preferNotToAnswer : !!preferNotToAnswer;

  await pool.execute(
    `INSERT INTO reward_regulation_channel_responses
      (assessment_id, channel_key, is_relevant, pull_strength_score, frequency_score,
       cost_score, value_score, control_score, is_private, notes, support_preference, prefer_not_to_answer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       is_relevant = VALUES(is_relevant),
       pull_strength_score = VALUES(pull_strength_score),
       frequency_score = VALUES(frequency_score),
       cost_score = VALUES(cost_score),
       value_score = VALUES(value_score),
       control_score = VALUES(control_score),
       is_private = VALUES(is_private),
       notes = VALUES(notes),
       support_preference = VALUES(support_preference),
       prefer_not_to_answer = VALUES(prefer_not_to_answer),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      nextRelevant ? 1 : 0,
      nextPrefer || !nextRelevant ? null : nextPull,
      nextPrefer || !nextRelevant ? null : nextFreq,
      nextPrefer || !nextRelevant ? null : nextCost,
      nextPrefer || !nextRelevant ? null : nextValue,
      nextPrefer || !nextRelevant ? null : nextControl,
      nextPrivate ? 1 : 0,
      nextNotes || null,
      nextPref,
      nextPrefer ? 1 : 0
    ]
  );

  return getAssessmentById(assessmentId);
}

export async function updatePlans({
  assessmentId,
  selectedPriorities = undefined,
  regulationPlans = undefined,
  weeklyCheckins = undefined,
  frictionBoard = undefined,
  selectedChannels = undefined,
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

  await pool.execute(
    `UPDATE reward_regulation_assessments
     SET selected_priorities_json = ?,
         regulation_plans_json = ?,
         weekly_checkins_json = ?,
         friction_board_json = ?,
         selected_channels_json = ?,
         context_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(
        regulationPlans === undefined ? assessment.regulationPlans : regulationPlans || []
      ),
      JSON.stringify(
        weeklyCheckins === undefined ? assessment.weeklyCheckins : weeklyCheckins || []
      ),
      JSON.stringify(
        frictionBoard === undefined ? assessment.frictionBoard : frictionBoard || {}
      ),
      JSON.stringify(
        selectedChannels === undefined ? assessment.selectedChannels : selectedChannels || []
      ),
      JSON.stringify(
        context === undefined ? assessment.context : { ...assessment.context, ...context }
      ),
      Number(assessmentId)
    ]
  );
  return getAssessmentById(assessmentId);
}

/** Regulation Week — light weekly check-in stub. */
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
  regulationPlans = [],
  frictionBoard = {}
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
        r.currentRegulationScore == null)
    );
  });
  if (missing.length) {
    throw err(
      400,
      `All active domains need a score, Prefer not to answer, or Not Relevant. Missing: ${missing
        .map((d) => d.key)
        .join(', ')}`
    );
  }

  const maxP = Number(assessment.template.settings?.maxPriorities || 3);
  const priorities = [...new Set((selectedPriorities || []).map(String))]
    .filter((k) => domains.some((d) => d.key === k))
    .slice(0, maxP);

  const channelLookup = Object.fromEntries(
    (assessment.template.channels || []).map((c) => [c.key, c])
  );
  const channelsForSummary = (assessment.channelResponses || []).map((cr) => ({
    ...cr,
    label: channelLookup[cr.channelKey]?.label || cr.channelKey,
    shortLabel: channelLookup[cr.channelKey]?.shortLabel,
    color: channelLookup[cr.channelKey]?.color,
    isSensitive: !!channelLookup[cr.channelKey]?.isSensitive,
    category: channelLookup[cr.channelKey]?.category
  }));

  const summary = buildRewardRegulationSummary(assessment.template, assessment.responses, {
    mode: assessment.mode,
    participantVersion: assessment.participantVersion,
    priorityKeys: priorities,
    context: assessment.context,
    channels: channelsForSummary
  });

  await pool.execute(
    `UPDATE reward_regulation_assessments
     SET status = 'completed',
         selected_priorities_json = ?,
         regulation_plans_json = ?,
         friction_board_json = ?,
         summary_json = ?,
         reward_regulation_score = ?,
         priority_weighted_score = ?,
         channel_impact_index = ?,
         completed_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      JSON.stringify(priorities),
      JSON.stringify(regulationPlans || assessment.regulationPlans || []),
      JSON.stringify(frictionBoard || assessment.frictionBoard || {}),
      JSON.stringify(summary),
      summary.rewardRegulationScore,
      summary.priorityWeightedScore,
      summary.channelImpactIndex,
      Number(assessmentId)
    ]
  );
  const __completed = await getAssessmentById(assessmentId);
  /* assessment-deliverables-hub-hook */
  try {
    const { scheduleDeliverableGeneration } = await import('./assessmentDeliverable.service.js');
    scheduleDeliverableGeneration({ family: 'reward_regulation', assessment: __completed });
  } catch (e) {
    console.warn('[reward_regulation] deliverable hook failed', e?.message || e);
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
    `SELECT id, status, mode, participant_version, reward_regulation_score, channel_impact_index, completed_at, created_at
     FROM reward_regulation_assessments
     WHERE ${clauses.join(' OR ')}
     ORDER BY id DESC
     LIMIT 50`,
    params
  );
  return rows || [];
}
