import pool from '../config/database.js';
import {SERVICE_CREDIT_POLICY_VERSION, isServiceCreditPolicy, defaultHcodeIndirectMinutes, conditionalLevelBonus} from '../utils/serviceCreditPolicy.js';

export const COMPENSATION_POLICY_VERSION = SERVICE_CREDIT_POLICY_VERSION;
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : (value || {}); } catch { return {}; } };
const ymd = value => value instanceof Date ? value.toISOString().slice(0,10) : /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0,10) : null;
export function probationEndDate(start) {
  const day = ymd(start); if (!day) return null;
  const d = new Date(`${day}T12:00:00Z`); if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate()+90); return d.toISOString().slice(0,10);
}
export function executedAgreement(row) {
  const data = parse(row.token_values_json), audit = parse(row.audit_trail), metadata = parse(row.metadata);
  if (!row.signed_pdf_path || !audit.adminCountersign?.signedAt) return null;
  if (!(metadata.contractGeneration || metadata.employmentContract || metadata.autoFromSendPreHire || data.draftKind === 'provider_update_compensation')) return null;
  const completedOn = ymd(audit.adminCountersign.signedAt);
  const agreementDate = ymd(data.effectiveDate || data.EFFECTIVE_DATE || metadata.effectiveDate) || completedOn;
  if (!agreementDate || !completedOn) return null;
  // A late signature never retroactively introduces a lower rate or new workload condition.
  const effectiveOn = [agreementDate, completedOn].sort().at(-1);
  return {id:row.id, data, agreementDate, completedOn, effectiveOn};
}
async function signedAgreements(userId, agencyId = null, db = pool) {
  const [rows] = await db.execute(`SELECT g.id,g.token_values_json,t.metadata,s.signed_pdf_path,s.audit_trail
    FROM contract_generations g JOIN tasks t ON t.id=g.task_id
    JOIN signed_documents s ON s.task_id=t.id
    WHERE g.candidate_user_id=? ${agencyId ? 'AND g.agency_id=?' : ''}
    ORDER BY g.id DESC`, agencyId ? [userId,agencyId] : [userId]);
  return rows.map(executedAgreement).filter(Boolean);
}
export async function latestEmploymentAgreementDate(userId, db = pool) {
  const agreements = await signedAgreements(userId, null, db);
  return agreements.map(a=>a.agreementDate).sort().at(-1) || null;
}
export async function effectiveCompensationAgreement({agencyId,userId,asOfDate}, db = pool) {
  const agreements = await signedAgreements(userId,agencyId,db);
  return agreements.filter(a=>isServiceCreditPolicy(a.data.compensationPolicyVersion) && a.effectiveOn <= ymd(asOfDate))
    .sort((a,b)=>b.effectiveOn.localeCompare(a.effectiveOn)||b.id-a.id)[0] || null;
}
export function agreementRateProfile(profile, agreement) {
  if (!agreement) return profile;
  const s = agreement.data.schedule;
  const bonus = Number(s.tier3LevelBonus ?? conditionalLevelBonus(s.level));
  const tierTerms = agreement.data.compensationPolicyVersion === COMPENSATION_POLICY_VERSION
    ? {tierBonusFfs:{1:0,2:0,3:bonus},tierBonusHcode:{1:0,2:0,3:Number(s.category)===1?bonus:0}}
    : {};
  return {...profile, ...tierTerms, conditionalAdditionMode:agreement.data.conditionalAdditionMode||null, sickLeaveRateMode:agreement.data.sickLeaveRateMode||null, clinicalEligible:s.clinicalEligible!==false, category:s.category,level:s.level,creditRate:s.creditRate,hcodeRate:s.hcodeRate,
    indirectRate:s.indirectRate,supportActivityRate:s.supportRate,
    creditRateProbation:s.creditRateProbation,hcodeRateProbation:s.hcodeRateProbation,
    indirectRateProbation:s.indirectRateProbation ?? s.indirectRate,
    supportActivityRateProbation:s.supportRateProbation ?? s.supportRate,
    autoIndirectMinutesPerHour:s.autoIndirectMinutes ?? (agreement.data.compensationPolicyVersion === 'itsco-2026-10-service-credit-v2' ? 12 : defaultHcodeIndirectMinutes(s.category)),
    leaveAdminRatio:s.leaveAdminRatio ?? 0.2,compensationPolicyVersion:agreement.data.compensationPolicyVersion,
    agreementEffectiveOn:agreement.effectiveOn,agreementId:agreement.id};
}
