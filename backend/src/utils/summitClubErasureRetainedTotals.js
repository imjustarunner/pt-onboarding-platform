import pool from '../config/database.js';

/** @typedef {{ distance: number, points: number, durationMinutes: number, workoutCount: number, calories: number }} TotalsSlice */
/** @typedef {{ run: number, ruck: number, walk: number, cycling: number, steps: number, other: number }} ActivityMilesSlice */

const emptyTotals = () => ({
  distance: 0,
  points: 0,
  durationMinutes: 0,
  workoutCount: 0,
  calories: 0
});

const emptyRec = () => ({
  ...emptyTotals(),
  runCount: 0,
  ruckCount: 0,
  walkCount: 0,
  runMiles: 0,
  ruckMiles: 0,
  walkMiles: 0,
  activityMiles: { run: 0, ruck: 0, walk: 0, cycling: 0, steps: 0, other: 0 }
});

export const emptyRetainedStructure = () => ({
  /** Matches getPublicClubStats (no disqualification / proof filter on raw sum) */
  all: emptyTotals(),
  /** Matches getClubSpecs totals and per-activity miles (non-disqualified + approved proof) */
  qual: { ...emptyTotals(), activityMiles: { run: 0, ruck: 0, walk: 0, cycling: 0, steps: 0, other: 0 } },
  /** Matches computeLiveStats SQL aggregates (non-disqualified only) */
  rec: emptyRec()
});

function parseStored(json) {
  if (!json) return emptyRetainedStructure();
  let o = json;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return emptyRetainedStructure();
    }
  }
  if (!o || typeof o !== 'object') return emptyRetainedStructure();
  const base = emptyRetainedStructure();
  for (const k of ['all', 'qual', 'rec']) {
    if (!o[k] || typeof o[k] !== 'object') continue;
    if (k === 'rec') {
      base.rec = { ...emptyRec(), ...o.rec };
      base.rec.activityMiles = {
        ...emptyRec().activityMiles,
        ...(o.rec.activityMiles && typeof o.rec.activityMiles === 'object' ? o.rec.activityMiles : {})
      };
    } else if (k === 'qual') {
      base.qual = { ...emptyTotals(), activityMiles: { ...base.qual.activityMiles }, ...o.qual };
      base.qual.activityMiles = {
        ...emptyRetainedStructure().qual.activityMiles,
        ...(o.qual.activityMiles && typeof o.qual.activityMiles === 'object' ? o.qual.activityMiles : {})
      };
    } else {
      base[k] = { ...emptyTotals(), ...o[k] };
    }
  }
  return base;
}

function addNum(a, b) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  return x + y;
}

/**
 * Add `delta` (from computeErasureDeltaForUserClub) into stored JSON for the club.
 */
export function mergeRetainedTotals(existing, delta) {
  const out = parseStored(existing);
  for (const bucket of ['all']) {
    for (const key of Object.keys(out[bucket])) {
      out[bucket][key] = addNum(out[bucket][key], delta[bucket]?.[key]);
    }
  }
  for (const key of Object.keys(emptyTotals())) {
    out.qual[key] = addNum(out.qual[key], delta.qual?.[key]);
  }
  out.qual.activityMiles = out.qual.activityMiles || emptyRetainedStructure().qual.activityMiles;
  const qam = delta.qual?.activityMiles || {};
  for (const k of Object.keys(out.qual.activityMiles)) {
    out.qual.activityMiles[k] = addNum(out.qual.activityMiles[k], qam[k]);
  }
  const dr = delta.rec || {};
  const or = out.rec;
  for (const key of Object.keys(or)) {
    if (key === 'activityMiles') continue;
    or[key] = addNum(or[key], dr[key]);
  }
  or.activityMiles = or.activityMiles || emptyRec().activityMiles;
  const am = dr.activityMiles || {};
  for (const k of Object.keys(or.activityMiles)) {
    or.activityMiles[k] = addNum(or.activityMiles[k], am[k]);
  }
  return out;
}

const proofOk = (proofStatus) => {
  const s = String(proofStatus || '').toLowerCase();
  return !s || s === 'not_required' || s === 'approved';
};

const dqOk = (isDisqualified) =>
  isDisqualified == null || Number(isDisqualified) === 0;

function bucketActivityMiles(activityType, dist) {
  const d = Number(dist) || 0;
  if (d <= 0) return null;
  const at = String(activityType || '').toLowerCase();
  if (at.includes('ruck')) return { key: 'ruck', d };
  if (at.includes('run') || at.includes('jog') || at.includes('sprint')) return { key: 'run', d };
  if (at.includes('walk') || at.includes('hike')) return { key: 'walk', d };
  if (at.includes('cycl') || at.includes('bike') || at.includes('spin')) return { key: 'cycling', d };
  if (at.includes('step') || at.includes('stair')) return { key: 'steps', d };
  return { key: 'other', d };
}

/**
 * Aggregates for workouts we are about to delete (same club/season scope as erasure DELETE).
 */
export async function computeErasureDeltaForUserClub(clubId, userId, conn = pool) {
  const cid = Number(clubId);
  const uid = Number(userId);
  if (!Number.isFinite(cid) || cid < 1 || !Number.isFinite(uid) || uid < 1) {
    return emptyRetainedStructure();
  }

  const [rows] = await conn.execute(
    `SELECT w.distance_value, w.points, w.duration_minutes, w.calories_burned,
            w.is_disqualified, w.proof_status, w.activity_type
     FROM challenge_workouts w
     INNER JOIN learning_program_classes lpc ON lpc.id = w.learning_class_id
     WHERE lpc.organization_id = ? AND w.user_id = ?`,
    [cid, uid]
  );

  const delta = emptyRetainedStructure();

  for (const w of rows || []) {
    const dist = Number(w.distance_value) || 0;
    const pts = Number(w.points) || 0;
    const dur = Number(w.duration_minutes) || 0;
    const cal = Number(w.calories_burned) || 0;
    const dq = dqOk(w.is_disqualified);
    const pr = proofOk(w.proof_status);

    delta.all.workoutCount += 1;
    delta.all.distance += dist;
    delta.all.points += pts;
    delta.all.durationMinutes += dur;
    delta.all.calories += cal;

    if (dq && pr) {
      delta.qual.workoutCount += 1;
      delta.qual.distance += dist;
      delta.qual.points += pts;
      delta.qual.durationMinutes += dur;
      delta.qual.calories += cal;
      const qb = bucketActivityMiles(w.activity_type, dist);
      if (qb) delta.qual.activityMiles[qb.key] += qb.d;
    }

    if (dq) {
      delta.rec.workoutCount += 1;
      delta.rec.distance += dist;
      delta.rec.points += pts;
      delta.rec.durationMinutes += dur;
      delta.rec.calories += cal;

      const at = String(w.activity_type || '').toLowerCase();
      if (at.includes('run') || at.includes('jog') || at.includes('sprint')) {
        delta.rec.runCount += 1;
        delta.rec.runMiles += dist;
      } else if (at.includes('ruck')) {
        delta.rec.ruckCount += 1;
        delta.rec.ruckMiles += dist;
      } else if (at.includes('walk') || at.includes('hike')) {
        delta.rec.walkCount += 1;
        delta.rec.walkMiles += dist;
      }

      const b = bucketActivityMiles(w.activity_type, dist);
      if (b) delta.rec.activityMiles[b.key] += b.d;
    }
  }

  return delta;
}

export async function loadRetainedTotalsForClub(clubId, conn = pool) {
  const cid = Number(clubId);
  if (!Number.isFinite(cid) || cid < 1) return emptyRetainedStructure();
  const [rows] = await conn.execute(
    'SELECT totals_json FROM summit_stats_club_erasure_retained_totals WHERE agency_id = ? LIMIT 1',
    [cid]
  );
  return parseStored(rows?.[0]?.totals_json);
}

export async function saveRetainedTotalsForClub(clubId, mergedObj, conn = pool) {
  const cid = Number(clubId);
  if (!Number.isFinite(cid) || cid < 1) return;
  const json = JSON.stringify(mergedObj);
  await conn.execute(
    `INSERT INTO summit_stats_club_erasure_retained_totals (agency_id, totals_json)
     VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE totals_json = VALUES(totals_json), updated_at = CURRENT_TIMESTAMP`,
    [cid, json]
  );
}
