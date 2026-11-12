import pool from '../config/database.js';

// Read the benefit tier saved by payroll (including grace), not a claim's
// optional employee selection or the tier currently being calculated.
export async function loadMileageBenefitTiers({ agencyId, userIds, periodEnd = '9999-12-31', db = pool }) {
  const ids = [...new Set(userIds.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const [rows] = await db.execute(`SELECT s.user_id, p.period_end,
      JSON_EXTRACT(s.breakdown, '$.__tier.tierLevel') AS tier_level
    FROM payroll_summaries s JOIN payroll_periods p ON p.id=s.payroll_period_id AND p.agency_id=s.agency_id
    WHERE s.agency_id=? AND s.user_id IN (${ids.map(() => '?').join(',')})
      AND p.status IN ('posted','finalized') AND p.period_end<=?
      AND NOT EXISTS (SELECT 1 FROM payroll_summaries newer
        JOIN payroll_periods np ON np.id=newer.payroll_period_id AND np.agency_id=newer.agency_id
        WHERE newer.agency_id=s.agency_id AND newer.user_id=s.user_id
          AND np.status IN ('posted','finalized') AND np.period_end<=?
          AND (np.period_end>p.period_end OR (np.period_end=p.period_end AND np.id>p.id)))`,
  [Number(agencyId), ...ids, String(periodEnd).slice(0,10), String(periodEnd).slice(0,10)]);
  return new Map(rows.map(row => [Number(row.user_id), {
    tierLevel: row.tier_level == null ? null : Number(row.tier_level), periodEnd: row.period_end
  }]));
}

export function resolveMileageBenefitTier(current, requested) {
  const selected = requested == null || requested === '' ? null : Number(requested);
  const entitled = current?.tierLevel;
  if (entitled != null && ![1,2,3].includes(entitled)) {
    throw Object.assign(new Error('The latest posted payroll does not show an eligible mileage benefit tier.'), { status:409 });
  }
  if (entitled != null && selected != null && selected !== entitled) {
    throw Object.assign(new Error(`The current mileage benefit is Tier ${entitled}. Refresh the claim and use that tier.`), { status:409 });
  }
  const tier = entitled ?? selected;
  if (![1,2,3].includes(tier)) throw Object.assign(new Error('No posted benefit tier is available. Choose the verified mileage tier.'), { status:400 });
  return tier;
}
