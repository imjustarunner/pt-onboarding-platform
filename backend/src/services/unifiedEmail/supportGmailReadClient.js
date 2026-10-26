import { google } from 'googleapis';
import { buildImpersonatedJwtClient } from '../googleWorkspaceAuth.service.js';
import { guardGmailClient } from './gmailTrafficGuard.js';
import { getImpersonatedUser } from './gmailClient.js';

let cached = null;
/** Read only the existing receiving mailbox; never request send/compose or
 * Directory permissions for history reconciliation. */
export async function getSupportGmailReadClient() {
  const mailbox = getImpersonatedUser();
  if (cached?.mailbox === mailbox) return cached.gmail;
  const auth = await buildImpersonatedJwtClient({ subjectEmail: mailbox,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'] });
  const gmail = guardGmailClient(google.gmail({ version: 'v1', auth }), mailbox);
  cached = { mailbox, gmail };
  return gmail;
}
