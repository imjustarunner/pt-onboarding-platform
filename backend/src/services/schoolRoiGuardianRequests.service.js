import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
import { canReceiveGuardianConsentRequest } from './schoolRoiGuardianConsent.service.js';
import { sendSchoolRoiEmail, schoolRoiDelivery } from './schoolRoiEmail.service.js';
import { clientEmailContext } from './clientPortalEmail.service.js';
import { clientPortalInviteUrl } from './clientPortalContext.service.js';

/** Each legal guardian gets their own portal request; never share one family's completion state. */
export async function requestSchoolRoiForGuardians({ client, schoolOrganizationId, actorUserId, languageCode = 'en', guardianUserIds = null,
  listGuardians = id => ClientGuardian.listForClient(id),
  findExisting = args => ClientSchoolRoiSigningLink.findForClient(args),
  issueLink, sendEmail = sendSchoolRoiEmail, emailContext = clientEmailContext,
  recordSent = args => ClientSchoolRoiSigningLink.recordEmailSent(args)
}) {
  let guardians = (await listGuardians(client.id)).filter(canReceiveGuardianConsentRequest);
  if (guardianUserIds !== null) {
    if (!Array.isArray(guardianUserIds) || !guardianUserIds.length || guardianUserIds.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
      throw Object.assign(new Error('Choose at least one authorized guardian.'), {status: 400});
    }
    const selected = new Set(guardianUserIds.map(Number));
    if ([...selected].some(id => !guardians.some(g => Number(g.guardian_user_id) === id))) {
      throw Object.assign(new Error('A selected guardian is not authorized for this child.'), {status: 403});
    }
    guardians = guardians.filter(g => selected.has(Number(g.guardian_user_id)));
  }
  if (!guardians.length) throw Object.assign(new Error('No currently authorized guardians are available. Review the portal contacts first.'), { status: 409 });
  const context = await emailContext({ agencyId: client.agency_id, clientId: client.id, client });
  const login = new URL(clientPortalInviteUrl({ portal: context.portal, existingAccount: true }));
  const destination = new URL(context.url('guardian'), login.origin);
  destination.searchParams.set('clientId', String(client.id));
  destination.searchParams.set('panel', 'documents');
  login.searchParams.set('redirect', destination.pathname + destination.search);
  const deliveries = [];
  for (const guardian of guardians) {
    const recipientGuardianUserId = Number(guardian.guardian_user_id);
    try {
      const existing = await findExisting({ clientId: client.id, schoolOrganizationId, recipientGuardianUserId });
      if (existing?.last_email_sent_at && Date.now() - new Date(existing.last_email_sent_at).getTime() < 180000) {
        deliveries.push({ guardianUserId: recipientGuardianUserId, name: [guardian.first_name, guardian.last_name].filter(Boolean).join(' '), email: guardian.email, sent: true, status: 'recently_sent' });
        continue;
      }
      const issued = await issueLink({ client, schoolOrganizationId, actorUserId, recipientGuardianUserId,
        preferredLanguageCode: languageCode, regenerate: existing?.status === 'completed' });
      if (!issued?.ok) throw new Error(issued?.message || 'The guardian release could not be prepared.');
      const to = String(guardian.email || '').trim();
      if (!to.includes('@')) throw new Error('A saved email is needed for this guardian.');
      const spanish = languageCode === 'es';
      const result = await sendEmail({ agencyId: client.agency_id, clientId: client.id, to,
        subject: spanish ? 'Revise la autorización escolar en su portal' : 'Review your school release in your portal',
        text: spanish ? `Su equipo de atención solicita que revise y firme su propia autorización escolar. Cada tutor debe responder por separado. Inicie sesión y abra Documentos: ${login}`
          : `Your care team asks you to review and sign your own school release. Each guardian needs to respond separately. Sign in and open Documents: ${login}`,
        templateType: 'school_roi_signing', generatedByUserId: actorUserId, source: 'auto', linkUrl: login.toString() });
      const delivery = schoolRoiDelivery(result);
      if (delivery.sent) await recordSent({ id: issued.issuedLink.id, toEmail: to });
      deliveries.push({ guardianUserId: recipientGuardianUserId, name: [guardian.first_name, guardian.last_name].filter(Boolean).join(' '), email: to,
        sent: delivery.sent, status: delivery.sent ? 'sent' : result?.pendingApproval || result?.queued ? 'pending' : 'failed' });
    } catch (error) {
      deliveries.push({ guardianUserId: recipientGuardianUserId, email: guardian.email || null, sent: false, status: 'failed', error: error.message });
    }
  }
  return { ok: deliveries.every(row => row.sent), deliveries, message: deliveries.every(row => row.sent)
    ? 'Portal requests sent separately to the selected authorized guardians.' : 'Some guardian requests need follow-up. Review each delivery status.' };
}
