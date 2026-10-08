import pool from '../config/database.js';

export function mileageYearWindow(value = Number(new Intl.DateTimeFormat('en-US', {timeZone:'America/Denver',year:'numeric'}).format(new Date()))) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw Object.assign(new Error('Choose a valid calendar year.'), { status: 400 });
  }
  return { year, start: `${year}-01-01`, endExclusive: `${year + 1}-01-01` };
}

export function annualMileageLimit(agency) {
  // ITSCO's handbook policy. Do not apply another tenant's policy implicitly.
  return String(agency?.slug || '').toLowerCase() === 'itsco' ? 2000 : null;
}

export function summarizeAnnualMileage(row, limitDollars) {
  const amount = key => Math.round(Number(row[key] || 0) * 100) / 100;
  const paidDollars = amount('paid_dollars');
  const approvedDollars = amount('approved_dollars');
  const committedDollars = Math.round((paidDollars + approvedDollars) * 100) / 100;
  return {
    userId: Number(row.user_id), name: row.name,
    submittedCount: Number(row.submitted_count || 0), submittedMiles: amount('submitted_miles'),
    schoolClaimCount: Number(row.school_claim_count || 0), schoolMiles: amount('school_miles'),
    paidDollars, approvedDollars, committedDollars,
    remainingDollars: limitDollars == null ? null : Math.max(0, Math.round((limitDollars - paidDollars) * 100) / 100),
    overLimitDollars: limitDollars == null ? null : Math.max(0, Math.round((committedDollars - limitDollars) * 100) / 100),
    status: limitDollars == null ? 'unconfigured' : paidDollars >= limitDollars ? 'reached'
      : committedDollars >= limitDollars ? 'committed' : committedDollars >= limitDollars * .9 ? 'approaching' : 'within'
  };
}

// Caller must enforce payroll access. Never include this report in employee summaries.
export async function getAnnualMileageReport({ agencyId, agency, year }) {
  const window = mileageYearWindow(year);
  const [rows] = await pool.execute(`
    SELECT c.user_id, CONCAT_WS(' ', u.first_name, u.last_name) AS name,
      SUM(c.status = 'submitted') AS submitted_count,
      SUM(CASE WHEN c.status = 'submitted' THEN COALESCE(c.eligible_miles, c.miles, 0) ELSE 0 END) AS submitted_miles,
      SUM(c.claim_type = 'school_travel') AS school_claim_count,
      SUM(CASE WHEN c.claim_type = 'school_travel' THEN COALESCE(c.eligible_miles, c.miles, 0) ELSE 0 END) AS school_miles,
      SUM(CASE WHEN c.status = 'approved' AND COALESCE(p.status,'draft') NOT IN ('posted','finalized')
        THEN COALESCE(c.applied_amount, 0) ELSE 0 END) AS approved_dollars
    FROM payroll_mileage_claims c JOIN users u ON u.id = c.user_id
    LEFT JOIN payroll_periods p ON p.id=c.target_payroll_period_id AND p.agency_id=c.agency_id
    WHERE c.agency_id = ? AND c.drive_date >= ? AND c.drive_date < ?
      AND c.status IN ('submitted', 'approved', 'paid')
    GROUP BY c.user_id, u.first_name, u.last_name
    ORDER BY name, c.user_id`, [agencyId, window.start, window.endExclusive]);
  // Claims remain "approved" after payroll is posted. Count the canonical
  // payroll total once, including manual adjustments, rather than adding it to
  // the claims that already comprise that total. This is not bank settlement.
  const [payroll] = await pool.execute(`SELECT s.user_id, CONCAT_WS(' ',u.first_name,u.last_name) AS name,
    SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(s.breakdown,'$.__adjustments.mileageAmount')) AS DECIMAL(14,2)),0)) AS paid_dollars
    FROM payroll_summaries s JOIN payroll_periods p ON p.id=s.payroll_period_id AND p.agency_id=s.agency_id
    JOIN users u ON u.id=s.user_id
    WHERE s.agency_id=? AND p.period_end>=? AND p.period_end<? AND p.status IN ('posted','finalized')
    GROUP BY s.user_id,u.first_name,u.last_name`, [agencyId, window.start, window.endExclusive]);
  const byUser = new Map(rows.map(row => [Number(row.user_id), {...row, paid_dollars: 0}]));
  for (const row of payroll) {
    if (!Number(row.paid_dollars) && !byUser.has(Number(row.user_id))) continue;
    byUser.set(Number(row.user_id), {...byUser.get(Number(row.user_id)), ...row});
  }
  const limitDollars = annualMileageLimit(agency);
  return { ...window, limitDollars, basis: 'payroll_period_end', claimBasis: 'drive_date', trackingOnly: true,
    people: [...byUser.values()].map(row => summarizeAnnualMileage(row, limitDollars)).sort((a,b) => a.name.localeCompare(b.name)) };
}

export async function getSchoolMileageYearSummary({ agencyId, userId, year }) {
  const window = mileageYearWindow(year);
  const [[row]] = await pool.execute(`SELECT COUNT(*) AS claim_count,
    COALESCE(SUM(COALESCE(eligible_miles, miles, 0)), 0) AS miles
    FROM payroll_mileage_claims WHERE agency_id = ? AND user_id = ?
      AND claim_type = 'school_travel' AND status IN ('submitted', 'approved', 'paid')
      AND drive_date >= ? AND drive_date < ?`, [agencyId, userId, window.start, window.endExclusive]);
  return { year: window.year, claimCount: Number(row.claim_count), miles: Number(row.miles) };
}
