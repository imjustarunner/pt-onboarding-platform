// Explicit clinical projection: never forward raw payer messages, review text or payloads.
export function clinicalCorrectionReasons(messages = []) {
  const fields = messages.map(message => String(message.fields || '')).join(' ').toLowerCase();
  const reasons = [];
  if (/place_of_service/.test(fields)) reasons.push('Service location needs review. Confirm where the session occurred against the note.');
  if (/proc|mod|units/.test(fields)) reasons.push('Service code, modifier or units need review against the documented service.');
  if (/diag/.test(fields)) reasons.push('Diagnosis information needs review against the clinical record.');
  if (/ins_|pat_|payer/.test(fields)) reasons.push('Insurance or subscriber information needs verification by the billing team.');
  if (/npi|taxid|taxonomy|prov_|bill_/.test(fields)) reasons.push('Provider identifiers or enrollment need verification by the billing team.');
  return reasons.length ? reasons : ['The billing team must review the payer response and identify any documentation changes needed.'];
}

export function appointmentProgress({ claim = null, note = null, prepared = null, pendingChange = false, cosignPending = false, cosignRequired = false, nonBillable = false, messages = [] }) {
  if (nonBillable && !claim) return {status:'documentation_only',label:'Documentation only — no service claim',step:0,actions:cosignPending ? ['Supervisor review is outstanding for this document.'] : [],cosignPending,correctionPending:false};
  const lifecycle = String(claim?.claim_lifecycle || '').toLowerCase();
  const legacy = String(claim?.claim_status || '').toLowerCase();
  let status = 'open', label = 'Open — planned service', step = 0;
  const actions = [];
  if (claim) {
    if (lifecycle === 'paid' || legacy === 'paid') { status='paid'; label='Payment recorded'; step=4; }
    else if (['rejected','denied'].includes(lifecycle) || ['rejected','denied'].includes(legacy)) { status=lifecycle === 'denied' || legacy === 'denied' ? 'denied' : 'rejected'; label=status === 'denied' ? 'Denied' : 'Rejected'; step=2; actions.push(...clinicalCorrectionReasons(messages)); }
    else if (lifecycle === 'accepted') { status='accepted'; label='Accepted — awaiting adjudication'; step=3; }
    else if (lifecycle === 'submitted') { status='submitted'; label='Submitted — awaiting payer response'; step=2; }
    else if (lifecycle === 'queued') { status='queued'; label='Submission status needs reconciliation'; step=2; actions.push('Billing must verify the previous submission before retrying.'); }
    else if (['void','adjusted'].includes(lifecycle)) { status=lifecycle; label=lifecycle === 'void' ? 'Voided' : 'Adjustment recorded — billing review'; step=2; }
    else if (prepared?.readiness?.ready) { status='awaiting_submission'; label='Awaiting billing approval and submission'; step=1; }
    else { status='review'; label='Billing review required'; actions.push('The billing team must complete claim, coverage and content checks.'); }
  }
  if (!note) actions.push('Create the service note in Note Aid.');
  else if (!note.provider_signed_at) actions.push('Complete and sign the service note.');
  else if (!claim) { status='awaiting_preparation'; label='Signed — awaiting claim preparation'; actions.push('Billing must prepare the claim from the signed service note.'); }
  if (cosignPending) {
    actions.push(cosignRequired ? 'Supervisor sign-off is required before submission.' : 'Supervisor cosign remains due under the applicable review policy.');
    if (!claim || ['draft','ready'].includes(lifecycle)) { status='needs_cosign'; label='Needs supervisor cosign'; }
  }
  if (pendingChange) actions.push('An amendment is awaiting supervisor approval or billing reconciliation. Resubmission is paused.');
  if (pendingChange && (!claim || ['draft','ready'].includes(lifecycle))) { status='changes_pending'; label='Amendment review — submission paused'; }
  const findings = prepared?.aiReview?.findings?.filter(f => !f.resolution) || [];
  for (const category of new Set(findings.map(f => f.category))) {
    const action = {place_of_service:'Confirm that the note and service location agree.',service_code:'Review the service code against the note.',modifiers:'Review the service modifiers with billing.',units:'Confirm documented service duration and units.',clinical_content:'Review note completeness and consistency.'}[category];
    if (action) actions.push(action);
  }
  return { status, label, step, actions:[...new Set(actions)], cosignPending, correctionPending:pendingChange };
}
