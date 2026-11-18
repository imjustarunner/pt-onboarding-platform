import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
import { canReceiveGuardianConsentRequest } from './schoolRoiGuardianConsent.service.js';
import { sendSchoolRoiEmail, schoolRoiDelivery } from './schoolRoiEmail.service.js';
import { clientEmailContext } from './clientPortalEmail.service.js';
import { schoolRoiRequestActions, buildSchoolRoiRequestEmail } from './schoolRoiRequestEmail.service.js';

/** Each legal guardian gets their own portal request; never share one family's completion state. */
export async function requestSchoolRoiForGuardians({ client, schoolOrganizationId, actorUserId, languageCode = 'en', guardianUserIds = null,
  listGuardians = id => ClientGuardian.listForClient(id),
  findExisting = args => ClientSchoolRoiSigningLink.findForClient(args),
  issueLink, sendEmail = sendSchoolRoiEmail, emailContext = clientEmailContext,
  recordSent = args => ClientSchoolRoiSigningLink.recordEmailSent(args),
  prepareActions = schoolRoiRequestActions
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
  const deliveries = [];
  for (const guardian of guardians) {
    const recipientGuardianUserId = Number(guardian.guardian_user_id);
    try {
      const existing = await findExisting({ clientId: client.id, schoolOrganizationId, recipientGuardianUserId });
      if (existing?.last_email_sent_at && Date.now() - new Date(existing.last_email_sent_at).getTime() < 180000) {
        deliveries.push({ guardianUserId: recipientGuardianUserId, name: [guardian.first_name, guardian.last_name].filter(Boolean).join(' '), email: guardian.email, sent: false, alreadyRecorded: true, status: 'recently_sent' });
        continue;
      }
      const issued = await issueLink({ client, schoolOrganizationId, actorUserId, recipientGuardianUserId,
        preferredLanguageCode: languageCode, regenerate: existing?.status === 'completed' });
      if (!issued?.ok) throw new Error(issued?.message || 'The guardian release could not be prepared.');
      const to = String(guardian.email || '').trim();
      if (!to.includes('@')) throw new Error('A saved email is needed for this guardian.');
      const actions = await prepareActions({ client, guardian, issuedLink: issued.issuedLink, context, actorUserId });
      const content = buildSchoolRoiRequestEmail({ agencyName: context.tenant?.name || context.brand?.name || 'Your care team', firstName: guardian.first_name,
        colorPalette: context.tenant?.color_palette, languageCode, actions });
      const result = await sendEmail({ agencyId: client.agency_id, clientId: client.id, to,
        ...content, templateType: 'school_roi_signing', generatedByUserId: actorUserId, source: 'auto' });
      const delivery = schoolRoiDelivery(result);
      let historyRecorded = false;
      let warning = null;
      if (delivery.sent || delivery.redirected) {
        try { await recordSent({ id: issued.issuedLink.id, toEmail: to }); historyRecorded = true; }
        catch { warning = 'Transport was accepted but the request history update needs review. Check communication history before sending again.'; }
      }
      deliveries.push({ guardianUserId: recipientGuardianUserId, name: [guardian.first_name, guardian.last_name].filter(Boolean).join(' '), email: to,
        sent: delivery.sent, redirected: delivery.redirected === true, communicationId: delivery.communication_id || null,
        historyRecorded, ...(warning ? { warning } : {}),
        status: delivery.redirected ? 'redirected' : delivery.sent ? 'sent' : result?.pendingApproval || result?.queued ? 'pending' : 'failed' });
    } catch (error) {
      deliveries.push({ guardianUserId: recipientGuardianUserId, email: guardian.email || null, sent: false, status: 'failed', error: error.message });
    }
  }
  const accepted = deliveries.every(row => ['sent', 'redirected', 'recently_sent'].includes(row.status));
  return { ok: accepted, deliveries, message: accepted
    ? 'Portal requests recorded separately for the selected authorized guardians. Review each delivery status.' : 'Some guardian requests need follow-up. Review each delivery status.' };
}
