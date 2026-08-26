/** @typedef {{ months: number, label: string }} DurationParse */

const DURATION_PRESETS = [1, 2, 3, 4, 6, 9, 12, 18, 24];

export { DURATION_PRESETS };

/**
 * @param {number|null|undefined} months
 * @param {Date|string} [fromDate]
 * @returns {string|null} YYYY-MM-DD
 */
export function completionDateFromDurationMonths(months, fromDate = new Date()) {
  const m = Number(months);
  if (!Number.isFinite(m) || m < 1) return null;
  const base = fromDate instanceof Date ? new Date(fromDate) : new Date(fromDate);
  if (Number.isNaN(base.getTime())) return null;
  const d = new Date(base);
  d.setMonth(d.getMonth() + Math.round(m));
  return d.toISOString().slice(0, 10);
}

export function durationLabel(months) {
  const m = Number(months);
  if (!Number.isFinite(m) || m < 1) return '';
  return `${m} month${m === 1 ? '' : 's'}`;
}

export function formatDurationPreview(months, fromDate = new Date()) {
  const iso = completionDateFromDurationMonths(months, fromDate);
  if (!iso) return '';
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function isObjectiveScaleValid(scaleCurrent, scaleTarget) {
  const cur = Number(scaleCurrent);
  const tgt = Number(scaleTarget);
  return (
    Number.isInteger(cur)
    && Number.isInteger(tgt)
    && cur >= 1
    && cur <= 10
    && tgt >= 1
    && tgt <= 10
    && cur !== tgt
  );
}

export const DEFAULT_MEASUREMENT_METHOD = '1–10 scale (client self-report)';
