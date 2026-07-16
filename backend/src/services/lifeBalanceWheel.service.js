import crypto from 'crypto';
import pool from '../config/database.js';
import { markPacketIntakeLinkComplete, findPacketByToken } from './practitionerPackage.service.js';

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

export async function getDefaultTemplate({ agencyId = null } = {}) {
  let rows;
  if (agencyId) {
    [rows] = await pool.execute(
      `SELECT * FROM life_balance_templates
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [Number(agencyId)]
    );
  }
  if (!rows?.[0]) {
    [rows] = await pool.execute(
      `SELECT * FROM life_balance_templates
       WHERE agency_id IS NULL AND is_active = 1
       ORDER BY id ASC LIMIT 1`
    );
  }
  const template = rows?.[0];
  if (!template) throw err(404, 'Life Balance Wheel template not found');

  const [cats] = await pool.execute(
    `SELECT * FROM life_balance_template_categories
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
    timeframe: template.timeframe,
    settings: parseJson(template.settings_json, {}),
    categories: (cats || []).map((c) => ({
      id: Number(c.id),
      key: c.category_key,
      label: c.label,
      shortLabel: c.short_label,
      description: c.description,
      color: c.color,
      icon: c.icon,
      displayOrder: Number(c.display_order || 0),
      questions: parseJson(c.questions_json, {})
    }))
  };
}

async function loadResponses(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM life_balance_category_responses WHERE assessment_id = ?`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    categoryKey: r.category_key,
    score: r.score == null ? null : Number(r.score),
    note: r.note || '',
    selectedOptionIds: parseJson(r.selected_option_ids_json, []) || [],
    desiredScore: r.desired_score == null ? null : Number(r.desired_score),
    updatedAt: r.updated_at
  }));
}

async function loadPriorities(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT category_key, display_order FROM life_balance_priorities
     WHERE assessment_id = ? ORDER BY display_order ASC, id ASC`,
    [assessmentId]
  );
  return (rows || []).map((r) => ({
    categoryKey: r.category_key,
    displayOrder: Number(r.display_order || 0)
  }));
}

async function loadGoals(assessmentId) {
  const [goals] = await pool.execute(
    `SELECT * FROM life_balance_goals WHERE assessment_id = ? ORDER BY id ASC`,
    [assessmentId]
  );
  const out = [];
  for (const g of goals || []) {
    const [steps] = await pool.execute(
      `SELECT * FROM life_balance_action_steps WHERE goal_id = ? ORDER BY display_order ASC, id ASC`,
      [g.id]
    );
    out.push({
      id: Number(g.id),
      categoryKey: g.category_key,
      goalStatement: g.goal_statement,
      obstacles: g.obstacles || '',
      support: g.support || '',
      targetDate: g.target_date,
      confidence: g.confidence == null ? null : Number(g.confidence),
      actionSteps: (steps || []).map((s) => ({
        id: Number(s.id),
        stepText: s.step_text,
        displayOrder: Number(s.display_order || 0),
        isDone: !!s.is_done
      }))
    });
  }
  return out;
}

function buildSummary(template, responses) {
  const byKey = Object.fromEntries((responses || []).map((r) => [r.categoryKey, r]));
  const scored = (template.categories || [])
    .map((c) => {
      const score = byKey[c.key]?.score;
      return score == null ? null : { key: c.key, label: c.label, score: Number(score), color: c.color };
    })
    .filter(Boolean);

  if (!scored.length) {
    return { average: null, strengths: [], growthAreas: [], scoredCount: 0 };
  }

  const average = scored.reduce((s, x) => s + x.score, 0) / scored.length;
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  return {
    average: Math.round(average * 10) / 10,
    strengths: sorted.slice(0, 3),
    growthAreas: [...sorted].reverse().slice(0, 3),
    scoredCount: scored.length
  };
}

export async function getAssessmentById(assessmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM life_balance_assessments WHERE id = ? LIMIT 1`,
    [Number(assessmentId)]
  );
  const row = rows?.[0];
  if (!row) return null;
  return hydrateAssessment(row);
}

export async function getAssessmentByToken(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM life_balance_assessments WHERE access_token = ? LIMIT 1`,
    [token]
  );
  const row = rows?.[0];
  if (!row) return null;
  return hydrateAssessment(row);
}

async function hydrateAssessment(row) {
  const template = await getDefaultTemplate({ agencyId: row.agency_id });
  // Prefer the assessment's template id if it differs
  let tpl = template;
  if (Number(row.template_id) !== Number(template.id)) {
    const [trows] = await pool.execute(`SELECT * FROM life_balance_templates WHERE id = ? LIMIT 1`, [
      row.template_id
    ]);
    if (trows?.[0]) {
      const [cats] = await pool.execute(
        `SELECT * FROM life_balance_template_categories
         WHERE template_id = ? AND is_active = 1 ORDER BY display_order ASC`,
        [row.template_id]
      );
      tpl = {
        id: Number(trows[0].id),
        agencyId: trows[0].agency_id == null ? null : Number(trows[0].agency_id),
        name: trows[0].name,
        description: trows[0].description,
        version: Number(trows[0].version || 1),
        timeframe: trows[0].timeframe,
        settings: parseJson(trows[0].settings_json, {}),
        categories: (cats || []).map((c) => ({
          id: Number(c.id),
          key: c.category_key,
          label: c.label,
          shortLabel: c.short_label,
          description: c.description,
          color: c.color,
          icon: c.icon,
          displayOrder: Number(c.display_order || 0),
          questions: parseJson(c.questions_json, {})
        }))
      };
    }
  }

  const responses = await loadResponses(row.id);
  const priorities = await loadPriorities(row.id);
  const goals = await loadGoals(row.id);

  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    templateId: Number(row.template_id),
    templateVersion: Number(row.template_version || 1),
    clientId: row.client_id == null ? null : Number(row.client_id),
    subjectUserId: row.subject_user_id == null ? null : Number(row.subject_user_id),
    assignedByUserId: row.assigned_by_user_id == null ? null : Number(row.assigned_by_user_id),
    coachUserId: row.coach_user_id == null ? null : Number(row.coach_user_id),
    intakeLinkId: row.intake_link_id == null ? null : Number(row.intake_link_id),
    packetToken: row.packet_token || null,
    status: row.status,
    accessToken: row.access_token,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    summary: parseJson(row.summary_json, null) || buildSummary(tpl, responses),
    template: tpl,
    responses,
    priorities,
    goals,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createAssessment({
  agencyId,
  clientId = null,
  subjectUserId = null,
  assignedByUserId = null,
  coachUserId = null,
  intakeLinkId = null,
  packetToken = null
}) {
  const aid = Number(agencyId || 0);
  if (!aid) throw err(400, 'agencyId required');
  const cid = clientId ? Number(clientId) : null;
  const sid = subjectUserId ? Number(subjectUserId) : null;
  if (!cid && !sid && !intakeLinkId) {
    throw err(400, 'clientId, subjectUserId, or intakeLinkId required');
  }

  const template = await getDefaultTemplate({ agencyId: aid });
  const accessToken = newAccessToken();

  const [result] = await pool.execute(
    `INSERT INTO life_balance_assessments
      (agency_id, template_id, template_version, client_id, subject_user_id,
       assigned_by_user_id, coach_user_id, intake_link_id, packet_token,
       status, access_token, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, NULL)`,
    [
      aid,
      template.id,
      template.version,
      cid,
      sid,
      assignedByUserId || null,
      coachUserId || null,
      intakeLinkId ? Number(intakeLinkId) : null,
      packetToken || null,
      accessToken
    ]
  );

  // Prefill empty response rows for all categories
  for (const cat of template.categories) {
    await pool.execute(
      `INSERT INTO life_balance_category_responses (assessment_id, category_key, score)
       VALUES (?, ?, NULL)`,
      [result.insertId, cat.key]
    );
  }

  return getAssessmentById(result.insertId);
}

export async function upsertCategoryResponse({
  assessmentId,
  categoryKey,
  score = undefined,
  note = undefined,
  selectedOptionIds = undefined,
  desiredScore = undefined
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    throw err(409, 'Completed assessments cannot be edited');
  }

  const key = String(categoryKey || '').trim();
  if (!assessment.template.categories.some((c) => c.key === key)) {
    throw err(400, 'Unknown category');
  }

  if (score !== undefined && score !== null) {
    const n = Number(score);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw err(400, 'Score must be 1–10');
  }

  const existing = assessment.responses.find((r) => r.categoryKey === key);
  const nextScore = score === undefined ? existing?.score ?? null : score;
  const nextNote = note === undefined ? existing?.note ?? '' : String(note || '');
  const nextOpts =
    selectedOptionIds === undefined
      ? existing?.selectedOptionIds || []
      : Array.isArray(selectedOptionIds)
        ? selectedOptionIds
        : [];
  const nextDesired =
    desiredScore === undefined ? existing?.desiredScore ?? null : desiredScore;

  await pool.execute(
    `INSERT INTO life_balance_category_responses
      (assessment_id, category_key, score, note, selected_option_ids_json, desired_score)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       score = VALUES(score),
       note = VALUES(note),
       selected_option_ids_json = VALUES(selected_option_ids_json),
       desired_score = VALUES(desired_score),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(assessmentId),
      key,
      nextScore,
      nextNote || null,
      JSON.stringify(nextOpts),
      nextDesired
    ]
  );

  if (assessment.status === 'not_started') {
    await pool.execute(
      `UPDATE life_balance_assessments
       SET status = 'in_progress', started_at = COALESCE(started_at, NOW()), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [Number(assessmentId)]
    );
  }

  return getAssessmentById(assessmentId);
}

export async function completeAssessment({
  assessmentId,
  priorityCategoryKeys = [],
  skipPacketMark = false
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status === 'completed') return assessment;

  const required = assessment.template.categories.map((c) => c.key);
  const byKey = Object.fromEntries(assessment.responses.map((r) => [r.categoryKey, r]));
  const missing = required.filter((k) => byKey[k]?.score == null);
  if (missing.length) {
    throw err(400, `All category scores are required. Missing: ${missing.join(', ')}`);
  }

  const maxP = Number(assessment.template.settings?.maxPrioritySelections || 3);
  const priorities = [...new Set((priorityCategoryKeys || []).map(String))].slice(0, maxP);
  for (const k of priorities) {
    if (!required.includes(k)) throw err(400, `Invalid priority category: ${k}`);
  }

  await pool.execute(`DELETE FROM life_balance_priorities WHERE assessment_id = ?`, [
    Number(assessmentId)
  ]);
  let order = 0;
  for (const k of priorities) {
    await pool.execute(
      `INSERT INTO life_balance_priorities (assessment_id, category_key, display_order)
       VALUES (?, ?, ?)`,
      [Number(assessmentId), k, order++]
    );
  }

  const summary = buildSummary(assessment.template, assessment.responses);
  await pool.execute(
    `UPDATE life_balance_assessments
     SET status = 'completed',
         completed_at = NOW(),
         summary_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [JSON.stringify(summary), Number(assessmentId)]
  );

  // Packet auto-complete when this assessment was opened from a packet docs step
  if (!skipPacketMark && assessment.packetToken && assessment.intakeLinkId) {
    try {
      const packet = await findPacketByToken(assessment.packetToken);
      if (packet?.id) {
        await markPacketIntakeLinkComplete({
          packetId: packet.id,
          intakeLinkId: assessment.intakeLinkId
        });
      }
    } catch (e) {
      console.warn('[lifeBalance] packet mark-complete failed', e?.message || e);
    }
  }

  const __completed = await getAssessmentById(assessmentId);
  /* assessment-deliverables-hub-hook */
  try {
    const { scheduleDeliverableGeneration } = await import('./assessmentDeliverable.service.js');
    scheduleDeliverableGeneration({ family: 'life_balance', assessment: __completed });
  } catch (e) {
    console.warn('[life_balance] deliverable hook failed', e?.message || e);
  }
  return __completed;
}

export async function addGoal({
  assessmentId,
  categoryKey,
  goalStatement,
  obstacles = null,
  support = null,
  targetDate = null,
  confidence = null,
  actionSteps = [],
  createdByUserId = null
}) {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) throw err(404, 'Assessment not found');
  if (assessment.status !== 'completed' && assessment.status !== 'in_progress') {
    throw err(400, 'Assessment must be in progress or completed to add goals');
  }
  const key = String(categoryKey || '').trim();
  if (!assessment.template.categories.some((c) => c.key === key)) {
    throw err(400, 'Unknown category');
  }
  const statement = String(goalStatement || '').trim();
  if (!statement) throw err(400, 'goalStatement required');

  const [result] = await pool.execute(
    `INSERT INTO life_balance_goals
      (assessment_id, category_key, goal_statement, obstacles, support, target_date, confidence, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(assessmentId),
      key,
      statement,
      obstacles || null,
      support || null,
      targetDate || null,
      confidence == null ? null : Number(confidence),
      createdByUserId || null
    ]
  );

  let i = 0;
  for (const step of actionSteps || []) {
    const text = String(step?.stepText || step || '').trim();
    if (!text) continue;
    await pool.execute(
      `INSERT INTO life_balance_action_steps (goal_id, step_text, display_order)
       VALUES (?, ?, ?)`,
      [result.insertId, text, i++]
    );
  }

  return getAssessmentById(assessmentId);
}

export async function listAssessmentsForSubject({ agencyId, clientId = null, subjectUserId = null }) {
  const aid = Number(agencyId || 0);
  if (!aid) throw err(400, 'agencyId required');
  const params = [aid];
  let where = 'agency_id = ?';
  if (clientId) {
    where += ' AND client_id = ?';
    params.push(Number(clientId));
  } else if (subjectUserId) {
    where += ' AND subject_user_id = ?';
    params.push(Number(subjectUserId));
  } else {
    throw err(400, 'clientId or subjectUserId required');
  }

  const [rows] = await pool.execute(
    `SELECT id, status, started_at, completed_at, summary_json, access_token, created_at, updated_at
     FROM life_balance_assessments
     WHERE ${where}
     ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
     LIMIT 50`,
    params
  );

  return (rows || []).map((r) => ({
    id: Number(r.id),
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    summary: parseJson(r.summary_json, null),
    accessToken: r.access_token,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

/**
 * Ensure an assessment exists for a public intake link visit (create or resume latest draft).
 */
export async function ensureAssessmentForIntakeLink({
  agencyId,
  intakeLinkId,
  clientId = null,
  packetToken = null,
  assignedByUserId = null
}) {
  const linkId = Number(intakeLinkId || 0);
  if (!linkId) throw err(400, 'intakeLinkId required');

  // Resume in-progress for same link + client/packet
  const params = [Number(agencyId), linkId];
  let sql = `SELECT id FROM life_balance_assessments
             WHERE agency_id = ? AND intake_link_id = ?
               AND status IN ('not_started', 'in_progress')`;
  if (packetToken) {
    sql += ` AND packet_token = ?`;
    params.push(String(packetToken));
  }
  if (clientId) {
    sql += ` AND client_id = ?`;
    params.push(Number(clientId));
  }
  sql += ` ORDER BY id DESC LIMIT 1`;

  const [existing] = await pool.execute(sql, params);
  if (existing?.[0]?.id) return getAssessmentById(existing[0].id);

  return createAssessment({
    agencyId,
    clientId,
    subjectUserId: clientId ? null : null,
    assignedByUserId,
    intakeLinkId: linkId,
    packetToken
  });
}
