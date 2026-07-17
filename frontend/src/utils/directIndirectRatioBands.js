/**
 * Mirror of backend/src/utils/directIndirectRatioBands.js
 * Indirect minutes per clock hour of direct time.
 * Green ≤9 (~15%), yellow middle, red ≥15 (~25%).
 */

export const DIRECT_INDIRECT_GREEN_MAX_MINUTES = 9;
export const DIRECT_INDIRECT_RED_MIN_MINUTES = 15;

export const DIRECT_INDIRECT_GREEN_MAX_PCT = Math.round(
  (DIRECT_INDIRECT_GREEN_MAX_MINUTES / 60) * 100
); // 15
export const DIRECT_INDIRECT_RED_MIN_PCT = Math.round(
  (DIRECT_INDIRECT_RED_MIN_MINUTES / 60) * 100
); // 25

/** Direct minutes needed so `indirectMinutes / directMinutes` stays at/under green. */
export function directMinutesForGreen(indirectMinutes) {
  const i = Math.max(0, Number(indirectMinutes) || 0);
  if (i <= 0) return 0;
  return Math.ceil(i * (60 / DIRECT_INDIRECT_GREEN_MAX_MINUTES));
}

/** Direct minutes needed to stay under the red band. */
export function directMinutesForAvoidRed(indirectMinutes) {
  const i = Math.max(0, Number(indirectMinutes) || 0);
  if (i <= 0) return 0;
  return Math.ceil(i * (60 / DIRECT_INDIRECT_RED_MIN_MINUTES));
}

export function directIndirectRatioKindFromRatio(ratio) {
  if (ratio === null || ratio === undefined) return 'green';
  if (!Number.isFinite(ratio)) return 'red';
  const minutesIndirectPerDirectHour = ratio * 60;
  if (minutesIndirectPerDirectHour <= DIRECT_INDIRECT_GREEN_MAX_MINUTES + 1e-9) return 'green';
  if (minutesIndirectPerDirectHour >= DIRECT_INDIRECT_RED_MIN_MINUTES - 1e-9) return 'red';
  return 'yellow';
}
