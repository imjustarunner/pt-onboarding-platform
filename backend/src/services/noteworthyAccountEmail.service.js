import pool from '../config/database.js';

const accountTypes = new Set(['noteworthy_email_verification', 'noteworthy_employee_invitation']);
const unavailable = () => Object.assign(new Error('Account email delivery is not configured.'), { status: 503, code: 'VERIFICATION_EMAIL_UNAVAILABLE' });

/** NoteWorthy uses the platform account-notification sender. A tenant's From
 * address or an arbitrary first active identity is never an account-mail fallback. */
export function createNoteworthyAccountEmail({ db = pool, transport = null, verifySender = null, configuredIdentityId = () => process.env.NOTEWORTHY_SENDER_IDENTITY_ID } = {}) {
  async function resolveSender() {
    const configured = configuredIdentityId();
    if (configured && !/^[1-9]\d*$/.test(String(configured))) throw unavailable();
    const [identities] = await db.execute(`SELECT e.id,e.agency_id,e.identity_key,e.from_email,e.is_active
      FROM email_sender_identities e JOIN agencies a ON a.id=e.agency_id
      WHERE a.slug=? AND a.organization_type='agency' AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
        AND e.identity_key=? AND e.is_active=1${configured ? ' AND e.id=?' : ''}`,
    ['plottwistco', 'notifications', ...(configured ? [Number(configured)] : [])]);
    if (identities.length !== 1 || !Number(identities[0].is_active)
      || !/^[^\s<>@,;]+@plottwistco\.com$/i.test(identities[0].from_email || '')) throw unavailable();
    return identities[0];
  }
  async function send({ to, subject, text, templateType }) {
    if (!accountTypes.has(templateType)) throw unavailable();
    const identity = await resolveSender();
    const verify = verifySender || (async address => {
      const { getGmailClient } = await import('./unifiedEmail/gmailClient.js');
      const { assertVerifiedGmailSender } = await import('./unifiedEmail/verifiedSender.js');
      await assertVerifiedGmailSender(await getGmailClient(), address);
    });
    await verify(identity.from_email);
    const result = await (transport || (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity)({
      senderIdentityId: Number(identity.id), to, subject, text, templateType, source: 'manual'
    });
    if (result?.redirected || result?.testInboxRedirect || result?.testInboxRedirected) return { sent: false, pending: false };
    if (result?.queued || result?.requiresApproval || result?.pendingApproval || result?.status === 'pending_approval') return { sent: false, pending: true };
    if (result?.skipped || result?.blocked) return { sent: false, pending: false };
    return { sent: !!result?.id, pending: false };
  }
  return { resolveSender, send };
}
export default createNoteworthyAccountEmail();
