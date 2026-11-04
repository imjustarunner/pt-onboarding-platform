import { relayConfiguration, relayError, relaySelected, normalizeRelayAddress } from './workspaceRelayConfig.js';

/** All content/payer/tenant/approval checks happen before this delivery boundary.
 * A relay acceptance and its optional Gmail archival copy are separate operations. */
export async function deliverWorkspaceMime({ gmail, fromEmail, requestBody, communicationId }, { env = process.env, client, verifySender } = {}) {
  if (!relaySelected(fromEmail, env)) return gmail.users.messages.send({ userId: 'me', requestBody });
  const { url } = relayConfiguration(env);
  if (!Number.isSafeInteger(Number(communicationId)) || Number(communicationId) <= 0) {
    throw relayError('EMAIL_RELAY_LOG_REQUIRED', 'Create the communication record before sending through Workspace relay.');
  }
  verifySender ||= (await import('./workspaceRelaySender.js')).verifyWorkspaceRelaySender;
  await verifySender(fromEmail, { env });
  const from = normalizeRelayAddress(fromEmail);
  const messageId = `<comm-${communicationId}@${from.split('@')[1]}>`;
  let mime = Buffer.from(requestBody.raw, 'base64url').toString('utf8');
  mime = /^Message-ID:/im.test(mime)
    ? mime.replace(/^Message-ID:[^\r\n]*(?:\r\n[ \t][^\r\n]*)*/im, `Message-ID: ${messageId}`)
    : `Message-ID: ${messageId}\r\n${mime}`;
  if (!/^Date:/im.test(mime)) mime = `Date: ${new Date().toUTCString()}\r\n${mime}`;
  const raw = Buffer.from(mime).toString('base64url');
  if (!client) {
    const { GoogleAuth } = await import('google-auth-library');
    client = await new GoogleAuth().getIdTokenClient(url);
  }
  let accepted;
  try {
    const response = await client.request({ url: `${url}/send`, method: 'POST', data: { key: `communication:${communicationId}`, from, raw }, timeout: 25000, retry: false, retryConfig: { retry: 0 } });
    accepted = response.data;
    if (accepted?.status !== 'accepted' || !accepted.id || accepted.messageId !== messageId) throw new Error('Unconfirmed relay response');
  } catch (cause) {
    throw relayError('EMAIL_RELAY_DELIVERY_UNKNOWN', 'Workspace relay delivery was not confirmed. Review or retry this same communication; do not create another send.', { cause, communicationId });
  }
  let archived = null;
  // A repeated accepted request must not import a second Sent copy. Reconcile by
  // the deterministic RFC Message-ID first; import only if that query succeeded.
  try {
    const found = await gmail.users.messages.list({ userId: 'me', q: `in:sent rfc822msgid:${messageId}`, maxResults: 1 });
    if (found.data?.messages?.length) archived = found.data.messages[0];
    else archived = (await gmail.users.messages.import({ userId: 'me', neverMarkSpam: true, requestBody: { raw, labelIds: ['SENT'], ...(requestBody.threadId ? { threadId: requestBody.threadId } : {}) } })).data;
  } catch { /* SMTP already accepted. Archival failure must never resend mail. */ }
  return { data: {
    id: archived?.id || accepted.id,
    threadId: archived?.threadId || requestBody.threadId || null,
    relay: { id: accepted.id, messageId, accepted: true, archivePending: !archived?.id, partial: !!accepted.partial, rejectedCount: accepted.rejectedCount || 0 }
  } };
}
