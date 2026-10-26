import pool from '../config/database.js';
import User from '../models/User.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';
import { isStudentIntern } from '../utils/studentIntern.js';
import { classifyPrelicensedStatus } from '../utils/credentialNormalization.js';

// Hourly employees who are not candidates do not use the candidate 50/100-hour gate.
// Keep explicit candidate classifications and unpaid internships on their existing path.
export async function resolveHourlySuperviseePay({ agencyId, userId, asOf = null, rateCard = undefined }) {
  const user = await User.findById(userId);
  if (Number(user?.is_hourly_worker) !== 1 || isStudentIntern(user)) return null;
  const [rows] = await pool.execute(
    'SELECT supervision_is_prelicensed FROM user_agencies WHERE agency_id = ? AND user_id = ? LIMIT 1',
    [agencyId, userId]
  );
  if (!rows[0] || Number(rows[0].supervision_is_prelicensed) === 1) return null;
  const classification = classifyPrelicensedStatus({ credential: user.credential, title: user.title, role: user.role });
  if (classification.classifiedAs === 'prelicensed') return null;
  const rate = await PayrollRate.findBestRate({ agencyId, userId, serviceCode: 'MEETING', asOf });
  const card = rateCard === undefined ? await PayrollRateCard.findForUser(agencyId, userId) : rateCard;
  // A configured zero is intentional; only a missing meeting rate uses the hourly card.
  const amount = Number(rate ? rate.rate_amount : card?.indirect_rate);
  return { payable: Number.isFinite(amount) && amount > 0, rateAmount: Number.isFinite(amount) ? amount : 0,
    rateSource: rate ? 'per_code_rate' : 'hourly_indirect_rate', serviceCode: 'MEETING' };
}
