const normalize = value => String(value || '').trim().toLowerCase();
/** Check Gmail's actual send-as resource, not just the app's identity row. An
 * unregistered From can be replaced by the transport's primary ai@ mailbox. */
export async function assertVerifiedGmailSender(gmail, fromEmail) {
  const address = normalize(fromEmail);
  if (!address || address.startsWith('ai@')) {
    throw Object.assign(new Error('The AI transport mailbox cannot be used as the visible email sender.'), { code: 'EMAIL_SENDER_FORBIDDEN' });
  }
  let alias;
  try {
    alias = (await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: address }))?.data;
  } catch (cause) {
    throw Object.assign(new Error('The sender address could not be verified with Gmail. Email was not sent.'), { code: 'EMAIL_SENDER_UNVERIFIED', cause });
  }
  if (normalize(alias?.sendAsEmail) !== address || alias.verificationStatus !== 'accepted') {
    throw Object.assign(new Error('This sender address is not an accepted Gmail send-as identity. Email was not sent.'), { code: 'EMAIL_SENDER_UNVERIFIED' });
  }
}
