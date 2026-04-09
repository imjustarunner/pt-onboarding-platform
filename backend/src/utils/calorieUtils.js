/**
 * Calorie utilities for Summit Stats workouts.
 *
 * Anti-cheat design:
 *  - We NEVER use user-reported body weight for calculations — it's the easiest
 *    thing to inflate to pump up calorie credit.
 *  - For Strava / device imports we TRUST but VERIFY: use the reported value as
 *    a starting point, then cap it against evidence-based per-mile and per-minute
 *    ceilings. Garmin/Polar watches famously over-report by 15–40%.
 *  - For manual (no device) entries we ESTIMATE using standardized activity
 *    coefficients at a "typical recreational athlete" level.
 *  - Both paths produce a "plausible max" that a genuine athlete could achieve
 *    without exotic physiology, making fabrication pointless.
 */

// ── Per-mile calorie ceilings by activity type ───────────────────────────────
// Derived from peer-reviewed MET tables at 70 kg (154 lb) — roughly the median
// adult exerciser. Even large athletes hit diminishing returns per mile.
const MAX_CAL_PER_MILE = {
  run:     145,  // running (all paces)
  ruck:    190,  // rucking — extra load ~+30% vs running
  walk:     95,  // brisk walking
  hike:    110,  // hiking with elevation
  cycl:     55,  // road/stationary cycling (distance reported in miles)
  bike:     55,
  swim:    120,  // per pool mile (rarely reported accurately)
  row:     130,  // rowing ergometer per mile
  ellip:    90,  // elliptical
  step:     85,  // step/stair workouts
};

// Absolute ceiling per minute regardless of distance (~1 200 cal/hr = elite cardio threshold)
const MAX_CAL_PER_MIN = 20;

// Minimum plausible calories for a 1-mile / 1-minute unit (avoids zero-inflate divide tricks)
const MIN_CAL_PER_MILE = 30;
const MIN_CAL_PER_MIN  = 2;

// ── Estimation coefficients (standardised MET × 70 kg ÷ 60) cal/mile ────────
// Used when NO device calories are available. Based on moderate-effort MET values.
const EST_CAL_PER_MILE = {
  run:   100,  // ~MET 8.5
  ruck:  130,  // ~MET 11 (weighted march)
  walk:   75,  // ~MET 3.5
  hike:   90,  // ~MET 5.5
  cycl:   45,
  bike:   45,
  swim:   95,
  row:   110,
  ellip:  70,
  step:   70,
};
const EST_CAL_PER_MIN_FALLBACK = 8; // ~480 cal/hr for generic moderate cardio

/**
 * Resolve the activity bucket from a free-text activity_type string.
 * @param {string} activityType
 * @returns {string} bucket key
 */
function activityBucket(activityType) {
  const at = String(activityType || '').toLowerCase();
  if (at.includes('ruck'))           return 'ruck';
  if (at.includes('run') || at.includes('jog') || at.includes('sprint')) return 'run';
  if (at.includes('walk'))           return 'walk';
  if (at.includes('hike') || at.includes('trail')) return 'hike';
  if (at.includes('cycl') || at.includes('bike') || at.includes('spin')) return 'cycl';
  if (at.includes('swim'))           return 'swim';
  if (at.includes('row'))            return 'row';
  if (at.includes('ellip') || at.includes('cross')) return 'ellip';
  if (at.includes('step') || at.includes('stair')) return 'step';
  return 'run'; // default to run bucket (most common / middle-ground)
}

/**
 * Sanitize device-reported calories (Strava, Garmin, Polar, etc.).
 *
 * Returns the LOWER of:
 *   (a) the device-reported value, and
 *   (b) the evidence-based per-mile/per-minute ceiling for this activity
 *
 * If calories were capped the returned object includes `capped: true` so
 * callers can flag it for manager visibility.
 *
 * @param {object} opts
 * @param {number|null} opts.calories       Device-reported calories
 * @param {string}      opts.activityType   Activity type string
 * @param {number}      opts.distanceMiles  Distance in miles (0 if unknown)
 * @param {number}      opts.durationMinutes Minutes active (0 if unknown)
 * @returns {{ calories: number|null, capped: boolean }}
 */
export function sanitizeCalories({ calories, activityType, distanceMiles, durationMinutes }) {
  const raw = Number(calories);
  if (!raw || raw <= 0 || !Number.isFinite(raw)) return { calories: null, capped: false };

  const bucket = activityBucket(activityType);
  const dist   = Math.max(0, Number(distanceMiles || 0));
  const dur    = Math.max(0, Number(durationMinutes || 0));

  let ceiling = Infinity;

  // Distance-based ceiling
  if (dist > 0) {
    const perMile = MAX_CAL_PER_MILE[bucket] ?? 145;
    ceiling = Math.min(ceiling, dist * perMile);
  }

  // Duration-based ceiling (belt-and-suspenders)
  if (dur > 0) {
    ceiling = Math.min(ceiling, dur * MAX_CAL_PER_MIN);
  }

  // If we have no distance or duration data, accept the raw value up to a
  // flat sanity ceiling (90-minute full-throttle session = 1 800 cal).
  if (ceiling === Infinity) ceiling = 1800;

  const capped   = Number.isFinite(ceiling) && raw > ceiling;
  const sanitized = capped ? Math.round(ceiling) : Math.round(raw);

  return { calories: sanitized, capped };
}

/**
 * Estimate calories for workouts where NO device data is available.
 *
 * Uses distance-first, then duration-fallback.
 * Does NOT use body weight — this is intentional.
 *
 * @param {object} opts
 * @param {string} opts.activityType
 * @param {number} opts.distanceMiles
 * @param {number} opts.durationMinutes
 * @returns {number|null}
 */
export function estimateCalories({ activityType, distanceMiles, durationMinutes }) {
  const bucket = activityBucket(activityType);
  const dist   = Math.max(0, Number(distanceMiles || 0));
  const dur    = Math.max(0, Number(durationMinutes || 0));

  if (dist > 0) {
    const perMile = EST_CAL_PER_MILE[bucket] ?? 90;
    return Math.round(dist * perMile);
  }
  if (dur > 0) {
    return Math.round(dur * EST_CAL_PER_MIN_FALLBACK);
  }
  return null;
}
