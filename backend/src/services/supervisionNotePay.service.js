import PayrollRate from '../models/PayrollRate.model.js';
import { loadUserPaySystemContext } from './paySystem.service.js';
import { claimReviewRead, claimReviewDay } from './payrollClaimReview.service.js';
import { roleCompensationRate } from './roleCompensationRate.js';

export function isSupervisionNoteClaim(claim) {
  const payload = claim?.payload || {};
  return claim?.claim_type === 'indirect_time' && (
    payload.categoryGroup === 'supervision_note' || payload.source === 'cosign_review_activity'
  );
}

// Review/signing time has its own Admin Time rate. Never substitute a general
// indirect, support, direct-care, or activity-override rate for this work.
export async function supervisionNoteHourlyRate({ agencyId, userId, asOf, rateContext = null }) {
  const date = claimReviewDay(asOf);
  return claimReviewRead(rateContext, `supervision-note:${agencyId}:${userId}:${date}`, async () => {
    const context = await claimReviewRead(rateContext, `pay:${userId}:${date}`, () => loadUserPaySystemContext({
      agencyId: Number(agencyId), userId: Number(userId), periodEnd: new Date(date)
    }));
    const assigned = roleCompensationRate(context?.rateProfile?.roleCompensation, 'Admin Time', { categoryGroup: 'supervision_note' });
    if (context?.enabled && Number.isFinite(assigned) && assigned > 0) return assigned;

    // Retain dated, employee-specific administrative rates on legacy schedules.
    const admin = await PayrollRate.findBestRate({ agencyId: Number(agencyId), userId: Number(userId), serviceCode: 'Admin Time', asOf: date });
    if (Number.isFinite(Number(admin?.rate_amount)) && Number(admin?.rate_amount) > 0) return Number(admin.rate_amount);
    if (context?.enabled) return null;

    const individual = await PayrollRate.findBestRate({ agencyId: Number(agencyId), userId: Number(userId), serviceCode: '99415', asOf: date });
    return Number.isFinite(Number(individual?.rate_amount)) && Number(individual?.rate_amount) > 0 ? Number(individual.rate_amount) * 0.5 : null;
  });
}
