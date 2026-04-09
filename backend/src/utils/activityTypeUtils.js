/**
 * Canonical activity-type helpers.
 *
 * Strava reports "Run", "Running", "VirtualRun", etc.
 * Our season settings store short canonical forms like "run", "ruck", "cycling".
 * Use normalizeActivityType() everywhere so they always match.
 */

const ACTIVITY_ALIASES = {
  // Run variants
  run: 'run', running: 'run', jog: 'run', jogging: 'run',
  virtualrun: 'run', treadmill: 'run',
  // Ruck variants
  ruck: 'ruck', rucking: 'ruck',
  // Walk/hike variants
  walk: 'walk', walking: 'walk', hike: 'walk', hiking: 'walk',
  // Cycling
  cycling: 'cycling', cycle: 'cycling', ride: 'cycling', biking: 'cycling',
  virtualride: 'cycling',
  // Steps
  steps: 'steps', stair: 'steps', stairclimber: 'steps',
  // Workout session catch-all
  workout: 'workout_session', workout_session: 'workout_session',
};

/**
 * Normalize an activity type string to its canonical form.
 * Unknown types are returned as-is (lowercased).
 */
export function normalizeActivityType(raw) {
  if (!raw) return '';
  const key = String(raw).toLowerCase().replace(/[^a-z_]/g, '');
  return ACTIVITY_ALIASES[key] || key;
}

/**
 * Return true if two activity type strings resolve to the same canonical type.
 */
export function activityTypesMatch(a, b) {
  return normalizeActivityType(a) === normalizeActivityType(b);
}
