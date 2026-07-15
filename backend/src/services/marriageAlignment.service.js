import crypto from 'crypto';
import pool from '../config/database.js';
import {
  buildIndividualSummary,
  buildComparison,
  domainsForMode
} from './marriageAlignment.scoring.js';

export * from './marriageAlignment.scoring.js';

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
    alignmentSystem: d.alignment_system,
    weight: Number(d.weight || 0),
    color: d.color,
    icon: d.icon,
    displayOrder: Number(d.display_order || 0),
    isOptional: !!d.is_optional,
    isSensitive: !!d.is_sensitive,
    allowsNotRelevant: !!d.allows_not_relevant,
    availableVersions: parseJson(d.available_versions_json, []) || [],
    availableModes: parseJson(d.available_modes_json, ['full']) || ['full'],
    scoreLabels: parseJson(d.score_labels_json, {}) || {},
    reflectionOptions: parseJson(d.reflection_options_json, []) || [],
    conversationPrompts: parseJson(d.conversation_prompts_json, []) || [],
    actionSuggestions: parseJson(d.action_suggestions_json, []) || [],
    relatedAssessmentIds: parseJson(d.related_assessment_ids_json, []) || [],
    primaryQuestion: d.primary_question || '',
    desiredEmphasisQuestion: d.desired_emphasis_question || '',
    reflectionPrompt: d.reflection_prompt || ''
  };
}

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM marriage_alignment_templates
       WHERE agency_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM marriage_alignment_templates
       WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Marriage Alignment template not found');

  const [domains] = await pool.execute(
    `SELECT * FROM marriage_alignment_template_domains
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

async function loadPartnerResponses(partnerAssessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM marriage_alignment_domain_responses WHERE partner_assessment_id = ?`,
    [partnerAssessmentId]
  );
  return (rows || []).map((r) => ({
    domainKey: r.domain_key,
    currentAlignmentScore:
      r.current_alignment_score == null ? null : Number(r.current_alignment_score),
    desiredEmphasisScore:
      r.desired_emphasis_score == null ? null : Number(r.desired_emphasis_score),
    collaborationConfidenceScore:
      r.collaboration_confidence_score == null
        ? null
        : Number(r.collaboration_confidence_score),
    reflectionChips: parseJson(r.reflection_chips_json, []) || [],
    personalMeaning: r.personal_meaning || '',
    partnerExpectationGuess: r.partner_expectation_guess || '',
    privateNote: r.private_note || '',
    sharedNote: r.shared_note || '',
    noteVisibility: r.note_visibility || 'private',
    supportPreference: r.support_preference || 'none',
    isNotRelevant: !!r.is_not_relevant,
    preferNotToAnswer: !!r.prefer_not_to_answer
  }));
}

async function loadPartners(cycleId) {
  const [rows] = await pool.execute(
    `SELECT * FROM marriage_alignment_partner_assessments WHERE cycle_id = ? ORDER BY partner_role ASC`,
    [cycleId]
  );
  const partners = [];
  for (const row of rows || []) {
    partners.push({
      id: Number(row.id),
      partnerRole: row.partner_role,
      displayLabel:
        row.display_label || (row.partner_role === 'partner-a' ? 'Partner A' : 'Partner B'),
      accessToken: row.access_token,
      status: row.status,
      individualIndex: row.individual_index == null ? null : Number(row.individual_index),
      selectedPriorities: parseJson(row.selected_priorities_json, []) || [],
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      responses: await loadPartnerResponses(row.id)
    });
  }
  return partners;
}

function publicPartnerView(partner, { includeResponses = false, includeToken = false } = {}) {
  return {
    id: partner.id,
    partnerRole: partner.partnerRole,
    displayLabel: partner.displayLabel,
    status: partner.status,
    individualIndex: partner.status === 'submitted' ? partner.individualIndex : null,
    selectedPriorities: partner.status === 'submitted' ? partner.selectedPriorities : [],
    startedAt: partner.startedAt,
    submittedAt: partner.submittedAt,
    ...(includeToken ? { accessToken: partner.accessToken } : {}),
    ...(includeResponses ? { responses: partner.responses } : {})
  };
}

async function hydrateCycle(row, { viewerToken = null } = {}) {
  if (!row) return null;
  const template = await getDefaultTemplate({ agencyId: row.agency_id });
  const partners = await loadPartners(row.id);
  const partnerA = partners.find((p) => p.partnerRole === 'partner-a');
  const partnerB = partners.find((p) => p.partnerRole === 'partner-b');
  const bothSubmitted =
    partnerA?.status === 'submitted' && partnerB?.status === 'submitted';
  const sharedReleased =
    bothSubmitted &&
    (row.status === 'shared_results_released' ||
      row.status === 'priority_selection' ||
      row.status === 'planning' ||
      row.status === 'completed' ||
      !!row.shared_results_released_at);

  const mode = row.mode || 'full';
  const participantVersion = row.participant_version || 'general';

  let comparison = parseJson(row.comparison_json, null);
  if (sharedReleased && !comparison && partnerA && partnerB) {
    comparison = buildComparison(template, partnerA.responses, partnerB.responses, {
      mode,
      participantVersion
    });
  }

  const viewer = viewerToken
    ? partners.find((p) => p.accessToken === viewerToken)
    : null;

  return {
    id: Number(row.id),
    agencyId: row.agency_id == null ? null : Number(row.agency_id),
    templateId: Number(row.template_id),
    templateVersion: Number(row.template_version || 1),
    displayName: row.display_name || 'Marriage Alignment Assessment',
    mode,
    participantVersion,
    status: row.status,
    context: parseJson(row.context_json, {}) || {},
    bothSubmitted,
    sharedReleased,
    comparison: sharedReleased ? comparison : null,
    selectedPriorities: parseJson(row.selected_priorities_json, []) || [],
    alignmentPlans: parseJson(row.alignment_plans_json, []) || [],
    sharedResultsReleasedAt: row.shared_results_released_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    template,
    partnerA: publicPartnerView(partnerA, {
      includeResponses: sharedReleased || (viewer && viewer.partnerRole === 'partner-a'),
      includeToken: !!viewer && viewer.partnerRole === 'partner-a'
    }),
    partnerB: publicPartnerView(partnerB, {
      includeResponses: sharedReleased || (viewer && viewer.partnerRole === 'partner-b'),
      includeToken: !!viewer && viewer.partnerRole === 'partner-b'
    }),
    viewerRole: viewer?.partnerRole || null,
    viewer: viewer
      ? {
          ...publicPartnerView(viewer, { includeResponses: true, includeToken: true }),
          individualSummary: buildIndividualSummary(
            template,
            viewer.responses,
            mode,
            participantVersion
          )
        }
      : null,
    inviteTokens: null
  };
}

export async function getCycleById(id, { viewerToken = null } = {}) {
  const [rows] = await pool.execute(
    `SELECT * FROM marriage_alignment_cycles WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateCycle(rows?.[0] || null, { viewerToken });
}

export async function getCycleByPartnerToken(token) {
  const [partners] = await pool.execute(
    `SELECT * FROM marriage_alignment_partner_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  if (!partners?.[0]) return null;
  return getCycleById(partners[0].cycle_id, { viewerToken: partners[0].access_token });
}

const SAFE_MODES = [
  'full',
  'quick',
  'annual-review',
  'life-transition',
  'premarital',
  'targeted'
];

export async function createGuestCycle({
  mode = 'full',
  participantVersion = 'general',
  displayName = 'Marriage Alignment Assessment',
  partnerALabel = 'Partner A',
  partnerBLabel = 'Partner B',
  context = {}
} = {}) {
  const template = await getDefaultTemplate({});
  const safeMode = SAFE_MODES.includes(mode) ? mode : 'full';

  const [result] = await pool.execute(
    `INSERT INTO marriage_alignment_cycles
      (agency_id, template_id, template_version, display_name, mode, participant_version, status, context_json)
     VALUES (NULL, ?, ?, ?, ?, ?, 'invited', ?)`,
    [
      template.id,
      template.version,
      displayName,
      safeMode,
      participantVersion || 'general',
      JSON.stringify({ guest: true, ...context })
    ]
  );
  const cycleId = result.insertId;
  const tokenA = newAccessToken();
  const tokenB = newAccessToken();

  await pool.execute(
    `INSERT INTO marriage_alignment_partner_assessments
      (cycle_id, partner_role, display_label, access_token, status)
     VALUES (?, 'partner-a', ?, ?, 'not_started'), (?, 'partner-b', ?, ?, 'not_started')`,
    [cycleId, partnerALabel, tokenA, cycleId, partnerBLabel, tokenB]
  );

  const cycle = await getCycleById(cycleId);
  return {
    ...cycle,
    inviteTokens: { partnerA: tokenA, partnerB: tokenB }
  };
}

export async function upsertDomainResponse({
  token,
  domainKey,
  currentAlignmentScore = undefined,
  desiredEmphasisScore = undefined,
  collaborationConfidenceScore = undefined,
  reflectionChips = undefined,
  personalMeaning = undefined,
  partnerExpectationGuess = undefined,
  privateNote = undefined,
  sharedNote = undefined,
  noteVisibility = undefined,
  supportPreference = undefined,
  isNotRelevant = undefined,
  preferNotToAnswer = undefined
}) {
  const [partners] = await pool.execute(
    `SELECT * FROM marriage_alignment_partner_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  const partner = partners?.[0];
  if (!partner) throw err(404, 'Partner assessment not found');
  if (partner.status === 'submitted') throw err(409, 'Submitted assessments cannot be edited');

  const cycle = await getCycleById(partner.cycle_id, { viewerToken: token });
  const key = String(domainKey || '').trim();
  if (!cycle.template.domains.some((d) => d.key === key)) throw err(400, 'Unknown domain');

  const validateScore = (v, label) => {
    if (v === undefined || v === null) return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw err(400, `${label} must be 1–10`);
  };
  validateScore(currentAlignmentScore, 'Current alignment');
  validateScore(desiredEmphasisScore, 'Desired emphasis');
  validateScore(collaborationConfidenceScore, 'Collaboration confidence');

  const existing = (cycle.viewer?.responses || []).find((r) => r.domainKey === key);
  const nextCurrent =
    currentAlignmentScore === undefined
      ? existing?.currentAlignmentScore ?? null
      : currentAlignmentScore;
  const nextDesired =
    desiredEmphasisScore === undefined
      ? existing?.desiredEmphasisScore ?? null
      : desiredEmphasisScore;
  const nextConf =
    collaborationConfidenceScore === undefined
      ? existing?.collaborationConfidenceScore ?? null
      : collaborationConfidenceScore;
  const nextChips =
    reflectionChips === undefined
      ? existing?.reflectionChips || []
      : Array.isArray(reflectionChips)
        ? reflectionChips
        : [];
  const nextMeaning =
    personalMeaning === undefined
      ? existing?.personalMeaning || ''
      : String(personalMeaning || '');
  const nextGuess =
    partnerExpectationGuess === undefined
      ? existing?.partnerExpectationGuess || ''
      : String(partnerExpectationGuess || '');
  const nextPrivate =
    privateNote === undefined ? existing?.privateNote || '' : String(privateNote || '');
  const nextShared =
    sharedNote === undefined ? existing?.sharedNote || '' : String(sharedNote || '');
  const nextVis =
    noteVisibility === undefined
      ? existing?.noteVisibility || 'private'
      : String(noteVisibility || 'private');
  const nextSupport =
    supportPreference === undefined
      ? existing?.supportPreference || 'none'
      : String(supportPreference || 'none');
  const nextNR =
    isNotRelevant === undefined ? !!existing?.isNotRelevant : !!isNotRelevant;
  const nextPrefer =
    preferNotToAnswer === undefined ? !!existing?.preferNotToAnswer : !!preferNotToAnswer;

  const savedPrivate = nextVis === 'do-not-save' ? null : nextPrivate || null;
  const savedShared = nextVis === 'do-not-save' ? null : nextShared || null;

  await pool.execute(
    `INSERT INTO marriage_alignment_domain_responses
      (partner_assessment_id, domain_key, current_alignment_score, desired_emphasis_score,
       collaboration_confidence_score, reflection_chips_json, personal_meaning,
       partner_expectation_guess, private_note, shared_note, note_visibility,
       support_preference, is_not_relevant, prefer_not_to_answer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       current_alignment_score = VALUES(current_alignment_score),
       desired_emphasis_score = VALUES(desired_emphasis_score),
       collaboration_confidence_score = VALUES(collaboration_confidence_score),
       reflection_chips_json = VALUES(reflection_chips_json),
       personal_meaning = VALUES(personal_meaning),
       partner_expectation_guess = VALUES(partner_expectation_guess),
       private_note = VALUES(private_note),
       shared_note = VALUES(shared_note),
       note_visibility = VALUES(note_visibility),
       support_preference = VALUES(support_preference),
       is_not_relevant = VALUES(is_not_relevant),
       prefer_not_to_answer = VALUES(prefer_not_to_answer),
       updated_at = CURRENT_TIMESTAMP`,
    [
      partner.id,
      key,
      nextNR || nextPrefer ? null : nextCurrent,
      nextDesired,
      nextConf,
      JSON.stringify(nextChips),
      nextMeaning || null,
      nextGuess || null,
      savedPrivate,
      savedShared,
      nextVis,
      nextSupport,
      nextNR ? 1 : 0,
      nextPrefer ? 1 : 0
    ]
  );

  if (partner.status === 'not_started') {
    await pool.execute(
      `UPDATE marriage_alignment_partner_assessments
       SET status = 'in_progress', started_at = COALESCE(started_at, NOW()), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [partner.id]
    );
    await pool.execute(
      `UPDATE marriage_alignment_cycles
       SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [partner.cycle_id]
    );
  }

  return getCycleByPartnerToken(token);
}

export async function submitPartnerAssessment({ token }) {
  const cycle = await getCycleByPartnerToken(token);
  if (!cycle?.viewer) throw err(404, 'Partner assessment not found');
  if (cycle.viewer.status === 'submitted') return cycle;

  const domains = domainsForMode(
    cycle.template,
    cycle.mode,
    cycle.participantVersion
  );
  const byKey = Object.fromEntries((cycle.viewer.responses || []).map((r) => [r.domainKey, r]));
  const missing = domains.filter((d) => {
    const r = byKey[d.key];
    if (r?.isNotRelevant || r?.preferNotToAnswer) return false;
    return (
      !r ||
      r.currentAlignmentScore == null ||
      r.desiredEmphasisScore == null
    );
  });
  if (missing.length) {
    throw err(
      400,
      `All domains require Current Alignment and Desired Emphasis. Missing: ${missing
        .map((d) => d.key)
        .join(', ')}`
    );
  }

  const summary = buildIndividualSummary(
    cycle.template,
    cycle.viewer.responses,
    cycle.mode,
    cycle.participantVersion
  );
  await pool.execute(
    `UPDATE marriage_alignment_partner_assessments
     SET status = 'submitted',
         individual_index = ?,
         submitted_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE access_token = ?`,
    [summary.individualMarriageAlignmentIndex, token]
  );

  const refreshed = await getCycleByPartnerToken(token);
  const partners = await loadPartners(refreshed.id);
  const partnerA = partners.find((p) => p.partnerRole === 'partner-a');
  const partnerB = partners.find((p) => p.partnerRole === 'partner-b');
  const both = partnerA?.status === 'submitted' && partnerB?.status === 'submitted';

  if (both) {
    const comparison = buildComparison(
      refreshed.template,
      partnerA.responses,
      partnerB.responses,
      { mode: refreshed.mode, participantVersion: refreshed.participantVersion }
    );
    await pool.execute(
      `UPDATE marriage_alignment_cycles
       SET status = 'shared_results_released',
           comparison_json = ?,
           shared_results_released_at = NOW(),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(comparison), refreshed.id]
    );
  } else {
    await pool.execute(
      `UPDATE marriage_alignment_cycles
       SET status = 'waiting_for_partner', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [refreshed.id]
    );
  }

  return getCycleByPartnerToken(token);
}

export async function updatePartnerPriorities({ token, selectedPriorities = [] }) {
  const cycle = await getCycleByPartnerToken(token);
  if (!cycle?.viewer) throw err(404, 'Partner assessment not found');
  if (cycle.viewer.status !== 'submitted') {
    throw err(409, 'Submit your assessment before selecting priorities');
  }
  const priorities = Array.isArray(selectedPriorities) ? selectedPriorities.slice(0, 3) : [];
  await pool.execute(
    `UPDATE marriage_alignment_partner_assessments
     SET selected_priorities_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE access_token = ?`,
    [JSON.stringify(priorities), token]
  );
  return getCycleByPartnerToken(token);
}

export async function updateSharedPlans({
  token,
  selectedPriorities = undefined,
  alignmentPlans = undefined
}) {
  const cycle = await getCycleByPartnerToken(token);
  if (!cycle?.viewer) throw err(404, 'Partner assessment not found');
  if (!cycle.sharedReleased) throw err(409, 'Shared results are not available yet');

  const priorities =
    selectedPriorities === undefined
      ? cycle.selectedPriorities
      : Array.isArray(selectedPriorities)
        ? selectedPriorities.slice(0, 3)
        : [];
  const plans =
    alignmentPlans === undefined
      ? cycle.alignmentPlans
      : Array.isArray(alignmentPlans)
        ? alignmentPlans
        : [];

  await pool.execute(
    `UPDATE marriage_alignment_cycles
     SET selected_priorities_json = ?,
         alignment_plans_json = ?,
         status = 'planning',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [JSON.stringify(priorities), JSON.stringify(plans), cycle.id]
  );
  return getCycleByPartnerToken(token);
}
