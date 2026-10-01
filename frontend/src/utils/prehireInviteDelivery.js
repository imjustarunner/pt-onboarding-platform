export function prehireInviteDeliveryMessage(email) {
  if (email?.status === 'sent') {
    const to = email.deliveredTo || email.recipientEmail || 'the candidate';
    return `Invitation emailed to ${to}.${email.redirected ? ' Test address redirected to the testing inbox.' : ''}`;
  }
  if (email?.status === 'pending' || email?.pendingApproval || email?.queued) {
    return 'Pre-hire is saved. The invitation is awaiting email approval and has not been sent.';
  }
  return `Pre-hire is saved, but the invitation was not sent${email?.reason ? ` (${email.reason.replaceAll('_', ' ')})` : ''}. Use Email portal link to retry without recreating pre-hire.`;
}
