import pool from '../config/database.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';
import { loadUserPaySystemContext } from './paySystem.service.js';
import { roleCompensationRate } from './roleCompensationRate.js';

export const MEETING_RATE_TYPES = {
  support_activity: 'Support Activity',
  admin_time: 'Administrative time',
  indirect: 'Indirect time',
  custom: 'Custom hourly rate'
};
export const canManageMeetingCompensation = user => ['admin', 'super_admin', 'superadmin'].includes(String(user?.role || '').toLowerCase());
const positiveRate = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const fail = (status, message) => Object.assign(new Error(message), { status, statusCode: status });

export async function getMeetingClaimRateOverride(claim) {
  if (!claim.id) return null;
  try {
    const [rows] = await pool.execute(
      'SELECT rate_type, hourly_rate, reason FROM meeting_claim_rate_overrides WHERE claim_id=? AND agency_id=? AND user_id=?',
      [claim.id, claim.agency_id, claim.user_id]
    );
    return rows[0] || null;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

export async function meetingClaimHourlyRate(claim, override = undefined) {
  const chosen = override === undefined ? await getMeetingClaimRateOverride(claim) : override;
  if (chosen?.rate_type === 'custom') return positiveRate(chosen.hourly_rate);
  const code = ({ support_activity: 'MEETING', admin_time: 'Admin Time', indirect: 'INDIRECT' })[chosen?.rate_type]
    || claim.payload?.serviceCode || 'MEETING';
  if (code === 'Unpaid Indirect') return 0;
  const ctx = await loadUserPaySystemContext({ agencyId: Number(claim.agency_id), userId: Number(claim.user_id), periodEnd: claim.claim_date });
  if (ctx?.enabled) {
    const key = code === 'MEETING' ? 'supportActivityRate' : code === 'INDIRECT' ? 'indirectRate' : null;
    const rate = key
      ? (ctx.status?.useReducedRates ? ctx.rateProfile?.[key + 'Probation'] ?? ctx.rateProfile?.[key] : ctx.rateProfile?.[key])
      : roleCompensationRate(ctx.rateProfile?.roleCompensation, code, claim.payload);
    if (positiveRate(rate) != null) return Number(rate);
    if (key || code === 'Admin Time') return null;
  }
  if (code === 'INDIRECT') {
    const card = await PayrollRateCard.findForUser(claim.agency_id, claim.user_id);
    return positiveRate(card?.indirect_rate);
  }
  const best = await PayrollRate.findBestRate({ agencyId: Number(claim.agency_id), userId: Number(claim.user_id), serviceCode: code, asOf: claim.claim_date });
  return positiveRate(best?.rate_amount ?? best?.rate);
}

export async function meetingClaimCompensation(claim) {
  const override = await getMeetingClaimRateOverride(claim);
  const hourlyRate = await meetingClaimHourlyRate(claim, override);
  const rateType = override?.rate_type || 'default';
  const trainingOverride = claim.payload?.trainingCompensationOverride;
  const rateLabel = MEETING_RATE_TYPES[rateType] || (trainingOverride?.rateType === 'admin_time' && claim.payload?.serviceCode === 'Admin Time' ? 'Administrative time (training override)' : null) || ({ MEETING: 'Support Activity', 'Admin Time': 'Administrative time', INDIRECT: 'Indirect time' })[claim.payload?.serviceCode]
    || claim.payload?.serviceCode || 'Support Activity';
  return {
    rateType, rateLabel, hourlyRate, reason: override?.reason || trainingOverride?.reason || '',
    estimatedAmount: hourlyRate == null ? null : Math.round(hourlyRate * Number(claim.payload?.totalMinutes || 0) / 60 * 100) / 100,
    appliedAmount: claim.applied_amount == null ? null : Number(claim.applied_amount)
  };
}

// The caller verifies event access; all claim ownership/status checks are repeated under a row lock.
export async function saveMeetingClaimRate({ actor, event, claimId, rateType, hourlyRate, reason }) {
  if (!canManageMeetingCompensation(actor)) throw fail(403, 'Only admins and superadmins can change meeting compensation.');
  if (rateType !== 'default' && !Object.hasOwn(MEETING_RATE_TYPES, rateType)) throw fail(400, 'Choose a valid pay category.');
  const note = String(reason || '').trim();
  if (!note || note.length > 500) throw fail(400, 'Add an adjustment reason of 1–500 characters.');
  const customRate = rateType === 'custom' ? positiveRate(hourlyRate) : null;
  if (rateType === 'custom' && (customRate == null || customRate > 10000)) throw fail(400, 'Enter an hourly rate greater than $0 and no more than $10,000.');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.execute('SELECT * FROM payroll_time_claims WHERE id=? AND agency_id=? FOR UPDATE', [claimId, event.agency_id]);
    const claim = rows[0];
    if (!claim) throw fail(404, 'Time claim not found.');
    claim.payload = typeof claim.payload_json === 'string' ? JSON.parse(claim.payload_json) : claim.payload_json || {};
    if (claim.claim_type !== 'meeting_training' || claim.payload.source !== 'meeting_compensation_auto' || Number(claim.payload.scheduleEventId) !== Number(event.id)) throw fail(400, 'Claim does not belong to this meeting.');
    if (!['submitted', 'deferred', 'rejected', 'withdrawn', 'needs_changes'].includes(String(claim.status).toLowerCase())) throw fail(409, 'Approved or paid claims are locked. Use a payroll correction instead.');
    const override = { rate_type: rateType, hourly_rate: customRate == null ? null : Math.round(customRate * 100) / 100 };
    if (await meetingClaimHourlyRate(claim, override) == null) throw fail(400, 'This employee has no assigned rate for that category on the meeting date. Choose another category or a custom hourly rate.');
    const [existing] = await db.execute('SELECT history_json FROM meeting_claim_rate_overrides WHERE claim_id=?', [claimId]);
    const raw = existing[0]?.history_json;
    const history = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    history.push({ rateType, hourlyRate: override.hourly_rate, reason: note, actorUserId: actor.id, at: new Date().toISOString() });
    await db.execute(
      `INSERT INTO meeting_claim_rate_overrides (claim_id,agency_id,user_id,rate_type,hourly_rate,reason,edited_by_user_id,history_json)
       VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE rate_type=VALUES(rate_type),hourly_rate=VALUES(hourly_rate),reason=VALUES(reason),edited_by_user_id=VALUES(edited_by_user_id),history_json=VALUES(history_json)`,
      [claimId, event.agency_id, claim.user_id, rateType, override.hourly_rate, note, actor.id, JSON.stringify(history)]
    );
    await db.execute(`UPDATE payroll_time_claims SET status='submitted', target_payroll_period_id=NULL, applied_amount=NULL,
      approved_by_user_id=NULL, approved_at=NULL, rejection_reason=NULL, rejected_by_user_id=NULL, rejected_at=NULL WHERE id=?`, [claimId]);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}
