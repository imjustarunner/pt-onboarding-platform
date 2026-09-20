export function isPasswordRecoveryAudit(action) {
  return ['password_reset_link_sent', 'password_reset_email_failed', 'password_reset_link_generated'].includes(action);
}

export function formatPasswordRecoveryAudit(metadata) {
  let m = metadata;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { return 'Recovery details unavailable'; }
  }
  m = m || {};
  const actor = m.performedByName || m.performedByEmail ||
    (m.performedByUserId ? `Staff user #${m.performedByUserId}` :
      (m.requestSource === 'public_forgot_password' ? 'Public Forgot Password form (not signed in)' : 'Requester not recorded'));
  const source = { school_portal: 'School portal', admin_profile: 'Admin profile', public_forgot_password: 'Public sign-in page' }[m.requestSource];
  const status = { sent: 'Sent', failed: 'Failed', not_sent: 'Link generated; email not sent' }[m.deliveryStatus];
  return [
    `Requested by: ${actor}`,
    m.performedByName && m.performedByEmail ? m.performedByEmail : null,
    m.email ? `To: ${m.email}` : null,
    status ? `Status: ${status}` : 'See Communications for delivery status',
    source ? `Source: ${source}` : null,
    m.fromEmail ? `From: ${m.fromEmail}` : null,
    m.replyTo ? `Reply-to: ${m.replyTo}` : null,
    m.communicationId ? `Communication #${m.communicationId}` : null,
    m.error ? `Reason: ${m.error}` : null
  ].filter(Boolean).join(' · ');
}
