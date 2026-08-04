import {
  claimNeedsAction,
  getClaimStatusBadgeClass,
  getClaimStatusLabel,
} from './payrollUiHelpers';

function parseMs(raw) {
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function fmtShortDate(raw) {
  if (!raw) return '';
  const ymd = String(raw).slice(0, 10);
  const dt = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeRow({ id, groupId, type, typeLabel, title, dateRaw, status, sortMs }) {
  const st = String(status || '').toLowerCase();
  const isPending = claimNeedsAction({ status: st }) || st === 'pending' || st === 'pending_approval';
  return {
    id: String(id),
    groupId,
    type,
    typeLabel,
    title,
    dateLabel: fmtShortDate(dateRaw),
    status: st,
    statusLabel: getClaimStatusLabel(st),
    statusClass: getClaimStatusBadgeClass(st),
    isPending,
    sortMs: sortMs || parseMs(dateRaw),
  };
}

export function normalizeMileageClaims(rows = [], { schoolOnly = false } = {}) {
  return (rows || [])
    .filter((r) => {
      const isSchool = String(r.claim_type || '').toLowerCase() === 'school_travel';
      return schoolOnly ? isSchool : !isSchool;
    })
    .map((r) =>
      normalizeRow({
        id: `mileage:${r.id}`,
        groupId: schoolOnly ? 'in_school' : 'payroll',
        type: schoolOnly ? 'school_mileage' : 'mileage',
        typeLabel: schoolOnly ? 'School mileage' : 'Mileage',
        title: schoolOnly ? 'School mileage' : 'Mileage',
        dateRaw: r.drive_date || r.created_at,
        status: r.status,
        sortMs: parseMs(r.created_at || r.drive_date),
      })
    );
}

export function normalizeReimbursementClaims(rows = []) {
  return (rows || []).map((r) =>
    normalizeRow({
      id: `reimbursement:${r.id}`,
      groupId: 'payroll',
      type: 'reimbursement',
      typeLabel: 'Reimbursement',
      title: r.vendor ? `Reimbursement — ${r.vendor}` : 'Reimbursement',
      dateRaw: r.expense_date || r.created_at,
      status: r.status,
      sortMs: parseMs(r.created_at || r.expense_date),
    })
  );
}

export function normalizePtoRequests(rows = []) {
  return (rows || []).map((r) => {
    const kind = String(r.request_type || '').toLowerCase() === 'training' ? 'Training PTO' : 'Sick leave';
    return normalizeRow({
      id: `pto:${r.id}`,
      groupId: 'payroll',
      type: 'pto',
      typeLabel: 'PTO',
      title: `${kind} — ${Number(r.total_hours || 0)}h`,
      dateRaw: r.start_date || r.created_at,
      status: r.status,
      sortMs: parseMs(r.created_at || r.start_date),
    });
  });
}

export function normalizeCompanyCardExpenses(rows = []) {
  return (rows || []).map((r) =>
    normalizeRow({
      id: `company_card:${r.id}`,
      groupId: 'payroll',
      type: 'company_card',
      typeLabel: 'Company card',
      title: r.vendor ? `Company card — ${r.vendor}` : 'Company card expense',
      dateRaw: r.expense_date || r.created_at,
      status: r.status,
      sortMs: parseMs(r.created_at || r.expense_date),
    })
  );
}

export function normalizeBudgetExpenses(rows = []) {
  return (rows || []).map((r) => {
    const st = String(r.status || '').toLowerCase();
    const mapped =
      st === 'pending_approval' ? 'submitted' : st === 'approved' ? 'approved' : st === 'rejected' ? 'rejected' : st;
    return normalizeRow({
      id: `budget:${r.id}`,
      groupId: 'payroll',
      type: 'budget',
      typeLabel: 'Budget expense',
      title: r.vendor ? `Budget — ${r.vendor}` : 'Budget expense',
      dateRaw: r.expense_date || r.created_at,
      status: mapped,
      sortMs: parseMs(r.created_at || r.expense_date),
    });
  });
}

function timeClaimDisplayTitle(r) {
  const t = String(r.claim_type || r.type || 'claim').toLowerCase();
  const payload = r.payload || r.payload_json || {};
  const parsed = typeof payload === 'string'
    ? (() => { try { return JSON.parse(payload); } catch { return {}; } })()
    : payload;
  if (t === 'indirect_time') {
    const cat = String(parsed.categoryLabel || '').trim();
    const activity = parsed.allocations?.[0]?.serviceTypeLabel;
    if (cat && activity) return `${cat} — ${activity}`;
    if (cat) return cat;
    if (activity) return `Log Time — ${activity}`;
    return 'Log Time';
  }
  if (t === 'meeting_training') {
    const cat = String(parsed.categoryLabel || '').trim();
    if (cat) return cat;
    const mt = String(parsed.meetingType || '').trim();
    if (mt) return `Auto meeting — ${mt}`;
    return 'Auto meeting';
  }
  return `Time claim — ${t.replace(/_/g, ' ')}`;
}

export function normalizeTimeClaims(rows = []) {
  return (rows || []).map((r) =>
    normalizeRow({
      id: `time:${r.id}`,
      groupId: 'time',
      type: 'time_claim',
      typeLabel: 'Time claim',
      title: timeClaimDisplayTitle(r),
      dateRaw: r.claim_date || r.created_at,
      status: r.status,
      sortMs: parseMs(r.created_at || r.claim_date),
    })
  );
}

export function normalizeEventTimeSessions(sessions = []) {
  const out = [];
  for (const s of sessions || []) {
    const statuses = [
      { key: 'direct', status: s.directClaimStatus, label: 'Direct' },
      { key: 'indirect', status: s.indirectClaimStatus, label: 'Indirect' },
    ];
    for (const part of statuses) {
      const st = String(part.status || '').toLowerCase();
      if (!st) continue;
      out.push(
        normalizeRow({
          id: `event_time:${s.punchInId}:${part.key}`,
          groupId: 'time',
          type: 'event_time',
          typeLabel: 'Event time',
          title: `Event time — ${part.label}`,
          dateRaw: s.clockInAt || s.sessionDate,
          status: st,
          sortMs: parseMs(s.clockInAt || s.sessionDate),
        })
      );
    }
  }
  return out;
}

export function normalizeMedcancelClaims(rows = []) {
  return (rows || []).map((r) =>
    normalizeRow({
      id: `medcancel:${r.id}`,
      groupId: 'in_school',
      type: 'medcancel',
      typeLabel: 'Med Cancel',
      title: 'Med Cancel',
      dateRaw: r.claim_date || r.created_at,
      status: r.status,
      sortMs: parseMs(r.created_at || r.claim_date),
    })
  );
}

export function normalizeCompanyCarTrips(trips = []) {
  return (trips || []).map((r) =>
    normalizeRow({
      id: `company_car:${r.id}`,
      groupId: 'vehicle',
      type: 'company_car',
      typeLabel: 'Company car',
      title: r.destination_label || r.destinationLabel || 'Company car trip',
      dateRaw: r.drive_date || r.driveDate || r.created_at,
      status: 'logged',
      sortMs: parseMs(r.drive_date || r.driveDate || r.created_at),
    })
  );
}

/** Group items for one submit section, then by submission type. */
export function groupSubmissionHistory(items, groupId, { pendingLimit = 4, historyLimit = 3 } = {}) {
  const scoped = (items || []).filter((i) => i.groupId === groupId);
  const byType = new Map();
  for (const item of scoped) {
    if (!byType.has(item.type)) {
      byType.set(item.type, { type: item.type, typeLabel: item.typeLabel, items: [] });
    }
    byType.get(item.type).items.push(item);
  }

  const blocks = [];
  for (const block of byType.values()) {
    const sorted = block.items.sort((a, b) => {
      if (a.isPending !== b.isPending) return a.isPending ? -1 : 1;
      return (b.sortMs || 0) - (a.sortMs || 0);
    });
    const pending = sorted.filter((i) => i.isPending);
    const decided = sorted.filter((i) => !i.isPending);
    const visible = [
      ...pending.slice(0, pendingLimit),
      ...decided.slice(0, historyLimit),
    ];
    const hiddenCount = sorted.length - visible.length;
    blocks.push({
      type: block.type,
      typeLabel: block.typeLabel,
      items: visible,
      totalCount: sorted.length,
      pendingCount: pending.length,
      hasMore: hiddenCount > 0,
      hiddenCount,
    });
  }

  blocks.sort((a, b) => {
    if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
    return String(a.typeLabel).localeCompare(String(b.typeLabel));
  });

  return blocks;
}

const REVIEWED_SUBMISSION_STATUSES = new Set(['approved', 'paid', 'applied', 'rejected', 'deferred']);

function submissionNavTarget() {
  return 'payroll';
}

/** Recent payroll/submit claims with a decided status for dashboard Recent Activity. */
export function buildRecentSubmissionActivityItems({
  timeClaims = [],
  mileageClaims = [],
  ptoRequests = [],
  reimbursementClaims = [],
  companyCardExpenses = [],
  medcancelClaims = [],
  limit = 8,
  maxAgeDays = 60,
} = {}) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const normalized = [
    ...normalizeTimeClaims(timeClaims),
    ...normalizeMileageClaims(mileageClaims),
    ...normalizePtoRequests(ptoRequests),
    ...normalizeReimbursementClaims(reimbursementClaims),
    ...normalizeCompanyCardExpenses(companyCardExpenses),
    ...normalizeMedcancelClaims(medcancelClaims),
  ].filter((item) => REVIEWED_SUBMISSION_STATUSES.has(item.status) && (item.sortMs || 0) >= cutoff);

  return normalized
    .sort((a, b) => (b.sortMs || 0) - (a.sortMs || 0))
    .slice(0, limit)
    .map((item) => {
      const st = item.status;
      let title = `${item.typeLabel} ${item.statusLabel}`;
      let subtitle = item.dateLabel || '';
      if (st === 'deferred') subtitle = `${subtitle ? `${subtitle} · ` : ''}Sent back — update and resubmit`;
      else if (st === 'rejected') subtitle = `${subtitle ? `${subtitle} · ` : ''}See My Payroll for details`;
      else if (st === 'approved' || st === 'paid' || st === 'applied') {
        subtitle = `${subtitle ? `${subtitle} · ` : ''}Approved for payroll`;
      }
      return {
        id: item.id,
        type: item.type,
        title,
        subtitle,
        sortMs: item.sortMs,
        status: st,
        statusClass: item.statusClass,
        unread: st === 'rejected' || st === 'deferred',
        navTarget: submissionNavTarget(item.type),
      };
    });
}
