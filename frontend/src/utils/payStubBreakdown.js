/**
 * Normalize a payroll period ID to a plain number for stable comparison.
 * Handles string IDs, number IDs, and null/undefined.
 */
export function normalizePeriodId(id) {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Format a money amount as $X,XXX.XX
 */
export function formatMoney(val) {
  const n = Number(val ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

/**
 * Format a number with up to 2 decimal places, trimming trailing zeros.
 */
export function formatNum(val) {
  const n = Number(val ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
}

/**
 * Format a date range from two ISO date strings.
 */
export function formatDateRange(start, end) {
  const fmt = (d) => {
    if (!d) return '?';
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return `${fmt(start)} → ${fmt(end)}`;
}

/**
 * Sum direct and indirect pay totals from a breakdown object.
 */
export function payTotalsFromBreakdown(breakdown) {
  if (!breakdown) return { directAmount: 0, indirectAmount: 0 };
  let directAmount = 0;
  let indirectAmount = 0;
  for (const [key, val] of Object.entries(breakdown)) {
    if (key.startsWith('__')) continue;
    if (!val || typeof val !== 'object') continue;
    const amt = Number(val.amount ?? 0);
    if (val.serviceType === 'indirect' || val.indirect) {
      indirectAmount += amt;
    } else {
      directAmount += amt;
    }
  }
  return { directAmount, indirectAmount };
}

/**
 * Extract service lines from a breakdown for display in a table.
 */
export function serviceLines(breakdown) {
  if (!breakdown) return [];
  return Object.entries(breakdown)
    .filter(([key]) => !key.startsWith('__'))
    .map(([code, val]) => ({
      code,
      noNoteUnits: val?.noNoteUnits ?? 0,
      draftUnits: val?.draftUnits ?? 0,
      finalizedUnits: val?.finalizedUnits ?? val?.units ?? 0,
      hours: val?.hours ?? 0,
      rateAmount: val?.rateAmount ?? 0,
      amount: val?.amount ?? 0,
    }))
    .filter((l) => l.finalizedUnits > 0 || l.amount !== 0);
}
