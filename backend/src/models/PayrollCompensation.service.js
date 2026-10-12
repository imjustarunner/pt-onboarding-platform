import {day} from '../services/recurringPayroll.service.js';
import {submissionContext,compensationCodes} from '../services/payrollSubmissionContext.service.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollServiceCodeRule from '../models/PayrollServiceCodeRule.model.js';

export async function getUserCompensationForAgency({ agencyId, userId }) {
  const [rateCard, perCodeRates, serviceCodeRules] = await Promise.all([
    PayrollRateCard.findForUser(agencyId, userId),
    PayrollRate.listForUser(agencyId, userId),
    PayrollServiceCodeRule.listForAgency(agencyId)
  ]);

  const submission = await submissionContext({agencyId,userId});
  let priorRates = perCodeRates || [];
  if (submission.startsOn) {
    const end=new Date(submission.startsOn+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);
    const asOf=day(end),byCode=new Map();
    for(const rate of priorRates) {
      if((rate.effective_start && day(rate.effective_start)>asOf)||(rate.effective_end && day(rate.effective_end)<asOf))continue;
      const previous=byCode.get(rate.service_code);
      if(!previous||day(rate.effective_start)>day(previous.effective_start)|| (day(rate.effective_start)===day(previous.effective_start)&&Number(rate.id)>Number(previous.id)))byCode.set(rate.service_code,rate);
    }
    priorRates=[...byCode.values()];
  }
  return {
    priorPerCodeRates:priorRates,
    submission,
    codeGuide: compensationCodes(serviceCodeRules || [],agencyId),
    agencyId,
    userId,
    rateCard: rateCard || null,
    perCodeRates: perCodeRates || [],
    serviceCodeRules: serviceCodeRules || []
  };
}

