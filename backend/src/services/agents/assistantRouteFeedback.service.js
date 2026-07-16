/**
 * Persist Ask Assistant thumbs feedback, disengage signals, and SuperAdmin review queries.
 */

import pool from '../../config/database.js';

function clip(s, max) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

function toJsonOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ id: number }>}
 */
export async function insertAssistantRouteFeedback({
  agencyId = null,
  userId,
  prompt,
  helpful = null,
  runtime = null,
  routedCapabilityId = null,
  correctedCapabilityId = null,
  note = null,
  promoteAsExample = false,
  eventType = 'feedback',
  assistantExcerpt = null,
  reviewStatus = 'pending',
  metadata = null
} = {}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('userId required');
    err.status = 400;
    throw err;
  }
  const p = clip(prompt, 500);
  if (!p) {
    const err = new Error('prompt required');
    err.status = 400;
    throw err;
  }

  let help = null;
  if (helpful === true || helpful === 1 || helpful === '1') help = 1;
  else if (helpful === false || helpful === 0 || helpful === '0') help = 0;

  const corrected = clip(correctedCapabilityId, 80) || null;
  const promote = promoteAsExample && corrected ? 1 : 0;
  const et = clip(eventType, 32) || 'feedback';
  const rs = clip(reviewStatus, 20) || 'pending';

  const [res] = await pool.execute(
    `INSERT INTO assistant_route_feedback
       (agency_id, user_id, event_type, prompt, assistant_excerpt, helpful, runtime,
        routed_capability_id, corrected_capability_id, note, promote_as_example,
        review_status, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agencyId ? Number(agencyId) : null,
      uid,
      et,
      p,
      clip(assistantExcerpt, 1500) || null,
      help,
      clip(runtime, 64) || null,
      clip(routedCapabilityId, 80) || null,
      corrected,
      clip(note, 1000) || null,
      promote,
      rs,
      toJsonOrNull(metadata)
    ]
  );
  return { id: Number(res?.insertId || 0) };
}

/**
 * SuperAdmin review feed.
 * When reviewQueue is true (default for admin UI), returns pending thumbs-down + disengages.
 */
export async function listAssistantAssistSignalsForAdmin({
  eventType = null,
  reviewStatus = 'pending',
  helpful = null,
  agencyId = null,
  dateFrom = null,
  dateTo = null,
  reviewQueue = false,
  limit = 50,
  offset = 0
} = {}) {
  const where = ['1=1'];
  const params = [];

  if (reviewQueue) {
    where.push(
      `((f.event_type = 'feedback' AND f.helpful = 0) OR f.event_type = 'disengage')`
    );
    if (reviewStatus) {
      where.push('f.review_status = ?');
      params.push(String(reviewStatus));
    }
  } else {
    if (eventType) {
      where.push('f.event_type = ?');
      params.push(String(eventType));
    }
    if (reviewStatus) {
      where.push('f.review_status = ?');
      params.push(String(reviewStatus));
    }
    if (helpful === 0 || helpful === '0' || helpful === false) {
      where.push('f.helpful = 0');
    } else if (helpful === 1 || helpful === '1' || helpful === true) {
      where.push('f.helpful = 1');
    }
  }
  if (agencyId) {
    where.push('f.agency_id = ?');
    params.push(Number(agencyId));
  }
  if (dateFrom) {
    where.push('f.created_at >= ?');
    params.push(String(dateFrom).slice(0, 10) + ' 00:00:00');
  }
  if (dateTo) {
    where.push('f.created_at <= ?');
    params.push(String(dateTo).slice(0, 10) + ' 23:59:59');
  }

  const lim = Math.min(Math.max(1, Number(limit) || 50), 200);
  const off = Math.max(0, Number(offset) || 0);

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM assistant_route_feedback f
     WHERE ${where.join(' AND ')}`,
    params
  );
  const total = Number(countRows?.[0]?.cnt || 0);

  const [rows] = await pool.execute(
    `SELECT
       f.id,
       f.agency_id,
       f.user_id,
       f.event_type,
       f.prompt,
       f.assistant_excerpt,
       f.helpful,
       f.runtime,
       f.routed_capability_id,
       f.corrected_capability_id,
       f.note,
       f.promote_as_example,
       f.review_status,
       f.metadata_json,
       f.created_at,
       u.email AS user_email,
       u.first_name AS user_first_name,
       u.last_name AS user_last_name,
       a.name AS agency_name
     FROM assistant_route_feedback f
     LEFT JOIN users u ON u.id = f.user_id
     LEFT JOIN agencies a ON a.id = f.agency_id
     WHERE ${where.join(' AND ')}
     ORDER BY f.created_at DESC
     LIMIT ${lim} OFFSET ${off}`,
    params
  );

  return {
    total,
    limit: lim,
    offset: off,
    items: (rows || []).map((r) => ({
      ...r,
      metadata:
        typeof r.metadata_json === 'string'
          ? (() => {
              try {
                return JSON.parse(r.metadata_json);
              } catch {
                return null;
              }
            })()
          : r.metadata_json || null
    }))
  };
}

export async function updateAssistantAssistSignalReviewStatus({ id, reviewStatus }) {
  const signalId = Number(id);
  const status = clip(reviewStatus, 20);
  if (!signalId || !['pending', 'reviewed', 'dismissed'].includes(status)) {
    const err = new Error('Invalid id or reviewStatus');
    err.status = 400;
    throw err;
  }
  await pool.execute(
    `UPDATE assistant_route_feedback SET review_status = ? WHERE id = ?`,
    [status, signalId]
  );
  return { id: signalId, reviewStatus: status };
}

export async function countPendingAssistantAssistSignals() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM assistant_route_feedback
     WHERE review_status = 'pending'
       AND (
         (event_type = 'feedback' AND helpful = 0)
         OR event_type = 'disengage'
       )`
  );
  return Number(rows?.[0]?.cnt || 0);
}

/**
 * Promoted correction prompts keyed by capability id (for TF–IDF document boost).
 * @returns {Promise<Map<string, string[]>>}
 */
export async function listPromotedSemanticExamplesByCapability({ limitPerCapability = 25, maxTotal = 400 } = {}) {
  const lim = Math.min(Math.max(1, Number(maxTotal) || 400), 1000);
  const [rows] = await pool.execute(
    `SELECT corrected_capability_id AS capability_id, prompt
     FROM assistant_route_feedback
     WHERE promote_as_example = 1
       AND corrected_capability_id IS NOT NULL
       AND corrected_capability_id <> ''
       AND helpful = 0
       AND event_type = 'feedback'
     ORDER BY id DESC
     LIMIT ${lim}`
  );

  const perCap = Math.min(Math.max(1, Number(limitPerCapability) || 25), 50);
  const byId = new Map();
  for (const r of rows || []) {
    const id = String(r.capability_id || '').trim();
    const prompt = String(r.prompt || '').trim();
    if (!id || !prompt) continue;
    if (!byId.has(id)) byId.set(id, []);
    const list = byId.get(id);
    if (list.length >= perCap) continue;
    if (list.some((x) => x.toLowerCase() === prompt.toLowerCase())) continue;
    list.push(prompt);
  }
  return byId;
}

/** Short-lived in-process cache so every soft route does not hit MySQL. */
let _examplesCache = { at: 0, map: null };
const EXAMPLES_TTL_MS = 60_000;

export async function getCachedPromotedSemanticExamples() {
  const now = Date.now();
  if (_examplesCache.map && now - _examplesCache.at < EXAMPLES_TTL_MS) {
    return _examplesCache.map;
  }
  try {
    const map = await listPromotedSemanticExamplesByCapability();
    _examplesCache = { at: now, map };
    return map;
  } catch (e) {
    console.warn('[assistantRouteFeedback] load promoted examples failed', e?.message || e);
    return _examplesCache.map || new Map();
  }
}

export function clearPromotedSemanticExamplesCache() {
  _examplesCache = { at: 0, map: null };
}
