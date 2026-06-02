/** Helpers for My Payroll hub panel (stats, action required, claim status pills). */

const NEEDS_ACTION = new Set(['submitted', 'deferred', 'rejected']);

export function claimNeedsAction(row) {
  const s = String(row?.status || '').toLowerCase();
  return NEEDS_ACTION.has(s);
}

export function getClaimStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'paid' || s === 'applied') return 'Approved';
  if (s === 'deferred') return 'Needs changes';
  if (s === 'rejected') return 'Rejected';
  if (s === 'submitted') return 'Pending';
  if (s === 'withdrawn') return 'Withdrawn';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

export function getClaimStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'paid' || s === 'applied') return 'hub-pill--success';
  if (s === 'deferred' || s === 'submitted') return 'hub-pill--warning';
  if (s === 'rejected') return 'hub-pill--danger';
  return 'hub-pill--muted';
}

function sumPeriodPayYtd(periods) {
  const year = new Date().getFullYear();
  let total = 0;
  for (const p of periods || []) {
    const end = p?.period_end ? new Date(p.period_end) : null;
    if (end && !Number.isNaN(end.getTime()) && end.getFullYear() === year) {
      total += Number(p.total_amount || 0);
    }
  }
  return total;
}

function countPendingClaims(...lists) {
  let n = 0;
  for (const list of lists) {
    for (const row of list || []) {
      if (claimNeedsAction(row)) n += 1;
    }
  }
  return n;
}

export function computePayrollHubStats({
  periods = [],
  ptoBalances = {},
  ptoRequests = [],
  mileageClaims = [],
  reimbursementClaims = [],
  companyCardExpenses = [],
  timeClaims = [],
  medcancelClaims = [],
} = {}) {
  const pendingSubmissions = countPendingClaims(
    ptoRequests,
    mileageClaims,
    reimbursementClaims,
    companyCardExpenses,
    timeClaims,
    medcancelClaims
  );
  const sick = Number(ptoBalances.sickHours || 0);
  const training = Number(ptoBalances.trainingHours || 0);
  const latest = periods?.[0];
  return {
    totalPeriods: periods.length,
    pendingSubmissions,
    ytdPay: sumPeriodPayYtd(periods),
    ptoHoursTotal: sick + training,
    latestPeriodLabel: latest
      ? `${String(latest.period_start || '').slice(0, 10)} – ${String(latest.period_end || '').slice(0, 10)}`
      : null,
    latestPeriodPay: Number(latest?.total_amount || 0),
  };
}

function pushAction(out, row, { type, title }) {
  if (!row || !claimNeedsAction(row)) return;
  out.push({
    key: `${type}:${row.id}`,
    type,
    title: title || row.name || type,
    status: row.status,
    statusLabel: getClaimStatusLabel(row.status),
    statusClass: getClaimStatusBadgeClass(row.status),
  });
}

/** Format a raw date string (ISO or YYYY-MM-DD) to "Mon D, YYYY". */
function fmtActionDate(raw) {
  if (!raw) return null;
  // Take only the date portion to avoid timezone shifting
  const ymd = String(raw).slice(0, 10);
  const dt = new Date(ymd + 'T12:00:00');
  if (isNaN(dt)) return String(raw).slice(0, 10);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Items for the action-required banner (deferred / rejected / pending approval). */
export function getPayrollActionRequired({
  ptoRequests = [],
  mileageClaims = [],
  reimbursementClaims = [],
  companyCardExpenses = [],
  timeClaims = [],
  medcancelClaims = [],
  limit = 8,
} = {}) {
  const out = [];
  for (const r of ptoRequests) {
    pushAction(out, r, {
      type: 'pto',
      title: `PTO — ${String(r.request_type || '').toLowerCase() === 'training' ? 'Training' : 'Sick'} (${Number(r.total_hours || 0)}h)`,
    });
  }
  for (const r of mileageClaims) pushAction(out, r, { type: 'mileage', title: `Mileage — ${fmtActionDate(r.drive_date) || 'claim'}` });
  for (const r of reimbursementClaims) pushAction(out, r, { type: 'reimbursement', title: `Reimbursement — ${fmtActionDate(r.expense_date) || 'claim'}` });
  for (const r of companyCardExpenses) pushAction(out, r, { type: 'company_card', title: `Company card — ${fmtActionDate(r.expense_date) || 'claim'}` });
  for (const r of timeClaims) pushAction(out, r, { type: 'time_claims', title: `Time claim — ${fmtActionDate(r.claim_date) || 'claim'}` });
  for (const r of medcancelClaims) pushAction(out, r, { type: 'medcancel', title: `Med Cancel — ${fmtActionDate(r.claim_date) || 'claim'}` });

  const priority = { rejected: 3, deferred: 2, submitted: 1 };
  out.sort((a, b) => (priority[String(b.status).toLowerCase()] || 0) - (priority[String(a.status).toLowerCase()] || 0));
  return out.slice(0, limit);
}

export function formatPayrollMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}
