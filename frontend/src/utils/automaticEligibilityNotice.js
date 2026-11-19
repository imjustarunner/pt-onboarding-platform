export function automaticEligibilityNotice(value, paperFinalizedAt = null){
 if(!value)return '';
 if(value.status==='awaiting_paper_review')return paperFinalizedAt?'Draft saved. No payer request was sent. Billing can check the corrected details.':'Draft saved. No payer request was sent. Eligibility begins when the completed packet is submitted.';
 if(value.status==='already_checked')return 'Insurance saved. These confirmed details already have a completed check; review the saved result below.';
 if(value.status==='review_required')return 'Insurance saved. An earlier attempt for these details needs billing review. No automatic repeat request was sent.';
 const missing=(value.missing||[]).map(item=>`${item.slot === 'secondary' ? 'Secondary' : 'Primary'}: ${item.message}`).join(' ');
 if(value.status==='queued')return `Insurance saved. Automatic eligibility is queued and normally runs within five minutes.${missing ? ` ${missing}` : ''}`;
 if(value.status==='already_queued')return 'Insurance saved. These details already have an automatic eligibility request. Review verification history for its result.';
 if(value.status==='waiting_for_information')return `Insurance saved. Automatic eligibility is waiting for required information. ${missing}`;
 if(value.status==='disabled')return 'Insurance saved. Automatic eligibility needs company billing setup; an urgent billing follow-up has been requested.';
 return '';
}
