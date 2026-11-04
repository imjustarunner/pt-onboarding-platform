import { formatBillingDate } from './billingReviewDisplay.js';

// Navigation and explanation only. The server still decides whether a claim can be submitted.
export function claimRequirementAction(blocker, review) {
  const r = review?.readiness || {};
  const date = formatBillingDate(review?.dateOfService);
  if (r.coverageBlockers?.includes(blocker) || blocker === 'Verify insurance and coordination of benefits for this date of service') {
    const latest = r.coverageReview?.latest;
    const differentDate = latest?.serviceDate && String(latest.serviceDate).slice(0, 10) !== String(review.dateOfService).slice(0, 10);
    return { task: 'coverage', label: `Verify coverage for ${date}`, detail: differentDate
      ? `A ${latest.status === 'verified' ? 'verified' : 'saved'} coverage review exists for ${formatBillingDate(latest.serviceDate)}. This claim needs verification for ${date}.`
      : `Review primary and any secondary coverage, confirm payer order, and save verification for ${date}.` };
  }
  if (r.clientDocumentation?.blockers?.includes(blocker) || /^Review and verify the applicable (screening|treatment intake) documentation/.test(blocker)) {
    const docs = r.clientDocumentation || {}, latest = docs.latestReview;
    const stage = docs.scope === 'screening' ? 'screening' : 'treatment';
    const savedStage = latest?.scope === 'screening' ? 'screening' : 'treatment';
    return { task: 'documents', label: `Review ${stage} documents`, detail: latest
      ? `The saved ${savedStage} review covers ${formatBillingDate(latest.effectiveFrom)}${latest.effectiveThrough ? `–${formatBillingDate(latest.effectiveThrough)}` : ' onward'}. Review the documents applicable to ${stage} on ${date}.`
      : `Review consent and documents applicable to ${stage} on ${date}, then save the documentation review.` };
  }
  if (blocker === 'Verify the payer/product provider mapping for this date of service') {
    const payer = r.payer || {};
    return !payer.planType
      ? { task: 'insurance', label: 'Add verified insurance plan type', detail: `${payer.payerId || 'This payer'} has no saved plan type. Enter the verified plan type in Insurance & identity, then configure the payer/provider mapping.` }
      : { task: 'policy', label: 'Configure payer/provider mapping', detail: `Confirm which provider is billed as rendering for ${payer.payerId} / ${payer.planType}, with a policy reference and dates covering ${date}. This practice setting is reused for matching claims.` };
  }
  if (blocker === 'Run the AI content and claim consistency review' || review?.aiReview?.findings?.some(f => f.severity === 'blocker' && f.message === blocker)) {
    return { task: 'ai', label: 'Open AI consistency review', detail: 'Run the review or resolve its findings after completing the claim fields. Changing claim details may require a new review.' };
  }
  if (r.payloadIssue?.message === blocker && /payerid|staff-reviewed insurance|provider accepts assignment|pat_|ins_/.test(blocker)) {
    return { task: 'insurance', label: 'Review insurance & identity', detail: 'Review the missing fields shown above and save the corrected insurance information.' };
  }
  return null;
}
