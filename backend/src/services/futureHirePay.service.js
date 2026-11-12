import pool from '../config/database.js';
import {effectiveCompensationAgreement} from './employmentAgreementPolicy.service.js';

export const FUTURE_HIRE_PAY_AGENCIES = ['itsco', 'nlu', 'tisi'];
const day = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const review = message => Object.assign(new Error(message), {code:'AMENDMENT_PAYROLL_REVIEW_REQUIRED',status:409});

/** Called inside the account activation transaction, before changing its status.
 * Only a first completed hire is enrolled. Reactivation, pending-setup conversions,
 * current staff and explicit existing payroll decisions are never overwritten.
 */
export async function enrollCompletedFutureHire({db, userId, before, actorUserId=null}) {
  if (before?.status !== 'ONBOARDING') return [];
  const [[user]] = await db.execute('SELECT completed_at,is_demo FROM users WHERE id=?', [userId]);
  if (!user || user.completed_at || Number(user.is_demo)) return [];
  const [priorActivation] = await db.execute(`SELECT id FROM user_activity_log
    WHERE action_type IN ('user_account_reactivated','user_account_status_changed')
    AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.targetId'))=?
    AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.after.status'))='ACTIVE_EMPLOYEE' LIMIT 1`, [String(userId)]);
  if (priorActivation.length) return [];
  const [agencies] = await db.execute(`SELECT a.id,a.slug FROM agencies a JOIN user_agencies ua ON ua.agency_id=a.id
    WHERE ua.user_id=? AND COALESCE(ua.is_active,1)=1 AND a.slug IN ('itsco','nlu','tisi')`, [userId]);
  const enrolled=[];
  for (const agency of agencies) {
    const [existing] = await db.execute('SELECT user_id FROM payroll_user_compensation_levels WHERE agency_id=? AND user_id=?', [agency.id,userId]);
    // An explicit assignment/opt-out always takes priority over the new default.
    if (existing.length) continue;
    await db.execute(`INSERT IGNORE INTO payroll_future_hire_enrollments
      (agency_id,user_id,effective_start,enrolled_by_user_id) VALUES (?,?,UTC_DATE(),?)`, [agency.id,userId,actorUserId]);
    enrolled.push(agency.id);
  }
  return enrolled;
}

export async function futureHireEnrollment(agencyId,userId,db=pool) {
  const [rows]=await db.execute('SELECT * FROM payroll_future_hire_enrollments WHERE agency_id=? AND user_id=?',[agencyId,userId]);
  return rows[0] || null;
}

/** No inferred wages: enrollment is automatic, calculation still needs an
 * executed or separately authorized structured individual compensation schedule.
 * Free-text individual contracts remain blocked until payroll terms are reviewed.
 */
export async function futureHirePayContext({agencyId,userId,periodStart,periodEnd,enrollment},db=pool) {
  const start=day(enrollment.effective_start), end=day(periodEnd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) throw review('A service-period end date is required for new-hire payroll.');
  if (end<start) return {enabled:false,agencyEnabled:true,userEnabled:true,notYetEffective:true,paySystemEffectiveStart:start};
  const agreement=await effectiveCompensationAgreement({agencyId,userId,asOfDate:end},db);
  if (!agreement) throw review(`New hire ${userId} is enrolled, but an executed or individually authorized pay schedule is required before calculating payroll.`);
  const s=agreement.data?.schedule;
  if (!s || ['creditRate','hcodeRate','indirectRate','supportRate','creditRateProbation','hcodeRateProbation'].some(key=>s[key]==null || !Number.isFinite(Number(s[key])) || Number(s[key])<0)) {
    throw review(`New hire ${userId} needs reviewed numeric pay terms, including any explicit zero rates. Individual written terms cannot be converted into assumed wages.`);
  }
  const [[agency]]=await db.execute('SELECT slug FROM agencies WHERE id=?',[agencyId]);
  const individual=agency?.slug==='tisi';
  if (individual && (s.compensationBasis!=='approved_individual_agreement' || s.individualPaySystemApproved!==true ||
    ['autoIndirectMinutes','leaveAdminRatio'].some(key=>s[key]==null || !Number.isFinite(Number(s[key])) || Number(s[key])<0) ||
    ['tierBonusFfs','tierBonusHcode','spanishBonus','locationBonus'].some(key=>![1,2,3].every(t=>s[key]?.[t]!=null && Number.isFinite(Number(s[key][t])) && Number(s[key][t])>=0)))) {
    throw review(`New hire ${userId} needs payroll approval of the individual agreement's rates, indirect treatment and bonus terms. No shared rate matrix will be substituted.`);
  }
  if (!individual && (!Number.isInteger(Number(s.category)) || Number(s.category)<1 || Number(s.category)>(agency?.slug==='nlu'?4:3) || ![1,2,3,4,5].includes(Number(s.level)))) throw review(`New hire ${userId} needs an approved category and level.`);
  const [salary]=await db.execute(`SELECT id FROM payroll_salary_positions WHERE agency_id IN (0,?) AND user_id=?
    AND include_service_pay=0 AND (effective_start IS NULL OR effective_start<=?) AND (effective_end IS NULL OR effective_end>=?)`,[agencyId,userId,end,day(periodStart)||start]);
  if(salary.length)throw review(`New hire ${userId} has a salary excluding service pay. Resolve the overlap before calculating payroll.`);
  return {agreement,individual,assignment:{agency_id:agencyId,user_id:userId,category:s.category??null,level:s.level??null,
    pay_system_enabled:1,pay_system_effective_start:start,probation_start_override:start,
    waive_probation:s.probationWaived?1:0,bypass:0,automatic_future_hire:true}};
}
