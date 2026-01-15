/**
 * Billing period utilities (calendar month based).
 */

export function getCurrentBillingPeriod(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
  // Normalize to date-only semantics for DB storage
  const startDate = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const endDate = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
  return { periodStart: startDate, periodEnd: endDate };
}

export function getPreviousBillingPeriod(now = new Date()) {
  // Previous calendar month (e.g., if now is Feb 1, bill Jan 1 - Jan 31)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  return getCurrentBillingPeriod(prev);
}

export function formatPeriodLabel({ periodStart, periodEnd }) {
  const fmt = (d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return `${fmt(periodStart)} - ${fmt(periodEnd)}`;
}

