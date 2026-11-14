import pool from '../config/database.js';
import {authorizedCompensationSchedules} from './payrollCompensationAuthorization.service.js';
import {SERVICE_CREDIT_POLICY_VERSION, isServiceCreditPolicy, defaultHcodeIndirectMinutes, directCareIndirectMinutes, conditionalLevelBonus} from '../utils/serviceCreditPolicy.js';
import {isNluCompensationProfile,NLU_COMPENSATION_POLICY_VERSION} from '../content/nluCompensationPolicy.js';

export const COMPENSATION_POLICY_VERSION = SERVICE_CREDIT_POLICY_VERSION;
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : (value || {}); } catch { return {}; } };
const ymd = value => value instanceof Date ? value.toISOString().slice(0,10) : /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0,10) : null;
export function probationEndDate(start) {
  const day = ymd(start); if (!day) return null;
  const d = new Date(`${day}T12:00:00Z`); if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate()+90); return d.toISOString().slice(0,10);
}
export function executedAgreement(row) {
  const savedData = parse(row.token_values_json), audit = parse(row.audit_trail), metadata = parse(row.metadata);
  // New employment schedules use merge tokens; retain the signed snapshot and
  // normalize only this explicitly supported generation for payroll readers.
  const data = ['category-level-employment-2026-10-29-program',NLU_COMPENSATION_POLICY_VERSION].includes(savedData.COMPENSATION_POLICY_VERSION)
    ? {...savedData, employmentPayVersion:savedData.COMPENSATION_POLICY_VERSION, compensationPolicyVersion:COMPENSATION_POLICY_VERSION, schedule:parse(savedData.COMPENSATION_SCHEDULE)}
    : savedData;
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
// Administrative review must see executed legacy and future-dated agreements,
// including schedules that are deliberately ineligible for today's payroll.
export async function executedEmploymentAgreements({agencyId,userId},db=pool) {
  return signedAgreements(userId,agencyId,db);
}
export async function latestEmploymentAgreementDate(userId, db = pool) {
  const agreements = await signedAgreements(userId, null, db);
  return agreements.map(a=>a.agreementDate).sort().at(-1) || null;
}
export async function effectiveCompensationAgreement({agencyId,userId,asOfDate}, db = pool) {
  const agreements = await signedAgreements(userId,agencyId,db);
  const approved = await authorizedCompensationSchedules({agencyId,userId},db);
  const approvedIds = new Set(approved.map(a=>a.id));
  // A later countersignature does not move an explicitly approved payroll cutover.
  const schedules = [...agreements.filter(a=>!approvedIds.has(a.id)),
    ...approved.map(a=>({...a,executed:agreements.some(s=>s.id===a.id)}))];
  return schedules.filter(a=>isServiceCreditPolicy(a.data.compensationPolicyVersion) && a.effectiveOn <= ymd(asOfDate))
    .sort((a,b)=>b.effectiveOn.localeCompare(a.effectiveOn)||b.id-a.id)[0] || null;
}
export function agreementRateProfile(profile, agreement) {
  if (!agreement) return profile;
  const s = agreement.data.schedule;
  const bonus = Number(s.tier3LevelBonus ?? conditionalLevelBonus(s.level));
  const tierTerms = agreement.data.compensationPolicyVersion === COMPENSATION_POLICY_VERSION
    ? {tierBonusFfs:{1:0,2:0,3:isNluCompensationProfile(s)&&Number(s.category)===1?0:bonus},tierBonusHcode:{1:0,2:0,3:Number(s.category)===(isNluCompensationProfile(s)?2:1)?bonus:0}}
    : {};
  return {...profile, ...tierTerms,
    // Only an executed/authorized new schedule adopts NLU's new category meaning.
    // Clear matrix markers when reading a signed legacy schedule.
    nluCompensationPolicyVersion:s.nluCompensationPolicyVersion || null,
    nluCompensationEffectiveOn:s.nluCompensationPolicyVersion ? agreement.effectiveOn : null,
    childcareLevel:s.childcareLevel ?? null,childcareRate:s.childcareRate ?? s.childcareHourlyRate ?? null,childcareRatesByBand:s.childcareRatesByBand ?? null,
    tutoringLevel:s.tutoringLevel ?? null,tutoringCategory:s.tutoringCategory ?? null,
    tutoringRates:s.tutoringRates ?? null,testingAuthorized:s.testingAuthorized===true,
    testingServicePolicyVersion:s.testingServicePolicyVersion || null,
    serviceRoles:s.serviceRoles ?? agreement.data.CONTRACT_SERVICE_ROLES ?? null,
    testingAuthorizationReference:s.testingAuthorizationReference || null,
    tutoringVirtualRate:s.tutoringVirtualRate??null,tutoringInPersonRate:s.tutoringInPersonRate??null,tutoringHourlyRate:s.tutoringHourlyRate??null,
    testingAdministrationRate:s.testingAdministrationRate ?? null,
    testingAdministrationRateProbation:s.testingAdministrationRateProbation ?? null,
    testingEvaluationRate:s.testingEvaluationRate ?? null,
    testingEvaluationRateProbation:s.testingEvaluationRateProbation ?? null,
    programRatesVersion:s.programRatesVersion || null, programTenant:s.programTenant || null,
    programRatesEffectiveOn:s.programRatesVersion ? [agreement.effectiveOn,s.programRatesEffectiveOn || agreement.effectiveOn].sort().at(-1) : null,
    homeworkHelpRate:s.homeworkHelpRate ?? null, homeworkHelpRateProbation:s.homeworkHelpRateProbation ?? null,
    tutoringRateProbation:s.tutoringRateProbation ?? null, h2014RateProbation:s.h2014RateProbation ?? null,
    tutoringRate:s.tutoringRate ?? profile?.tutoringRate, h2014Rate:s.h2014Rate ?? profile?.h2014Rate, roleCompensation:agreement.data.roleCompensation||null, conditionalAdditionMode:agreement.data.conditionalAdditionMode||null, sickLeaveRateMode:agreement.data.sickLeaveRateMode||null, clinicalEligible:s.clinicalEligible!==false, category:s.category,level:s.level,creditRate:s.creditRate,hcodeRate:s.hcodeRate,
    indirectRate:s.indirectRate,supportActivityRate:s.supportRate,
    creditRateProbation:s.creditRateProbation,hcodeRateProbation:s.hcodeRateProbation,
    indirectRateProbation:s.indirectRateProbation ?? s.indirectRate,
    supportActivityRateProbation:s.supportRateProbation ?? s.supportRate,
    autoIndirectMinutesPerHour:directCareIndirectMinutes(s.autoIndirectMinutes ?? (agreement.data.compensationPolicyVersion === 'itsco-2026-10-service-credit-v2' ? 12 : defaultHcodeIndirectMinutes(s.category))),
    leaveAdminRatio:s.leaveAdminRatio ?? 0.2,compensationPolicyVersion:agreement.data.compensationPolicyVersion,
    agreementEffectiveOn:agreement.effectiveOn,agreementId:agreement.id};
}
