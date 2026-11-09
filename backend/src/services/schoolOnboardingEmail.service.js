import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { pickPreferredSenderIdentityStrict } from './emailSenderIdentityResolver.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { enrollmentMailBrand, escapePortalHtml, portalMessageHtml } from './portalEmailBranding.service.js';
import { compactSchoolCareBridgeEmail } from './schoolCareBridgeEmail.service.js';

export function schoolOnboardingMessage({ invite, agency, text, link }) {
  const brand = enrollmentMailBrand({ agency, school:true, clinicalOverride:false });
  const logo = brand.agencyLogo ? `<img src="${escapePortalHtml(brand.agencyLogo)}" width="150" alt="${escapePortalHtml(brand.name)}" style="max-width:150px;height:auto">` : '';
  const html = `<div data-school-onboarding="v1" style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#263b46"><div style="padding:20px;background:#f1f7f5;border-bottom:3px solid #26745a">${logo}<h2 style="margin:12px 0 0">${escapePortalHtml(brand.name)} · SchoolCareBridge</h2></div><div style="padding:24px">${portalMessageHtml({text,linkUrl:link,linkLabel:'Continue your school onboarding'})}</div></div>`;
  return compactSchoolCareBridgeEmail({text,html,templateType:'school_onboarding_reminder'});
}

export async function sendSchoolOnboardingMessage({invite,agency,subject,text,link,kind='invite'}) {
  // These are school relationship emails. Never fall back to People Operations,
  // a tenant default, or a platform mailbox when the Schools sender is missing.
  const identities = await EmailSenderIdentity.list({agencyId:invite.agency_id,includePlatformDefaults:false,onlyActive:true});
  const identity = pickPreferredSenderIdentityStrict(identities,['schools']);
  if (!identity?.id) return {blocked:true,reason:'schools_sender_not_configured'};
  const content = schoolOnboardingMessage({invite,agency,text,link});
  const itsco = String(agency.slug || '').toLowerCase()==='itsco';
  return sendEmailFromIdentity({senderIdentityId:identity.id,to:invite.contact_email,subject,...content,
    replyToOverride:identity.from_email,cc:itsco?'rachel@itsco.health':null,
    source:'auto',userId:invite.primary_user_id,templateType:`school_onboarding_${kind}`,linkUrl:link,
    schoolOrganizationId:invite.school_organization_id});
}
