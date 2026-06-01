import pool from '../config/database.js';
import { callGeminiText } from './geminiText.service.js';
import { encryptSbClinicalPayload, decryptSbClinicalPayload } from '../utils/skillBuildersClinicalCrypto.js';
import {
  SKILL_BUILDERS_OBSERVATION_PRESETS,
  labelForPreset,
  labelsForPresetIds
} from '../config/skillBuildersObservationPresets.js';
import {
  listActivityOptionsForSkillsGroup,
  resolveActivityOptionsForClinicalSession
} from './skillBuildersActivityOptions.service.js';

const OBSERVATION_TTL_DAYS = 14;

function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeYmd(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function computeExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + OBSERVATION_TTL_DAYS);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw Object.assign(new Error('payload must be a JSON object'), { status: 400 });
  }
  const activityIds = Array.isArray(payload.activityIds)
    ? payload.activityIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
    : [];
  const pickStrings = (arr) =>
    Array.isArray(arr) ? arr.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20) : [];

  return {
    overallStatus: String(payload.overallStatus || '').trim().slice(0, 64) || null,
    activityIds,
    activityOther: String(payload.activityOther || '').trim().slice(0, 255),
    behaviorValence: String(payload.behaviorValence || '').trim().slice(0, 32) || null,
    behaviors: pickStrings(payload.behaviors),
    behaviorsOther: String(payload.behaviorsOther || '').trim().slice(0, 500),
    strengths: pickStrings(payload.strengths),
    strengthsOther: String(payload.strengthsOther || '').trim().slice(0, 500),
    struggles: pickStrings(payload.struggles),
    strugglesOther: String(payload.strugglesOther || '').trim().slice(0, 500),
    peerInteraction: String(payload.peerInteraction || '').trim().slice(0, 64) || null,
    briefNote: String(payload.briefNote || '').trim().slice(0, 1000)
  };
}

export function getObservationPresets() {
  return SKILL_BUILDERS_OBSERVATION_PRESETS;
}

export async function resolveSkillsGroupIdForEvent(agencyId, eventId) {
  const [rows] = await pool.execute(
    `SELECT id FROM skills_groups WHERE company_event_id = ? AND agency_id = ? LIMIT 1`,
    [eventId, agencyId]
  );
  return parsePositiveInt(rows?.[0]?.id);
}

export async function resolveSessionIdForEventDate(companyEventId, sessionDateYmd) {
  const ymd = normalizeYmd(sessionDateYmd);
  if (!ymd) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM skill_builders_event_sessions
       WHERE company_event_id = ? AND session_date = ?
       LIMIT 1`,
      [companyEventId, ymd]
    );
    return parsePositiveInt(rows?.[0]?.id);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

export async function loadActivityOptionsForKioskObservation({ agencyId, eventId, sessionDateYmd }) {
  const sgId = await resolveSkillsGroupIdForEvent(agencyId, eventId);
  if (!sgId) return [];
  const sessionId = await resolveSessionIdForEventDate(eventId, sessionDateYmd);
  try {
    if (sessionId) {
      return (await resolveActivityOptionsForClinicalSession({ skillsGroupId: sgId, sessionId })).filter(
        (o) => o.isActive
      );
    }
    return (await listActivityOptionsForSkillsGroup(sgId, null)).filter((o) => o.isActive);
  } catch {
    return [];
  }
}

export async function assertEmployeeCheckedInForEventDay({ eventId, userId, kioskDateYmd }) {
  const ymd = normalizeYmd(kioskDateYmd);
  if (!ymd) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT action FROM event_day_kiosk_checkins
       WHERE company_event_id = ? AND user_id = ? AND kiosk_date = ? AND person_type = 'employee'
       ORDER BY id DESC LIMIT 1`,
      [eventId, userId, ymd]
    );
    return String(rows?.[0]?.action || '') === 'check_in';
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

function decryptPayloadRow(row) {
  const raw = decryptSbClinicalPayload(row.payload_enc);
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function decryptSummaryRow(row) {
  return decryptSbClinicalPayload(row.summary_enc);
}

async function loadActivityLabelMap(activityIds) {
  if (!activityIds?.length) return new Map();
  const placeholders = activityIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, label FROM skill_builders_activity_options WHERE id IN (${placeholders})`,
    activityIds
  );
  const map = new Map();
  for (const r of rows || []) {
    map.set(Number(r.id), String(r.label || '').trim());
  }
  return map;
}

/** Human-readable single entry for AI / clinical inject. */
export async function formatObservationEntryText(entry, { authorName = '', activityLabelMap = null } = {}) {
  const p = entry.payload || entry;
  const actMap = activityLabelMap || (await loadActivityLabelMap(p.activityIds));
  const activities = (p.activityIds || []).map((id) => actMap.get(Number(id)) || `Activity #${id}`);
  if (p.activityOther) activities.push(p.activityOther);

  const behaviorCat =
    p.behaviorValence === 'concerning' ? 'behaviorsConcerning' : 'behaviorsPositive';
  const behaviorLabels = labelsForPresetIds(behaviorCat, p.behaviors);
  if (p.behaviorsOther) behaviorLabels.push(p.behaviorsOther);

  const lines = [
    authorName ? `Logged by: ${authorName}` : null,
    entry.createdAt ? `Time: ${entry.createdAt}` : null,
    p.overallStatus ? `Overall: ${labelForPreset('overallStatus', p.overallStatus)}` : null,
    activities.length ? `Activities: ${activities.join('; ')}` : null,
    p.behaviorValence ? `Behavior tone: ${labelForPreset('behaviorValence', p.behaviorValence)}` : null,
    behaviorLabels.length ? `Behaviors: ${behaviorLabels.join('; ')}` : null,
    p.strengths?.length || p.strengthsOther
      ? `Strengths: ${[...labelsForPresetIds('strengths', p.strengths), p.strengthsOther].filter(Boolean).join('; ')}`
      : null,
    p.struggles?.length || p.strugglesOther
      ? `Struggles: ${[...labelsForPresetIds('struggles', p.struggles), p.strugglesOther].filter(Boolean).join('; ')}`
      : null,
    p.peerInteraction ? `Peer interaction: ${labelForPreset('peerInteraction', p.peerInteraction)}` : null,
    p.briefNote ? `Note: ${p.briefNote}` : null
  ].filter(Boolean);

  return lines.join('\n');
}

export async function createObservationEntry({
  agencyId,
  companyEventId,
  clientId,
  authorUserId,
  sessionDateYmd,
  payload
}) {
  const aid = parsePositiveInt(agencyId);
  const eid = parsePositiveInt(companyEventId);
  const cid = parsePositiveInt(clientId);
  const uid = parsePositiveInt(authorUserId);
  const ymd = normalizeYmd(sessionDateYmd);
  if (!aid || !eid || !cid || !uid || !ymd) {
    throw Object.assign(new Error('agencyId, companyEventId, clientId, authorUserId, and sessionDate required'), {
      status: 400
    });
  }

  const clean = sanitizePayload(payload);
  const sessionId = await resolveSessionIdForEventDate(eid, ymd);
  const payloadEnc = encryptSbClinicalPayload(JSON.stringify(clean));
  const expiresAt = computeExpiresAt();

  const [res] = await pool.execute(
    `INSERT INTO skill_builders_session_observation_entries
      (agency_id, company_event_id, client_id, author_user_id, session_id, session_date, payload_enc, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [aid, eid, cid, uid, sessionId, ymd, payloadEnc, expiresAt]
  );

  return { id: res.insertId, sessionId, sessionDate: ymd };
}

export async function listObservationEntries({
  agencyId,
  companyEventId,
  sessionDateYmd,
  clientId = null,
  authorUserIdFilter = null
}) {
  const eid = parsePositiveInt(companyEventId);
  const ymd = normalizeYmd(sessionDateYmd);
  if (!eid || !ymd) return [];

  const params = [eid, ymd];
  let sql = `
    SELECT e.id, e.client_id AS clientId, e.author_user_id AS authorUserId,
           e.session_id AS sessionId, e.session_date AS sessionDate, e.payload_enc,
           e.created_at AS createdAt,
           u.first_name AS authorFirstName, u.last_name AS authorLastName,
           c.first_name AS clientFirstName, c.last_name AS clientLastName
    FROM skill_builders_session_observation_entries e
    INNER JOIN users u ON u.id = e.author_user_id
    INNER JOIN clients c ON c.id = e.client_id
    WHERE e.company_event_id = ? AND e.session_date = ?`;

  if (clientId) {
    sql += ' AND e.client_id = ?';
    params.push(parsePositiveInt(clientId));
  }
  if (authorUserIdFilter) {
    sql += ' AND e.author_user_id = ?';
    params.push(parsePositiveInt(authorUserIdFilter));
  }
  sql += ' ORDER BY e.created_at ASC, e.id ASC';

  try {
    const [rows] = await pool.execute(sql, params);
    return (rows || []).map((row) => {
      const payload = decryptPayloadRow(row);
      const authorName = `${row.authorFirstName || ''} ${row.authorLastName || ''}`.trim();
      const clientName = `${row.clientFirstName || ''} ${row.clientLastName || ''}`.trim();
      return {
        id: Number(row.id),
        clientId: Number(row.clientId),
        clientName,
        authorUserId: Number(row.authorUserId),
        authorName,
        sessionId: row.sessionId != null ? Number(row.sessionId) : null,
        sessionDate: normalizeYmd(row.sessionDate),
        payload,
        createdAt: row.createdAt
      };
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

/** Enrich entries with resolved activity labels for portal display. */
export async function enrichObservationEntriesWithActivityLabels(entries) {
  const allIds = new Set();
  for (const e of entries || []) {
    for (const id of e.payload?.activityIds || []) allIds.add(Number(id));
  }
  const map = await loadActivityLabelMap([...allIds]);
  return (entries || []).map((e) => ({
    ...e,
    activityLabels: (e.payload?.activityIds || [])
      .map((id) => map.get(Number(id)) || null)
      .filter(Boolean)
  }));
}

export async function getDailySummary({ companyEventId, clientId, sessionDateYmd }) {
  const eid = parsePositiveInt(companyEventId);
  const cid = parsePositiveInt(clientId);
  const ymd = normalizeYmd(sessionDateYmd);
  if (!eid || !cid || !ymd) return null;

  try {
    const [rows] = await pool.execute(
      `SELECT * FROM skill_builders_session_observation_daily_summaries
       WHERE company_event_id = ? AND client_id = ? AND session_date = ?
       LIMIT 1`,
      [eid, cid, ymd]
    );
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      clientId: cid,
      sessionDate: ymd,
      entryCount: Number(row.entry_count) || 0,
      sourceEntryIds: JSON.parse(row.source_entry_ids_json || '[]'),
      summary: decryptSummaryRow(row),
      generatedAt: row.generated_at,
      generatedByUserId: Number(row.generated_by_user_id),
      modelName: row.model_name || null
    };
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

export async function generateDailySummary({
  agencyId,
  companyEventId,
  clientId,
  sessionDateYmd,
  generatedByUserId,
  clientDisplayName = 'Client'
}) {
  const entries = await listObservationEntries({
    agencyId,
    companyEventId,
    sessionDateYmd,
    clientId
  });
  if (!entries.length) {
    throw Object.assign(new Error('No observation entries for this client on this date'), { status: 404 });
  }

  const blocks = [];
  for (const entry of entries) {
    blocks.push(await formatObservationEntryText(entry, { authorName: entry.authorName }));
  }

  const prompt = [
    'You are summarizing structured staff session observations for a Skill Builders emotion/social skills group.',
    'Write 1–2 concise paragraphs for internal staff review. Use objective, professional language.',
    'Do not invent facts beyond the observations below.',
    '',
    `Client: ${String(clientDisplayName).trim().slice(0, 80)}`,
    `Session date: ${normalizeYmd(sessionDateYmd)}`,
    '',
    'Observation entries (chronological):',
    blocks.map((b, i) => `--- Entry ${i + 1} ---\n${b}`).join('\n\n')
  ].join('\n');

  const { text, modelName } = await callGeminiText({
    prompt,
    temperature: 0.2,
    maxOutputTokens: 900
  });

  const summaryText = String(text || '').trim();
  if (!summaryText) {
    throw Object.assign(new Error('AI summary generation returned empty text'), { status: 502 });
  }

  const aid = parsePositiveInt(agencyId);
  const eid = parsePositiveInt(companyEventId);
  const cid = parsePositiveInt(clientId);
  const uid = parsePositiveInt(generatedByUserId);
  const ymd = normalizeYmd(sessionDateYmd);
  const sourceIds = entries.map((e) => e.id);
  const summaryEnc = encryptSbClinicalPayload(summaryText);

  await pool.execute(
    `INSERT INTO skill_builders_session_observation_daily_summaries
      (agency_id, company_event_id, client_id, session_date, entry_count, source_entry_ids_json,
       summary_enc, generated_by_user_id, model_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       entry_count = VALUES(entry_count),
       source_entry_ids_json = VALUES(source_entry_ids_json),
       summary_enc = VALUES(summary_enc),
       generated_at = CURRENT_TIMESTAMP,
       generated_by_user_id = VALUES(generated_by_user_id),
       model_name = VALUES(model_name)`,
    [
      aid,
      eid,
      cid,
      ymd,
      entries.length,
      JSON.stringify(sourceIds),
      summaryEnc,
      uid,
      modelName || null
    ]
  );

  return getDailySummary({ companyEventId: eid, clientId: cid, sessionDateYmd: ymd });
}

/** Build text block for H2014 clinical note prompt injection. */
export async function buildObservationContextForClinical({
  companyEventId,
  clientId,
  sessionDateYmd
}) {
  const ymd = normalizeYmd(sessionDateYmd);
  if (!ymd) return '';

  const entries = await listObservationEntries({
    companyEventId,
    sessionDateYmd: ymd,
    clientId
  });
  const summary = await getDailySummary({ companyEventId, clientId, sessionDateYmd: ymd });

  if (!entries.length && !summary?.summary) return '';

  const parts = ['STAFF SESSION OBSERVATIONS (authoritative — do not invent beyond this):'];

  if (summary?.summary) {
    parts.push('', 'Daily staff summary:', summary.summary);
  }

  if (entries.length) {
    parts.push('', 'Individual observation entries:');
    for (let i = 0; i < entries.length; i++) {
      parts.push(`--- Entry ${i + 1} ---`);
      parts.push(await formatObservationEntryText(entries[i], { authorName: entries[i].authorName }));
    }
  }

  return parts.join('\n');
}
