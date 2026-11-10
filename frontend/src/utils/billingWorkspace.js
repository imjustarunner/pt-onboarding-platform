export const billingStages = [
  ['note_needed', 'Note needed'], ['draft', 'Draft'], ['pending_review', 'Pending review'],
  ['revisions_needed', 'Revisions needed'], ['ready_to_submit', 'Final checks required'],
  ['submitted', 'Submitted'], ['processing', 'Processing'], ['paid', 'Paid'],
  ['denied', 'Denied'], ['rejected','Rejected'], ['on_hold', 'On hold'], ['closed', 'Closed']
].map(([id, label]) => ({ id, label }));
export const claimQueueFilters=[{id:'pending_submission',label:'Pending initial submission or resubmission'},{id:'pending_initial_submission',label:'Pending initial submission'},{id:'pending_resubmission',label:'Pending resubmission'},{id:'open',label:'All open items'},{id:'information_required',label:'Information required'}];
export const claimStatusLabel = status => ({ ...Object.fromEntries(billingStages.map(stage => [stage.id, stage.label])), ready: 'Final checks required', queued: 'Processing', rejected: 'Rejected', adjusted: 'Closed · adjusted', void: 'Closed · voided' })[status] || status || 'Unknown';
export const clearinghouseStatusLabel = status => {
  const code = String(status || '').trim().toUpperCase();
  if (!code) return '';
  return {
    A: 'Acknowledged by clearinghouse',
    A1: 'Acknowledged by clearinghouse',
    A2: 'Accepted for processing',
    R: 'Rejected by clearinghouse',
    P: 'Paid',
    PRACTICE: 'Practice submit — not sent',
    SUBMITTED: 'Submitted',
    SENT: 'Sent'
  }[code] || `Clearinghouse status ${code}`;
};
export const claimHistoryLabel = type => ({
  correction:'Billing fields updated',
  remittance_posted:'Payer adjudication posted',
  resubmission_created:'Submission attempt prepared',
  approved_submission: 'Submitted',
  acknowledgement: 'Acknowledged',
  response: 'Update from clearinghouse',
  remittance_posted: 'Payment posted',
  billing_override: 'Billing override saved',
  correction: 'Billing correction',
  status_changed: 'Status changed',
  payer_claim_id: 'Payer claim ID'
}[type] || String(type || 'Update').replaceAll('_', ' '));
export const claimHistoryMoney = cents => cents == null ? 'Not set' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents)/100);
export function claimHistoryChanges(event) {
  if(!event.before || !event.after)return [];
  const changes=[],show=value=>value==null||value===''?'Not set':String(value);
  for(const [field,label] of Object.entries({billingOfficeId:'Billing office',placeOfService:'Place of service',billingNpi:'Billing NPI',renderingNpi:'Rendering NPI',taxonomyCode:'Taxonomy'})){
    if(show(event.before[field])!==show(event.after[field]))changes.push({label,before:show(event.before[field]),after:show(event.after[field])});
  }
  const mods=value=>{try{const values=typeof value==='string'?JSON.parse(value):value;return Array.isArray(values)?values.join(', ')||'None':'None';}catch{return show(value);}};
  for(const [index,line] of (event.after.lines||[]).entries()){
    const old=(event.before.lines||[]).find(item=>Number(item.id)===Number(line.id));if(!old)continue;
    const oldCharge=old.charge_cents??old.chargeCents,newCharge=line.charge_cents??line.chargeCents;
    if(Number(oldCharge)!==Number(newCharge))changes.push({label:`Line ${index+1} charge`,before:claimHistoryMoney(oldCharge),after:claimHistoryMoney(newCharge)});
    const before=mods(old.modifiers_json??old.modifiers),after=mods(line.modifiers_json??line.modifiers);
    if(before!==after)changes.push({label:`Line ${index+1} modifiers`,before,after});
  }
  return changes;
}
export const claimStatusTone = status => ['rejected', 'denied', 'revisions_needed'].includes(status) ? 'danger' : ['queued', 'draft', 'note_needed', 'on_hold', 'pending_review', 'ready', 'ready_to_submit'].includes(status) ? 'warning' : status === 'paid' ? 'success' : 'info';
export const workStage = item => item.stage || ({ ready: 'ready_to_submit', queued: 'processing', rejected: 'rejected', adjusted: 'closed', void: 'closed' }[item.claim_lifecycle] || item.claim_lifecycle || 'note_needed');
export const workClaimId = item => Number(item?.claimId || (item?.source && item.source !== 'claim' ? 0 : item?.id) || 0);
export const workItemKey = item => `${item.agency_id}:${item.key || (workClaimId(item) ? `claim:${workClaimId(item)}` : `${item.source || 'note'}:${item.clinical_note_id || item.draft_id || item.clinical_session_id}`)}`;
export const workItemTitle = item => item.claim_reference || item.claim_number || (workClaimId(item) ? `Claim #${workClaimId(item)}` : item.clinical_note_id ? `Note #${item.clinical_note_id}` : item.draft_id ? `Draft #${item.draft_id}` : 'Note needed');
export function billingDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}
export function diagnosisList(value) {
  if (Array.isArray(value)) return value.map(item => typeof item === 'object' ? item.code || item.diagnosisCode : item).filter(Boolean).join(', ');
  if (typeof value === 'string') { try { return diagnosisList(JSON.parse(value)); } catch { return value; } }
  return '';
}
export const submissionTypeLabel = item => Number(item.claim_frequency_code || item.frequency_code) === 7 || ['replacement','corrected'].includes(item.resubmission_type) ? 'Replacement / corrected' : Number(item.claim_frequency_code || item.frequency_code) === 8 || item.resubmission_type === 'void' ? 'Void / cancellation' : ['resubmit','original_retry'].includes(item.resubmission_type) ? 'Resubmission after rejection' : Number(item.payer_sequence || 1) === 2 ? 'Secondary claim' : 'Original claim';
export function billingTotals(organizations) {
  if (organizations.some(o => o.counts === null)) return null;
  const sum = statuses => organizations.reduce((n, o) => n + statuses.reduce((s, status) => s + Number(o.counts?.[status] || 0), 0), 0);
  const ready = organizations.reduce((n, o) => n + Number(o.counts?.ready_to_submit ?? o.counts?.ready ?? 0), 0);
  const progress = organizations.reduce((n, o) => n + Number(o.counts?.submitted || 0) + Number(o.counts?.processing ?? o.counts?.queued ?? 0), 0);
  return { active: sum(['note_needed', 'draft', 'pending_review', 'revisions_needed', 'denied', 'on_hold', 'rejected']) + ready + progress, ready, drafts: sum(['draft']), progress, attention: sum(['note_needed','revisions_needed','rejected','denied','on_hold','service_changes']), paid: sum(['paid']) };
}
export function billingBrand(organization) {
  let colors = organization?.colors;
  if (typeof colors === 'string') { try { colors = JSON.parse(colors); } catch { colors = {}; } }
  const primary = colors?.primary;
  if (!/^#[\da-f]{6}$/i.test(primary || '')) return {};
  const rgb = primary.slice(1).match(/../g).map(v => parseInt(v, 16));
  const light = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 160;
  return { '--bw-brand': primary, '--bw-on-brand': light ? '#132238' : '#ffffff' };
}
