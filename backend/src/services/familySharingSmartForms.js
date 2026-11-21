import pool from '../config/database.js';
import { familySharingSchool } from './familySharingCatalog.js';
import Agency from '../models/Agency.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
import { canReceiveGuardianConsentRequest } from './schoolRoiGuardianConsent.service.js';
import { buildSmartSchoolRoiContext } from './smartSchoolRoi.service.js';
import { buildSmartDisclosureContext } from './smartDisclosure.service.js';
import { assignSmartDisclosureToPortal } from './clientUpdate.service.js';
import { clientAccess, recipientAccess } from './safetyPlans/access.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

export async function previewFamilySmartForm(client, key, locale) {
  if (!['en', 'es'].includes(locale)) throw fail(400, 'Choose a supported form language.');
  const agency = await Agency.findById(client.agency_id);
  if (key === 'smart-school-roi') {
    const school = await familySharingSchool(client);
    if (!school) throw fail(404, 'The client has no active school affiliation in this agency.');
    return { context: await buildSmartSchoolRoiContext({
      link: { form_type: 'smart_school_roi', language_code: locale, organization_id: school.id },
      boundClient: { ...client, organization_id: school.id },
      organization: await Agency.findById(school.id), agency
    }) };
  }

  if (key !== 'smart-disclosure') throw fail(404, 'Choose a current smart form.');
  const organization = client.organization_id ? await Agency.findById(client.organization_id) : null;
  const context = await buildSmartDisclosureContext({
    boundClient: client, agency, organization, locale,
    link: { form_type: 'smart_disclosure', language_code: locale, custom_messages: { disclosureAssignedTeamOnly: true } }
  });
  if (!context?.providers.length) throw fail(409, 'Assign a provider with current disclosure information before sharing this form.');
  return { context };
}

export async function assignFamilySmartForm(user, client, input) {
  await clientAccess(user, client.id, { write: true });
  const { key, locale, contentHash, recipient, authorityConfirmed } = input;
  if (!['en', 'es'].includes(locale)) throw fail(400, 'Choose a supported form language.');
  if (!['guardian', 'client'].includes(recipient?.kind)) throw fail(400, 'Choose a linked portal recipient.');
  if (recipient.kind === 'guardian' && authorityConfirmed !== true) throw fail(400, 'Confirm the guardian is authorized to sign.');
  const recipients = await ClientGuardian.listForClient(client.id);
  const link = recipients.find(row => Number(row.guardian_user_id) === Number(recipient.id));
  if (!link || !canReceiveGuardianConsentRequest(link)) throw fail(403, 'Choose a currently authorized portal signer.');
  await recipientAccess({ client_id: client.id, agency_id: client.agency_id, document_key: 'enrollment-document' }, recipient.id, recipient.kind);
  if (key === 'smart-disclosure') {
    return assignSmartDisclosureToPortal({
      agencyId: client.agency_id, clientId: client.id, guardianUserId: recipient.id,
      locale, contentHash, actorUserId: user.id, assignedTeamOnly: true
    });
  }

  if (key !== 'smart-school-roi') throw fail(404, 'Choose a current smart form.');
  if (recipient.kind !== 'guardian') throw fail(400, 'Choose an authorized guardian for the Smart School ROI.');
  const school = await familySharingSchool(client);
  if (!school) throw fail(404, 'The client has no active school affiliation in this agency.');
  const { ensureIssuedRoiSigningLinkForClient } = await import('../controllers/clientSchoolRoiAccess.controller.js');
  const args = { clientId: client.id, schoolOrganizationId: school.id, recipientGuardianUserId: recipient.id };
  const existing = await ClientSchoolRoiSigningLink.findForClient(args);
  const issued = await ensureIssuedRoiSigningLinkForClient({
    client, schoolOrganizationId: school.id, actorUserId: user.id, recipientGuardianUserId: recipient.id,
    preferredLanguageCode: locale, regenerate: existing?.status === 'completed'
  });
  if (!issued.ok) throw fail(issued.status || 409, issued.message);
  if (issued.issuedLink.status !== 'completed') {
    await pool.execute(`UPDATE client_school_roi_signing_links
      SET staff_requested_at=CURRENT_TIMESTAMP, staff_requested_by_user_id=?,
          roi_context_json=JSON_SET(COALESCE(roi_context_json,JSON_OBJECT()),'$.issuedConfig',
            JSON_SET(COALESCE(JSON_EXTRACT(roi_context_json,'$.issuedConfig'),JSON_OBJECT()),'$.preferredLanguageCode',?))
      WHERE id=? AND client_id=? AND school_organization_id=? AND recipient_guardian_user_id=? AND status<>'completed'`,
      [user.id, locale, issued.issuedLink.id, client.id, school.id, recipient.id]);
  }
  return { assigned: true, invitationSent: false };
}
