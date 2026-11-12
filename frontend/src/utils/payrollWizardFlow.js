export const payrollRawStepModes = {
  draft_audit_prior: 'draft_audit', draft_audit_two_ago: 'draft_audit', drafts: 'draft_audit',
  missed_appts: 'missed_appts_paid_in_full', h0031: 'process_h0031', h0032: 'process_h0032',
  h2014: 'process_h2014', '90853': 'process_90853', h2032: 'process_h2032'
};
export function payrollHoursReviewUsers(summaries = []) {
  return summaries.filter(s => s.sick_leave_summary?.actualHoursReviewRequired || s.breakdown?.__actualHoursReview?.current === false)
    .map(s => ({ userId: Number(s.user_id), name: [s.first_name, s.last_name].filter(Boolean).join(' ') || `Employee #${s.user_id}` }));
}
export function payrollWizardBlocker(data = {}) {
  if (data.actualHoursReviewUserIds?.length) return { step: 'preview', userId: Number(data.actualHoursReviewUserIds[0]) };
  if (data.pendingTodos) return { step: 'stage', tool: 'todos' };
  if (data.pendingTime || data.pendingMileage || data.pendingReimbursement || data.allowPendingClaims) return { step: 'claims' };
  if (data.pendingProcessing) {
    const pending = data.pendingProcessing;
    const first = pending.sample?.[0] || pending.rows?.[0];
    const code = String(first?.service_code || first?.serviceCode || pending.code || Object.keys(pending.byCode || pending.sampleCountsByCode || {}).find(k => Number((pending.byCode || pending.sampleCountsByCode)[k]) > 0) || '').toLowerCase();
    return { step: Object.hasOwn(payrollRawStepModes, code) ? code : 'h0031' };
  }
  return null;
}
export function payrollReviewBlocker(state, fallback = 'Complete the highlighted items before continuing.') {
  if (!state || state.loading || state.saving) return 'Checking this step…';
  if (state.error) return state.error;
  if (state.ready === true) return '';
  return state.summaryMessage || state.blockers?.[0]?.message || (state.pendingCount ? `${state.pendingCount} item(s) still need your attention.` : fallback);
}
