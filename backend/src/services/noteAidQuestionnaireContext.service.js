/**
 * Build questionnaire / screen score context for 90791, H0031, treatment summary.
 * Only includes instruments not already attached to another of those note types.
 */
import pool from '../config/database.js';

const INSTRUMENT_PATTERNS = [
  { key: 'phq9', label: 'PHQ-9', match: /(^|_)phq9(_|$)|phq_9|phq-9/i },
  { key: 'gad7', label: 'GAD-7', match: /(^|_)gad7(_|$)|gad_7|gad-7/i },
  { key: 'psc17', label: 'PSC-17', match: /(^|_)psc(_|17|$)|psc-17|psc17/i }
];

function scoreBucket(responses = {}) {
  const byInstrument = {};
  for (const [key, val] of Object.entries(responses || {})) {
    const k = String(key || '');
    for (const inst of INSTRUMENT_PATTERNS) {
      if (!inst.match.test(k)) continue;
      if (!byInstrument[inst.key]) byInstrument[inst.key] = { label: inst.label, items: [] };
      const n = Number(val);
      byInstrument[inst.key].items.push({
        key: k,
        value: Number.isFinite(n) ? n : val
      });
    }
  }
  return byInstrument;
}

function summarizeInstrument(instKey, bucket) {
  const nums = (bucket.items || [])
    .map((i) => Number(i.value))
    .filter((n) => Number.isFinite(n));
  const total = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  const lines = [`${bucket.label} (unattached — include in write-up / diagnostic recommendations):`];
  if (total != null) lines.push(`- Total score: ${total} (from ${nums.length} item responses)`);
  else lines.push('- Item responses present (see clinicalResponses).');
  const sample = (bucket.items || []).slice(0, 12)
    .map((i) => `  ${i.key}=${i.value}`)
    .join('\n');
  if (sample) lines.push(sample);
  return { instrumentKey: instKey, text: lines.join('\n'), total };
}

async function listAttachedInstrumentKeys({ agencyId, clientId }) {
  const aid = Number(agencyId || 0);
  const cid = Number(clientId || 0);
  if (!aid || !cid) return new Set();
  try {
    const [rows] = await pool.execute(
      `SELECT instrument_key FROM note_aid_questionnaire_attachments
       WHERE agency_id = ? AND client_id = ?`,
      [aid, cid]
    );
    return new Set((rows || []).map((r) => String(r.instrument_key || '').toLowerCase()));
  } catch (e) {
    if (String(e?.message || '').includes('doesn\'t exist') || e.code === 'ER_NO_SUCH_TABLE') {
      return new Set();
    }
    throw e;
  }
}

/**
 * @returns {{ contextText: string, instruments: Array<{instrumentKey:string,text:string}> }}
 */
export async function buildUnattachedQuestionnaireContext({
  agencyId,
  clientId,
  clinicalResponses = null
} = {}) {
  const attached = await listAttachedInstrumentKeys({ agencyId, clientId });
  let responses = clinicalResponses;
  if (!responses && clientId) {
    try {
      const [subs] = await pool.execute(
        `SELECT id, intake_data FROM intake_submissions
         WHERE client_id = ?
         ORDER BY id DESC
         LIMIT 5`,
        [clientId]
      );
      for (const row of subs || []) {
        let data = row.intake_data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch { data = {}; }
        }
        const cr = data?.clinicalResponses || data?.clinical_responses || null;
        if (cr && typeof cr === 'object' && Object.keys(cr).length) {
          responses = cr;
          break;
        }
      }
    } catch {
      responses = null;
    }
  }

  const buckets = scoreBucket(responses || {});
  const instruments = [];
  for (const [key, bucket] of Object.entries(buckets)) {
    if (attached.has(key)) continue;
    instruments.push(summarizeInstrument(key, bucket));
  }

  if (!instruments.length) {
    return { contextText: '', instruments: [] };
  }

  return {
    contextText: [
      'UNATTACHED QUESTIONNAIRE / SCREEN RESULTS (not yet used on a prior 90791 or H0031 note — incorporate into narrative and diagnostic recommendations per training data; do not invent scores):',
      ...instruments.map((i) => i.text)
    ].join('\n\n').slice(0, 6000),
    instruments
  };
}

export async function markQuestionnairesAttached({
  agencyId,
  clientId,
  clinicalNoteId,
  instruments = [],
  sourceRef = null,
  actorUserId = null
} = {}) {
  const aid = Number(agencyId || 0);
  const cid = Number(clientId || 0);
  const nid = Number(clinicalNoteId || 0);
  if (!aid || !cid || !nid || !instruments.length) return;
  for (const inst of instruments) {
    const key = String(inst.instrumentKey || inst.key || '').toLowerCase();
    if (!key) continue;
    try {
      await pool.execute(
        `INSERT INTO note_aid_questionnaire_attachments
         (agency_id, client_id, clinical_note_id, instrument_key, source_ref, score_summary, attached_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score_summary = VALUES(score_summary), attached_at = CURRENT_TIMESTAMP`,
        [
          aid,
          cid,
          nid,
          key,
          sourceRef || null,
          String(inst.text || inst.score_summary || '').slice(0, 4000) || null,
          actorUserId || null
        ]
      );
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') return;
      console.warn('[noteAidQuestionnaire] attach failed', e?.message || e);
    }
  }
}

export default {
  buildUnattachedQuestionnaireContext,
  markQuestionnairesAttached
};
