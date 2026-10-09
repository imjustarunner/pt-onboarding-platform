import pool from '../config/database.js';
import {loadUserPaySystemContext} from './paySystem.service.js';
export const SICK_RATE_MODE='highest_current_eligible';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export function highestEligibleSickRate({rateProfile,status={},clinicalEligible=true}) {
 const reduced=!!status.useReducedRates;
 const credit=Number(reduced?rateProfile.creditRateProbation:rateProfile.creditRate)||0;
 const hcode=Number(reduced?rateProfile.hcodeRateProbation:rateProfile.hcodeRate)||0;
 // An indirect allowance pays additional time; it is not added to the hourly sick-leave rate.
 const candidates=[clinicalEligible ? credit : 0, hcode];
 return Math.round(Math.max(...candidates)*100)/100;
}
export async function currentEligibleSickRate({agencyId,userId,asOfDate,fallbackRate}) {
 const [rows]=await pool.execute(`SELECT s.breakdown,s.grace_active FROM payroll_summaries s JOIN payroll_periods p ON p.id=s.payroll_period_id
  WHERE s.agency_id=? AND s.user_id=? AND p.period_end<=? AND p.status IN ('posted','finalized') ORDER BY p.period_end DESC,s.id DESC LIMIT 1`,[agencyId,userId,asOfDate]);
 const tier=parse(rows[0]?.breakdown)?.__tier;
 const benefitTier=Number(tier?.tierLevel||0);
 const grace=!!Number(rows[0]?.grace_active||0);
 // Current session tier can differ from the retained benefit tier during grace.
 const currentTier=grace?Number(tier?.currentTierLevel??tier?.displayTierLevel??0):benefitTier;
 const ctx=await loadUserPaySystemContext({agencyId,userId,periodEnd:asOfDate,benefitTierLevel:benefitTier,displayTierLevel:currentTier,graceActive:grace});
 if(!ctx.enabled||ctx.rateProfile?.sickLeaveRateMode!==SICK_RATE_MODE)return Number(fallbackRate||0);
 if(!tier&&!ctx.status.inInitiationProtection&&!ctx.status.waiveMinimumWorkload)throw Object.assign(new Error('Review the employee’s workload tier before calculating sick-leave pay.'),{code:'SICK_LEAVE_RATE_REVIEW_REQUIRED'});
 return highestEligibleSickRate({rateProfile:ctx.rateProfile,status:ctx.status,clinicalEligible:ctx.rateProfile.clinicalEligible});
}
