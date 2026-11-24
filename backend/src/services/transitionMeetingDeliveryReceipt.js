/** An accepted CC alone must never establish delivery to the invited provider.
 * Hold partial/uncertain results for reconciliation without automatic resend. */
export function verifiedTransitionDeliveryReceipt(result,action){
 if(result?.internetMessageId)action.internetMessageId=result.internetMessageId;
 const incompleteRelay=result?.relay&&(result.relay.accepted!==true||result.relay.partial||Number(result.relay.rejectedCount)>0);
 if(result?.pendingApproval||result?.queued||result?.skipped||result?.blocked||result?.redirected||!result?.id||incompleteRelay)
  throw Object.assign(new Error('Delivery is held, redirected or unconfirmed; reconcile its receipt before retrying.'),{status:409});
 return {status:'sent',reference:`email:${result.id}`};
}
