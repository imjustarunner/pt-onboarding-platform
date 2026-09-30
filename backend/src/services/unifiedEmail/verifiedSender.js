const normalize = value => String(value || '').trim().toLowerCase();
const verified = new WeakMap();
/** Check Gmail's actual send-as resource, not just the app's identity row. An
 * unregistered From can be replaced by the transport's primary ai@ mailbox. */
export async function assertVerifiedGmailSender(gmail, fromEmail) {
  const address = normalize(fromEmail);
  if (!address || address.startsWith('ai@')) {
    throw Object.assign(new Error('The AI transport mailbox cannot be used as the visible email sender.'), { code: 'EMAIL_SENDER_FORBIDDEN' });
  }
  const cache=verified.get(gmail);
  if((cache?.get(address)||0)>Date.now())return;
  let alias;
  try {
    alias = (await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: address }))?.data;
  } catch (cause) {
    const status=Number(cause.response?.status||cause.code);
    if(status===429 || status>=500){
      const message=String(cause.response?.data?.error?.message||cause.message||'');
      const deadline=Date.parse(message.match(/Retry after ([0-9T:.Z+-]+)/i)?.[1]||'');
      throw Object.assign(new Error('Gmail temporarily could not verify the sender. Email was not sent.'),{code:'EMAIL_SENDER_TEMPORARY',cause,retryAt:Number.isFinite(deadline)?deadline:Date.now()+120000});
    }
    throw Object.assign(new Error('The sender address could not be verified with Gmail. Email was not sent.'), { code: 'EMAIL_SENDER_UNVERIFIED', cause });
  }
  if (normalize(alias?.sendAsEmail) !== address || alias.verificationStatus !== 'accepted') {
    throw Object.assign(new Error('This sender address is not an accepted Gmail send-as identity. Email was not sent.'), { code: 'EMAIL_SENDER_UNVERIFIED' });
  }
  const accepted=cache||new Map();accepted.set(address,Date.now()+5*60000);verified.set(gmail,accepted);
}
