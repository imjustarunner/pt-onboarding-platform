import { emailDraftContent, EMAIL_HISTORY_MARKER } from '../../utils/emailReplyContent.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2, name: 'ITSCO', slug: 'itsco' })) } }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: () => {} }));
vi.mock('../schoolCommunicationContext.service.js', () => ({ isSchoolCommunication: vi.fn(async () => false) }));
vi.mock('../misdirectedEmailReport.service.js', () => ({ createMisdirectedEmailReportLink: vi.fn(async () => 'https://example.org/report') }));
vi.mock('../tenantEmailChrome.service.js', () => ({ wrapOutboundHtmlWithTenantChrome: vi.fn(async ({ html }) => html) }));
vi.mock('../agencySocialLinks.service.js', () => ({ listSignatureSocialLinks: vi.fn(async () => []), getAgencySignatureTagline: vi.fn(async () => null), platformLabel: () => 'PlotTwistCo' }));
vi.mock('../schoolGroupSubscription.service.js', () => ({ lookupSchoolStaffGroupContext: vi.fn(async () => null) }));
vi.mock('../unifiedEmail/gmailClient.js', () => ({ getGmailClient: vi.fn(), getImpersonatedUser: () => 'ai@plottwistco.com' }));
import pool from '../../config/database.js';
import { finalizeOutboundContent } from '../unifiedEmail/unifiedEmailSender.service.js';
import { getGmailClient } from '../unifiedEmail/gmailClient.js';
import { buildStaffSignatureHtml, buildStaffSignatureText } from '../staffHtmlEmailSignature.service.js';
import { wrapOutboundHtmlWithTenantChrome } from '../tenantEmailChrome.service.js';

let staff;
const identity = { id: 7, agency_id: 2, identity_key: 'messages', display_name: 'Michael Mendez', from_email: 'messages@itsco.health', reply_to: 'michael@itsco.health' };
const message = { identity, agencyId: 2, generatedByUserId: 5, source: 'manual', templateType: 'hub_email', to: 'haley@example.org', text: 'Hello Haley', html: '<p>Hello Haley</p>' };
beforeEach(() => {
  vi.clearAllMocks();
  staff = { id: 5, first_name: 'Michael', last_name: 'Mendez', credential: 'MA, LPC', title: 'Director of Operations', email: 'michael@itsco.health', work_email: 'michael@itsco.health', work_phone_extension: '701', role: 'admin', email_signature_enabled: 1 };
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM users WHERE id')) return [[staff]];
    if (sql.includes('FROM agencies WHERE id')) return [[{ id: 2, name: 'ITSCO', slug: 'itsco', phone_number: '719-657-7444' }]];
    if (sql.includes('FROM email_sender_identities')) return [[{ from_email: 'michael@itsco.health' }]];
    return [[]];
  });
});

describe('outbound email author signature', () => {
  it.each(['messages', 'personal_5'])('adds only the staff signature through %s', async identity_key => {
    const result = await finalizeOutboundContent({ ...message, identity: { ...identity, identity_key } });
    expect(result.html.match(/<!-- pt-staff-html-signature -->/g)).toHaveLength(1);
    expect(result.html).not.toContain('pt-department-html-signature');
    expect(result.html).not.toContain('messages@itsco.health');
    expect(result.html).toContain('michael@itsco.health');
    expect(result.html).toContain('Director of Operations');
    expect(result.html).toContain('MA, LPC');
    expect(result.html).toContain('Ext. 701');
    expect(result.text).toContain('Ext. 701');
    expect(result.html.match(/CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION!/g)).toHaveLength(1);
    expect(getGmailClient).not.toHaveBeenCalled();
    expect(identity.reply_to).toBe('michael@itsco.health');
  });
  it.each(['provider', 'intern', 'staff', 'support', 'supervisor', 'clinical_practice_assistant'])('includes the assigned extension for %s', async role => {
    staff.role = role;
    const result = await finalizeOutboundContent(message);
    expect(result.html).toContain('pt-staff-html-signature');
    expect(result.html).toContain('Ext. 701');
    expect(result.text).toContain('Ext. 701');
    expect(result.html).not.toContain('pt-department-html-signature');
  });
  it('keeps department signatures for automated confirmations even with an initiating user', async () => {
    const result = await finalizeOutboundContent({ ...message, source: 'automation', templateType: 'intake_packet_completion', identity: { ...identity, identity_key: 'notifications', from_email: 'notifications@itsco.health', display_name: 'ITSCO Notifications' } });
    expect(result.html).toContain('pt-department-html-signature');
    expect(result.html).not.toContain('<!-- pt-staff-html-signature -->');
    expect(result.html).toContain('notifications@itsco.health');
  });
  it('keeps manually sent department digests attributed to the department', async () => {
    const result = await finalizeOutboundContent({ ...message, templateType: 'compliance_digest' });
    expect(result.html).toContain('pt-department-html-signature');
    expect(result.html).not.toContain('<!-- pt-staff-html-signature -->');
  });
  it('keeps manually triggered Provider Updates attributed to People Operations', async () => {
    const result = await finalizeOutboundContent({ ...message, templateType: 'provider_update_invite',
      identity: { ...identity, identity_key: 'people_ops', display_name: 'ITSCO People Operations', from_email: 'po@itsco.health' } });
    expect(result.html).toContain('pt-department-html-signature');
    expect(result.html).not.toContain('<!-- pt-staff-html-signature -->');
    expect(result.html).toContain('po@itsco.health');
  });
  it.each(['auto', 'manual'])('uses the standard branded layout and Notifications signature for %s completion receipts', async source => {
    const result = await finalizeOutboundContent({ ...message, source, templateType: 'provider_update_completion_receipt',
      text: 'Hi Michael,\n\nYour recorded time was 16 minutes, 41 seconds.\n\nView your time claims: https://example.org/payroll?tab=claims&agency=2\n\nITSCO',
      identity: { ...identity, identity_key: 'notifications', display_name: 'ITSCO Notifications', from_email: 'notifications@itsco.health', reply_to: 'technology@itsco.health' } });
    expect(result.html).toContain('data-pt-provider-update-receipt="1"');
    expect(result.html).toContain('16 minutes, 41 seconds');
    expect(result.html).toContain('<img');
    expect(result.html.match(/<!-- pt-department-html-signature -->/g)).toHaveLength(1);
    expect(result.html).not.toContain('<!-- pt-staff-html-signature -->');
    expect(result.html).toContain('notifications@itsco.health');
    expect(result.html).not.toContain('&nbsp;</p>');
    expect(result.html).not.toContain('Director of Operations');
    expect(result.html).toContain('href="https://example.org/payroll?tab=claims&amp;agency=2"');
    expect(wrapOutboundHtmlWithTenantChrome).toHaveBeenCalledOnce();
    expect(wrapOutboundHtmlWithTenantChrome).toHaveBeenCalledWith(expect.objectContaining({
      agencyId: 2,
      html: expect.stringContaining('<!-- pt-department-html-signature -->'),
      opts: { replyMailto: 'technology@itsco.health' }
    }));
    expect(getGmailClient).not.toHaveBeenCalled();
  });
  it('honors an explicitly disabled staff signature without adding the mailbox signature', async () => {
    staff.email_signature_enabled = 0;
    const result = await finalizeOutboundContent(message);
    expect(result.html).not.toContain('pt-staff-html-signature');
    expect(result.html).not.toContain('pt-department-html-signature');
    expect(result.html).not.toContain('messages@itsco.health');
  });
  it('does not add a second staff signature on re-finalization', async () => {
    const first = await finalizeOutboundContent(message);
    const second = await finalizeOutboundContent({ ...message, text: first.text, html: first.html });
    expect(second.html.match(/<!-- pt-staff-html-signature -->/g)).toHaveLength(1);
    expect(second.html).not.toContain('pt-department-html-signature');
  });
  it('does not invent an extension when none is assigned', async () => {
    staff.work_phone_extension = null;
    const result = await finalizeOutboundContent(message);
    expect(result.html).not.toContain('Ext.');
    expect(result.text).not.toContain('Ext.');
  });
  it.each(['701', 'Ext. 701', 'x701'])('normalizes extension %s in HTML and plain text', extension => {
    const ctx = { displayName: 'Staff', email: 'staff@example.org', extension, phone: { display: '719-657-7444', tel: '+17196577444' } };
    for (const render of [buildStaffSignatureHtml, buildStaffSignatureText]) {
      expect(render(ctx)).toContain('Ext. 701');
      expect(render(ctx)).not.toContain('Ext. Ext.');
      expect(render({ ...ctx, phone: { display: '719-657-7444 Ext. 701' } }).match(/Ext\. 701/g)).toHaveLength(1);
    }
  });
});

it('places the author signature after the reply and before formatted quoted history, including on retry',async()=>{
 const content=emailDraftContent({text:'Thanks for the update',quotedText:'Earlier sender message',quotedHtml:'<p>Earlier sender message</p><table><tr><td>Earlier signature</td></tr></table>'});
 const first=await finalizeOutboundContent({...message,...content});
 expect(first.html.indexOf('Thanks for the update')).toBeLessThan(first.html.indexOf('<!-- pt-staff-html-signature -->'));
 expect(first.html.indexOf('<!-- pt-staff-html-signature -->')).toBeLessThan(first.html.indexOf(EMAIL_HISTORY_MARKER));
 expect(first.text.indexOf('Ext. 701')).toBeLessThan(first.text.indexOf('Earlier sender message'));
 const second=await finalizeOutboundContent({...message,...first});
 expect(second.html.match(/<!-- pt-staff-html-signature -->/g)).toHaveLength(1);
 expect(second.html.match(/Earlier signature/g)).toHaveLength(1);
});

it.each(['manual', 'co_guardian_invite'])('keeps %s portal mail co-branded without the initiating staff signature', async source => {
 const result = await finalizeOutboundContent({ ...message, source, templateType: 'guardian_enrollment_forward',
   identity: { ...identity, identity_key: 'clinical_enrollment_portal', from_email: 'portal@auricwell.com', reply_to: 'support@itsco.health' } });
 expect(result.html).toContain('AuricWell Portal');
 expect(result.html).toContain('aria-label="AuricWell Portal"');
 expect(result.html).toContain('ITSCO');
 expect(result.html).not.toContain('pt-staff-html-signature');
 expect(result.html).not.toContain('pt-department-html-signature');
 expect(result.html).not.toContain('Michael Mendez');
 expect(result.html).toContain('Report misdirected email');
 expect(result.html.match(/data-portal-email=/g)).toHaveLength(1);
 const { wrapOutboundHtmlWithTenantChrome } = await import('../tenantEmailChrome.service.js');
 expect(wrapOutboundHtmlWithTenantChrome).not.toHaveBeenCalled();
});

it('preserves reviewed family billing branding on an approval retry without adding a staff or department signature',async()=>{
 const brand={clinical:true,name:'ITSCO',displayName:'ITSCO Billing',replyTo:'billing@itsco.health',products:['AuricWell']};
 const input={...message,templateType:'family_balance_due',identity:{...identity,identity_key:'billing',from_email:'billing@itsco.health'},portalEmailBrand:brand};
 const first=await finalizeOutboundContent(input);
 const second=await finalizeOutboundContent({...input,portalEmailBrand:null,...first});
 for(const result of [first,second]){
   expect(result.html.match(/data-portal-email=/g)).toHaveLength(1);
   expect(result.html).not.toContain('pt-staff-html-signature');expect(result.html).not.toContain('pt-department-html-signature');expect(result.html).not.toContain('Michael Mendez');
 }
 expect(wrapOutboundHtmlWithTenantChrome).not.toHaveBeenCalled();
});
