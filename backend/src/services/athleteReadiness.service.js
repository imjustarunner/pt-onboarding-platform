import crypto from 'crypto';
import pool from '../config/database.js';
import {
  calculateAthleteReadinessScore,
  readinessStatusLabel,
  dailyRecommendation,
  buildSummary
} from './athleteReadiness.scoring.js';

export {
  calculateAthleteReadinessScore,
  readinessStatusLabel,
  dailyRecommendation,
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
    readinessLayer: d.readiness_layer,
    weight: Number(d.weight || 0),
    color: d.color,
    icon: d.icon,
    displayOrder: Number(d.display_order || 0),
    isOptional: !!d.is_optional,
    availableModes: parseJson(d.available_modes_json, ['daily']) || ['daily'],
    scoreLabels: parseJson(d.score_labels_json, {}) || {},
    reflectionOptions: parseJson(d.reflection_options_json, []) || [],
    bodyAreas: parseJson(d.body_areas_json, []) || []
  };
}

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM athlete_readiness_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM athlete_readiness_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Athlete Readiness template not found');

  const [domains] = await pool.execute(
    `SELECT * FROM athlete_readiness_template_domains
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
    `SELECT * FROM athlete_readiness_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    domainKey: r.domain_key,
    score: r.score == null ? null : Number(r.score),
    reflectionChips: parseJson(r.reflection_chips_json, []) || [],
    bodyAreas: parseJson(r.body_areas_json, []) || [],
    supportPreference: r.support_preference || 'none',
    note: r.note || '',
    noteVisibility: r.note_visibility || 'coaching_staff'
  }));
}

async function loadSupportRequests(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM athlete_readiness_support_requests WHERE assessment_id = ? ORDER BY id ASC`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    domainKey: r.domain_key,
    requestedContact: r.requested_contact,
    urgency: r.urgency,
    message: r.message || '',
    status: r.status
  }));
}

async function hydrateAssessment(row) {
  if (!row) return null;
  let template = await getDefaultTemplate({ agencyId: row.agency_id });
  if (Number(row.template_id) !== Number(template.id)) {
    const [trows] = await pool.execute(
      `SELECT * FROM athlete_readiness_templates WHERE id = ? LIMIT 1`,
      [row.template_id]
    );
    if (trows?.[0]) {
      const [domains] = await pool.execute(
        `SELECT * FROM athlete_readiness_template_domains
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
  const mode = row.mode || 'daily';
  const summary = parseJson(row.summary_json, null) || buildSummary(template, responses, mode);

  return {
    id: Number(row.id),
    agencyId: row.agency_id == null ? null : Number(row.agency_id),
    templateId: Number(row.template_id),
    templateVersion: Number(row.template_version || 1),
    athleteUserId: row.athlete_user_id == null ? null : Number(row.athlete_user_id),
    clientId: row.client_id == null ? null : Number(row.client_id),
    mode,
    status: row.status,
    accessToken: row.access_token,
    context: parseJson(row.context_json, {}) || {},
    responses,
    supportRequests,
    summary,
    readinessScore: row.readiness_score == null ? summary.readinessScore : Number(row.readiness_score),
    coachReviewStatus: row.coach_review_status || null,
    coachReviewNote: row.coach_review_note || '',
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
    `SELECT * FROM athlete_readiness_assessments WHERE id = ? LIMIT 1`,
    [Number(id)]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function getAssessmentByToken(token) {
  const [rows] = await pool.execute(
    `SELECT * FROM athlete_readiness_assessments WHERE access_token = ? LIMIT 1`,
    [String(token || '')]
  );
  return hydrateAssessment(rows?.[0] || null);
}

export async function createAssessment({
  agencyId = null,
  athleteUserId = null,
  clientId = null,
  coachUserId = null,
  mode = 'daily',
  context = {}
} = {}) {
  const template = await getDefaultTemplate({ agencyId });
  const accessToken = newAccessToken();
  const safeMode = ['daily', 'competition', 'weekly', 'return-to-performance'].includes(mode)
    ? mode
    : 'daily';
  const [result] = await pool.execute(
    `INSERT INTO athlete_readiness_assessments
      (agency_id, template_id, template_version, athlete_user_id, client_id, coach_user_id,
       mode, status, access_token, context_json, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, NOW())`,
    [
      agencyId ? Number(agencyId) : null,
      template.id,
      template.version,
      athleteUserId ? Number(athleteUserId) : null,
      clientId ? Number(clientId) : null,
      coachUserId || null,
      safeMode,
      accessToken,
      JSON.stringify(context || {})
    ]
  );
  return getAssessmentById(result.insertId);
}

export async function upsertDomainResponse({
  assessmentId,
  domainKey,
  score = undefined,
  reflectionChips = undefined,
  bodyAreas = undefined,
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

  if (score !== undefined && score !== null) {
    const n = Number(score);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw err(400, 'Score must be 1–10');
  }

  const existing = assessment.responses.find((r) => r.domainKey === key);
  const nextScore = score === undefined ? existing?.score ?? null : score;
  const nextChips =
    reflectionChips === undefined
      ? existing?.reflectionChips || []
      : Array.isArray(reflectionChips)
        ? reflectionChips
        : [];
  const nextBody =
    bodyAreas === undefined
      ? existing?.bodyAreas || []
      : Array.isArray(bodyAreas)
        ? bodyAreas
        : [];
  const nextSupport =
    supportPreference === undefined
      ? existing?.supportPreference || 'none'
      : String(supportPreference || 'none');
  const nextNote = note === undefined ? existing?.note || '' : String(note || '');
  const nextVis =
    noteVisibility === undefined
      ? existing?.noteVisibility || 'coaching_staff'
      : String(noteVisibility || 'coaching_staff');

  await pool.execute(
    `INSERT INTO athlete_readiness_responses
      (assessment_id, domain_key, score, reflection_chips_json, body_areas_json, support_preference, note, note_visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       score = VALUES(score),
       reflection_chips_json = VALUES(reflection_chips_json),
       body_areas_json = VALUES(body_areas_json),
       support_preference = VALUES(support_preference),
       note = VALUES(note),
       note_visibility = VALUES(note_visibility),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      nextScore,
      JSON.stringify(nextChips),
      JSON.stringify(nextBody),
      nextSupport,
      nextNote || null,
      nextVis
    ]
  );

  // Upsert support request when preference changes away from none
  if (nextSupport && nextSupport !== 'none') {
    const contactMap = {
      coach: 'coach',
      'athletic-trainer': 'athletic-trainer',
      'performance-staff': 'performance-staff',
      'private-follow-up': 'private-support',
      unsure: 'coach'
    };
    const contact = contactMap[nextSupport] || 'coach';
    const [existingReq] = await pool.execute(
      `SELECT id FROM athlete_readiness_support_requests
       WHERE assessment_id = ? AND domain_key = ? AND status IN ('submitted','acknowledged','in_progress')
       LIMIT 1`,
      [Number(assessmentId), key]
    );
    if (!existingReq?.[0]) {
      await pool.execute(
        `INSERT INTO athlete_readiness_support_requests
          (assessment_id, domain_key, requested_contact, urgency, message, status)
         VALUES (?, ?, ?, 'routine', ?, 'submitted')`,
        [Number(assessmentId), key, contact, nextNote || null]
      );
    }
  }

  return getAssessmentById(assessmentId);
}

export async function completeAssessment({ assessmentId }) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'reviewed') return assessment;

  const activeDomains = assessment.template.domains.filter((d) => {
    if (d.key === 'competition') return assessment.mode === 'competition';
    return true;
  });
  const missing = activeDomains.filter((d) => {
    if (d.isOptional && d.key === 'competition' && assessment.mode !== 'competition') return false;
    const r = assessment.responses.find((x) => x.domainKey === d.key);
    return !r || r.score == null;
  });
  if (missing.length) {
    throw err(400, `All domains require a score. Missing: ${missing.map((d) => d.key).join(', ')}`);
  }

  const summary = buildSummary(assessment.template, assessment.responses, assessment.mode);
  await pool.execute(
    `UPDATE athlete_readiness_assessments
     SET status = 'completed',
         summary_json = ?,
         readiness_score = ?,
         completed_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [JSON.stringify(summary), summary.readinessScore, Number(assessmentId)]
  );
  const __completed = await getAssessmentById(assessmentId);
  /* assessment-deliverables-hub-hook */
  try {
    const { scheduleDeliverableGeneration } = await import('./assessmentDeliverable.service.js');
    scheduleDeliverableGeneration({ family: 'athlete_readiness', assessment: __completed });
  } catch (e) {
    console.warn('[athlete_readiness] deliverable hook failed', e?.message || e);
  }
  return __completed;
}

export async function listAssessmentsForAthlete({ agencyId, athleteUserId = null, clientId = null }) {
  const params = [];
  let where = '1=1';
  if (agencyId) {
    where += ' AND agency_id = ?';
    params.push(Number(agencyId));
  }
  if (athleteUserId) {
    where += ' AND athlete_user_id = ?';
    params.push(Number(athleteUserId));
  } else if (clientId) {
    where += ' AND client_id = ?';
    params.push(Number(clientId));
  } else {
    return [];
  }
  const [rows] = await pool.execute(
    `SELECT id, mode, status, readiness_score, summary_json, access_token, started_at, completed_at, created_at
     FROM athlete_readiness_assessments
     WHERE ${where}
     ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
     LIMIT 50`,
    params
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    mode: r.mode,
    status: r.status,
    readinessScore: r.readiness_score == null ? null : Number(r.readiness_score),
    summary: parseJson(r.summary_json, null),
    accessToken: r.access_token,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at
  }));
}
