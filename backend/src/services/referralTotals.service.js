import pool from '../config/database.js';

export const REFERRAL_TIMEZONE = 'America/Denver';
const ONLINE_SOURCES = "'PUBLIC_INTAKE_LINK', 'DIGITAL_FORM', 'PUBLIC_OFFICE_INTAKE'";
const DEMO_ORGANIZATIONS = 'demo|synthetic|hogwarts|durmstrang|fake-school|detention-academy|analytical-engine|onboarding-test|test-school|qa-';

// Use completed uploads as well as source labels: staff can attach a paper
// packet to an ADMIN_CREATED chart. Grouping uploads prevents retries or later
// packet replacements from counting the same child again.
export const REFERRAL_TOTALS_SQL = `
  SELECT c.id AS clientId,
    CASE WHEN c.source IN (${ONLINE_SOURCES})
      AND (p.received_at IS NULL OR c.created_at <= p.received_at)
      THEN 'online' ELSE 'paper' END AS channel,
    CASE WHEN c.source IN (${ONLINE_SOURCES})
      THEN LEAST(c.created_at, COALESCE(p.received_at, c.created_at))
      ELSE COALESCE(p.received_at, c.created_at) END AS receivedAt
  FROM clients c
  LEFT JOIN (
    SELECT created_client_id, MIN(submitted_at) AS received_at
    FROM referral_packet_upload_drafts
    WHERE status = 'submitted' AND submitted_at IS NOT NULL
    GROUP BY created_client_id
  ) p ON p.created_client_id = c.id
  LEFT JOIN agencies a ON a.id = c.agency_id
  LEFT JOIN agencies o ON o.id = c.organization_id
  WHERE c.agency_id = ?
    AND COALESCE(c.is_demo, 0) = 0
    AND COALESCE(c.created_via_dev_fill, 0) = 0
    AND LOWER(CONCAT(COALESCE(a.name, ''), ' ', COALESCE(a.slug, ''), ' ',
      COALESCE(o.name, ''), ' ', COALESCE(o.slug, ''))) NOT REGEXP ?
    AND (p.received_at IS NOT NULL
      OR c.source IN ('SCHOOL_UPLOAD', 'SCHOOL_UPLOAD_INTERNAL', ${ONLINE_SOURCES}))`;

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: REFERRAL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const localDay = (date) => {
  const parts = Object.fromEntries(localDateFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const shiftDay = (day, amount) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const monday = (day) => shiftDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
const emptyPeriod = (start, end) => ({ start, end, paper: 0, online: 0, total: 0 });

export function buildReferralTotals(rows, { now = new Date(), year } = {}) {
  const today = localDay(now);
  const currentYear = Number(today.slice(0, 4));
  const selectedYear = year == null ? currentYear : Number(year);
  if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > currentYear) {
    const error = new Error(`year must be between 2000 and ${currentYear}`);
    error.status = 400;
    throw error;
  }

  // Keep each child once, using their earliest received referral. Siblings on
  // one online submission have separate client IDs and each contribute one.
  const clients = new Map();
  for (const row of rows) {
    if (!row.receivedAt) continue;
    const receivedAt = new Date(row.receivedAt);
    if (!['paper', 'online'].includes(row.channel) || !Number.isFinite(receivedAt.getTime()) || receivedAt > now) continue;
    const previous = clients.get(row.clientId);
    if (!previous || receivedAt < previous.receivedAt) clients.set(row.clientId, { ...row, receivedAt });
  }
  const referrals = [...clients.values()].map(row => ({ day: localDay(row.receivedAt), channel: row.channel }));
  const totalFor = (start, end) => {
    const period = emptyPeriod(start, end);
    for (const row of referrals) {
      if (row.day >= start && row.day <= end) { period[row.channel]++; period.total++; }
    }
    return period;
  };

  const firstDay = `${selectedYear}-01-01`;
  const lastDay = selectedYear === currentYear ? today : `${selectedYear}-12-31`;
  const weekly = [];
  for (let start = monday(firstDay); start <= lastDay; start = shiftDay(start, 7)) {
    weekly.push(totalFor(start, shiftDay(start, 6)));
  }
  const monthly = [];
  for (let month = 1; month <= (selectedYear === currentYear ? Number(today.slice(5, 7)) : 12); month++) {
    const start = `${selectedYear}-${String(month).padStart(2, '0')}-01`;
    const next = new Date(Date.UTC(selectedYear, month, 1)).toISOString().slice(0, 10);
    monthly.push(totalFor(start, shiftDay(next, -1)));
  }
  const earliestYear = referrals.reduce((earliest, row) => Math.min(earliest, Number(row.day.slice(0, 4))), Math.min(currentYear, selectedYear));
  const weekStart = monday(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = new Date(Date.UTC(currentYear, Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return {
    timezone: REFERRAL_TIMEZONE, refreshedAt: now.toISOString(), today, selectedYear,
    years: Array.from({ length: currentYear - earliestYear + 1 }, (_, i) => currentYear - i),
    currentWeek: totalFor(weekStart, shiftDay(weekStart, 6)),
    currentMonth: totalFor(monthStart, shiftDay(nextMonth, -1)),
    yearTotal: totalFor(firstDay, `${selectedYear}-12-31`),
    // Weeks include the full Monday–Sunday interval, including boundary days
    // in an adjacent year. Monthly/year totals stay within the calendar year.
    weekly: weekly.reverse(), monthly: monthly.reverse()
  };
}

export async function getReferralTotals({ agencyId, year, now = new Date() }) {
  // Validate before issuing a potentially expensive query.
  buildReferralTotals([], { year, now });
  const [rows] = await pool.execute(REFERRAL_TOTALS_SQL, [agencyId, DEMO_ORGANIZATIONS]);
  return { agencyId, ...buildReferralTotals(rows, { year, now }) };
}
