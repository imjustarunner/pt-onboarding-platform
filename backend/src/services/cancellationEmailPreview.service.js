import { enrollmentMailBrand, renderPortalEmail, portalMessageHtml } from './portalEmailBranding.service.js';

export async function previewCancellationEmail({ agencyId, subject, text, school = false, clientId = null, learning }, overrides = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 6000 || typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject)) {
    throw Object.assign(new Error('Add a valid subject and message before previewing the email.'), { status: 400 });
  }
  const d = {
    agency: async id => (await import('../models/Agency.model.js')).default.findById(id),
    context: async args => (await import('./clientPortalEmail.service.js')).clientEmailContext(args),
    domain: async id => (await import('./tenantMessageMailboxes.service.js')).inferAgencyMailDomain(id), ...overrides
  };
  const agency = await d.agency(agencyId);
  if (!agency) throw Object.assign(new Error('The organization for this email is unavailable.'), { status: 404 });
  const brand = clientId ? (await d.context({agencyId,clientId,...(learning ? {learning:true} : {})})).brand
    : enrollmentMailBrand({ agency, domain: await d.domain(agencyId), school: school === true });
  // Use the sending layout without minting receipt links, creating deliveries,
  // changing appointments, or contacting an email transport.
  const body = portalMessageHtml({ text: text.trim() });
  const exampleAction = '<p><span style="display:inline-block;background:#16457c;color:#fff;padding:12px 20px;border-radius:8px;font-weight:700">Review my appointments</span></p>';
  return { subject: subject.trim(), html: renderPortalEmail({ brand, text: text.trim(), html: body + exampleAction }) };
}
