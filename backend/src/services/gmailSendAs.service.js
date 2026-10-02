import { guardGmailClient } from './unifiedEmail/gmailTrafficGuard.js';
import { resolveAppEmailTransport } from './unifiedEmail/transportMailbox.js';
/**
 * Gmail Send-as alias automation (impersonated mailbox).
 * Requires DWD scope: https://www.googleapis.com/auth/gmail.settings.sharing
 */
import { google } from 'googleapis';
import {
  buildImpersonatedJwtClient,
  GOOGLE_WORKSPACE_SCOPES,
  logGoogleUnauthorizedHint
} from './googleWorkspaceAuth.service.js';

export const GMAIL_SETTINGS_SHARING_SCOPE = 'https://www.googleapis.com/auth/gmail.settings.sharing';

/**
 * Ensure a Send-as alias exists on the impersonated Gmail mailbox.
 */
export async function ensureSendAsAlias({
  impersonateUser = null,
  sendAsEmail,
  displayName = null,
  treatAsAlias = true,
  replyToAddress = null
} = {}) {
  const subject = resolveAppEmailTransport(process.env, impersonateUser);
  const email = String(sendAsEmail || '').trim().toLowerCase();
  if (!email.includes('@')) throw new Error('sendAsEmail is required');

  const auth = await buildImpersonatedJwtClient({
    subjectEmail: subject,
    scopes: [...GOOGLE_WORKSPACE_SCOPES, GMAIL_SETTINGS_SHARING_SCOPE]
  });
  const gmail = guardGmailClient(google.gmail({ version: 'v1', auth }), subject);

  try {
    const list = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const existing = (list?.data?.sendAs || []).find(
      (s) => String(s.sendAsEmail || '').toLowerCase() === email
    );
    if (existing) {
      // Patch display name / reply-to if needed
      const patch = {};
      if (displayName && existing.displayName !== displayName) patch.displayName = displayName;
      if (replyToAddress && existing.replyToAddress !== replyToAddress) {
        patch.replyToAddress = replyToAddress;
      }
      if (Object.keys(patch).length) {
        const updated = await gmail.users.settings.sendAs.patch({
          userId: 'me',
          sendAsEmail: email,
          requestBody: patch
        });
        return { ok: true, created: false, updated: true, sendAs: updated?.data || existing };
      }
      return { ok: true, created: false, updated: false, sendAs: existing };
    }

    const created = await gmail.users.settings.sendAs.create({
      userId: 'me',
      requestBody: {
        sendAsEmail: email,
        displayName: displayName || email.split('@')[0],
        replyToAddress: replyToAddress || email,
        treatAsAlias: !!treatAsAlias,
        // Groups/aliases verified via Workspace often need verificationStatus unset;
        // accepted addresses on the domain may appear as accepted without SMTP verification.
        isPrimary: false,
        isDefault: false
      }
    });
    return { ok: true, created: true, updated: false, sendAs: created?.data || null };
  } catch (e) {
    logGoogleUnauthorizedHint(e, { context: 'ensureSendAsAlias' });
    const msg = e?.message || e?.response?.data?.error?.message || String(e);
    return { ok: false, error: msg, code: e.code || null, retryAt: e.retryAt || null, sendAsEmail: email };
  }
}

export async function listSendAsAliases({ impersonateUser = null } = {}) {
  const subject = resolveAppEmailTransport(process.env, impersonateUser);
  const auth = await buildImpersonatedJwtClient({
    subjectEmail: subject,
    scopes: [...GOOGLE_WORKSPACE_SCOPES, GMAIL_SETTINGS_SHARING_SCOPE]
  });
  const gmail = guardGmailClient(google.gmail({ version: 'v1', auth }), subject);
  const list = await gmail.users.settings.sendAs.list({ userId: 'me' });
  return list?.data?.sendAs || [];
}
