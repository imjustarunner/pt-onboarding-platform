/**
 * Direct/indirect banding for hourly workers: indirect *minutes* per clock hour of direct time.
 * Green: ≤9 min indirect per 1h direct. Yellow: >9 and <15 min. Red: ≥15 min (15+ min is flagged).
 */

export const DIRECT_INDIRECT_GREEN_MAX_MINUTES = 9;
export const DIRECT_INDIRECT_RED_MIN_MINUTES = 15;

/** @param {number|null|undefined} ratio indirect_hours / direct_hours */
export function directIndirectRatioKindFromRatio(ratio) {
  if (ratio === null || ratio === undefined) return 'green';
  if (!Number.isFinite(ratio)) return 'red';
  const minutesIndirectPerDirectHour = ratio * 60;
  if (minutesIndirectPerDirectHour <= DIRECT_INDIRECT_GREEN_MAX_MINUTES + 1e-9) return 'green';
  if (minutesIndirectPerDirectHour >= DIRECT_INDIRECT_RED_MIN_MINUTES - 1e-9) return 'red';
  return 'yellow';
}
