import pool from '../config/database.js';
import User from '../models/User.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';

// Hourly employees are paid for eligible supervision regardless of candidate status.
export async function resolveHourlySuperviseePay({ agencyId, userId, asOf = null, rateCard = undefined }) {
  const user = await User.findById(userId);
  if (Number(user?.is_hourly_worker) !== 1) return null;
  const [rows] = await pool.execute(
    'SELECT user_id FROM user_agencies WHERE agency_id = ? AND user_id = ? LIMIT 1',
    [agencyId, userId]
  );
  if (!rows[0]) return null;
  const rate = await PayrollRate.findBestRate({ agencyId, userId, serviceCode: 'MEETING', asOf });
  const card = rateCard === undefined ? await PayrollRateCard.findForUser(agencyId, userId) : rateCard;
  // A configured zero is intentional; only a missing meeting rate uses the hourly card.
  const amount = Number(rate ? rate.rate_amount : card?.indirect_rate);
  return { payable: Number.isFinite(amount) && amount > 0, rateAmount: Number.isFinite(amount) ? amount : 0,
    rateSource: rate ? 'per_code_rate' : 'hourly_indirect_rate', serviceCode: 'MEETING' };
}
