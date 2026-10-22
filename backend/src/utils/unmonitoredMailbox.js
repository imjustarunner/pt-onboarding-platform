export const EXCHANGE_NO_REPLY = 'no-reply@auricwell.com';
export function isUnmonitoredAddress(value) {
  return String(value||'').toLowerCase().split(/[\s,;<>]+/).some(address=>/^no-?reply@[a-z0-9.-]+$/.test(address));
}
export function shouldReplyToUnmonitored({headers,fromEmail}) {
  const auto=String(headers.get('auto-submitted')||'').toLowerCase();
  return !!fromEmail && !/(^|[.@+_-])(no-?reply|mailer-daemon|postmaster)([.@+_-]|$)/i.test(fromEmail)
    && (!auto||auto==='no') && !headers.get('x-autoreply') && !headers.get('x-autorespond')
    && !/bulk|list|junk/i.test(headers.get('precedence')||'')
    && !/all|autoreply/i.test(headers.get('x-auto-response-suppress')||'');
}
export function unmonitoredReplyText({agencyName,supportEmail,appUrl}) {
  return `This mailbox is not monitored, and replies here are not reviewed by a person.\n\n${agencyName&&supportEmail?`For questions about ${agencyName}, contact ${supportEmail}.`:'For questions, sign in to the app, choose your agency, and contact its support team.'}\n\nFor a Client Exchange referral, open Client Exchange in the app to review it or submit a request: ${appUrl}\n\nPlease do not reply to this automated message.`;
}
