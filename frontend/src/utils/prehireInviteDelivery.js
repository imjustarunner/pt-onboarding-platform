export function prehireInviteDeliveryMessage(email) {
  if (email?.status === 'sent') {
    const to = email.deliveredTo || email.recipientEmail || 'the candidate';
    return `Invitation emailed to ${to}.${email.redirected ? ' Test address redirected to the testing inbox.' : ''}`;
  }
  if (email?.reason === 'no_people_operations_sender') {
    return 'Pre-hire is saved. Configure an active People Operations sender for this agency, then use Email portal link to retry.';
  }
  if (email?.status === 'pending' || email?.pendingApproval || email?.queued) {
    return 'Pre-hire is saved. The invitation is awaiting email approval and has not been sent.';
  }
  return `Pre-hire is saved, but the invitation was not sent${email?.reason ? ` (${email.reason.replaceAll('_', ' ')})` : ''}. Use Email portal link to retry without recreating pre-hire.`;
}
