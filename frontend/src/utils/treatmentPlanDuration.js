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

/**
 * Extract 1–10 current/target from AI or paste objective text.
 * Mirrors backend treatmentPlanImport.service.parseScalePair.
 */
export function parseScalePair(text) {
  const s = String(text || '');

  const outOfTen = s.match(
    /(?:from\s+a\s+)?current\s+level\s+of\s+(\d{1,2})\s+out\s+of\s+10\s+\bto\b\s+(?:a\s+)?(?:target\s+level\s+of\s+)?(\d{1,2})(?:\s+out\s+of\s+10)?/i
  );
  if (outOfTen) {
    const current = Number(outOfTen[1]);
    const target = Number(outOfTen[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  const slashPair = s.match(
    /(\d{1,2})\s*\/\s*10\s*(?:→|->|\bto\b)\s*(?:a\s+)?(?:target\s+level\s+of\s+)?(\d{1,2})(?:\s*\/\s*10)?/i
  );
  if (slashPair) {
    const current = Number(slashPair[1]);
    const target = Number(slashPair[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  const fromTo = s.match(
    /(?:from\s+a\s+)?(?:current|baseline)[^0-9]{0,40}?(\d{1,2})\s*(?:or below|or less)?(?:\s+out\s+of\s+10)?[^0-9]{0,30}?\bto\b\s*(?:a\s+)?(?:target\s+level\s+of\s+)?(\d{1,2})/i
  );
  if (fromTo) {
    const current = Number(fromTo[1]);
    const target = Number(fromTo[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  const arrow = s.match(/(\d{1,2})\s*(?:→|->|\bto\b)\s*(?:a\s+)?(\d{1,2})/i);
  if (arrow) {
    const current = Number(arrow[1]);
    const target = Number(arrow[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  const labeled = s.match(
    /current(?:\s+level\s+of|\s+)[^0-9]*(\d{1,2})(?:\s+out\s+of\s+10)?[^0-9]*?(?:goal|target)[^0-9]*(\d{1,2})/i
  );
  if (labeled) {
    const current = Number(labeled[1]);
    const target = Number(labeled[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  const currentOnly = s.match(
    /(?:current\s+level\s+of|currently\s+(?:functions|reports)?\s*(?:at\s+)?(?:a\s+)?level\s*(?:of\s*)?|baseline\s*(?:of\s*)?)(\d{1,2})(?:\s+out\s+of\s+10)?/i
  );
  const targetOnly = s.match(
    /(?:target\s+level\s+of|achieving\s+(?:a\s+)?level\s*(?:of\s*)?|(?:^|\s)target\s*(?:level\s*(?:of\s*)?)?|(?:^|\s)goal\s*(?:level\s*(?:of\s*)?)?)(\d{1,2})(?:\s+out\s+of\s+10)?/i
  );
  if (currentOnly || targetOnly) {
    const current = currentOnly ? Number(currentOnly[1]) : null;
    const target = targetOnly ? Number(targetOnly[1]) : null;
    if (
      (current == null || (current >= 1 && current <= 10))
      && (target == null || (target >= 1 && target <= 10))
    ) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }
  return { scaleCurrent: null, scaleTarget: null };
}

export function inferScaleDirection(scaleCurrent, scaleTarget, explicit = null) {
  const cur = Number(scaleCurrent);
  const tgt = Number(scaleTarget);
  if (Number.isFinite(cur) && Number.isFinite(tgt) && cur !== tgt) {
    if (tgt > cur) return 'increase';
    if (tgt < cur) return 'decrease';
  }
  const dir = String(explicit || '').toLowerCase();
  if (dir === 'increase' || dir === 'decrease') return dir;
  return null;
}
