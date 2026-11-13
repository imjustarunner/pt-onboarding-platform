export function schoolRoiDelivery(result) {
  if (result?.pendingApproval) return {sent:false,pending_approval:true,communication_id:result.communicationId || null};
  if (result?.skipped || result?.blocked || result?.queued || !result?.id) return {sent:false,error:result?.reason || 'send_failed',communication_id:result?.communicationId || null};
  // A QA redirect records accepted transport to the testing inbox, not delivery
  // to the intended family. Keep that distinction visible instead of failure.
  return {sent:!result.redirected,redirected:!!result.redirected,communication_id:result.communicationId || null};
}
