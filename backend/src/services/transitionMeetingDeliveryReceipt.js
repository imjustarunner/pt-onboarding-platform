/** An accepted CC alone must never establish delivery to the invited provider.
 * Hold partial/uncertain results for reconciliation without automatic resend. */
export function verifiedTransitionDeliveryReceipt(result,action){
 if(result?.internetMessageId)action.internetMessageId=result.internetMessageId;
 const incompleteRelay=result?.relay&&(result.relay.accepted!==true||result.relay.partial||Number(result.relay.rejectedCount)>0);
 if(result?.pendingApproval||result?.queued||result?.skipped||result?.blocked||result?.redirected||!result?.id||incompleteRelay)
  throw Object.assign(new Error('Delivery is held, redirected or unconfirmed; reconcile its receipt before retrying.'),{status:409});
 return {status:'sent',reference:`email:${result.id}`};
}

/** This dedicated SMTP sender is authorized by the scoped job's real wire
 * receipt and operator-verified Group configuration, not a Gmail send-as alias. */
export function isVerifiedTransitionSmtpSetup(setup,senderIdentityId){
 return setup?.address==='transitions@auricwell.com'&&setup.verifiedFrom==='transitions@auricwell.com'
  &&setup.transport==='workspace_smtp_relay'
  &&setup.automationSubject==='auricwell-transition-sequence@ptonboard-dev.iam.gserviceaccount.com'
  &&['roundTripVerified','visibleFromVerified','groupSettingsVerifiedByOwner','groupMembershipVerifiedByOperator'].every(k=>setup[k]===true)
  &&Number.isSafeInteger(Number(senderIdentityId))&&Number(senderIdentityId)>0&&Number(setup.senderIdentityId)===Number(senderIdentityId)
  &&Number.isSafeInteger(Number(setup.verificationCommunicationId))&&Number(setup.verificationCommunicationId)>0
  &&typeof setup.relayReceipt==='string'&&setup.relayReceipt.length>0&&setup.relayReceipt.length<250
  &&Number.isFinite(Date.parse(setup.verifiedAt));
}
