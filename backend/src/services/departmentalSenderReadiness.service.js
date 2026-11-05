import { ensureSendAsAlias } from './gmailSendAs.service.js';

/** Users send through the app transport under their current agency grant. The
 * transport must separately accept the exact shared From address. No aliases
 * are added to members' personal Gmail accounts, including nested Group logins.
 */
export async function ensureDepartmentalSenderReady({ email, displayName }, { ensureAlias = ensureSendAsAlias } = {}) {
  const address = String(email || '').trim().toLowerCase();
  const result = await ensureAlias({ sendAsEmail: address, displayName,
    treatAsAlias: false, replyToAddress: address });
  if (!result?.ok || String(result.sendAs?.sendAsEmail || '').toLowerCase() !== address
    || result.sendAs?.verificationStatus !== 'accepted') {
    throw Object.assign(new Error(result?.error || 'The departmental sender is awaiting transport authorization.'), {
      code: 'DEPARTMENTAL_SEND_AS_NOT_READY'
    });
  }
  return { ready: true, transport: result.transport || result.sendAs.transport || 'gmail_send_as' };
}
