import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ context: vi.fn(), sender: vi.fn(), optedOut: vi.fn(), optOut: vi.fn(), send: vi.fn(), render: vi.fn(), url: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../clientPortalEmail.service.js', () => ({ clientEmailContext: m.context }));
vi.mock('../dayCancellationEmail.service.js', () => ({ resolveDayCancellationEmail: m.sender,reviewedDayCancellationContext:vi.fn() }));
vi.mock('../portalEmailBranding.service.js', () => ({ renderPortalEmail: m.render }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../schoolSessionEmailPreferences.service.js', () => ({
  isSchoolSessionEmailOptedOut: m.optedOut, createSchoolSessionEmailOptOutLink: m.optOut,
  schoolSessionEmailOptOutContent: () => ({ text: '\nScoped opt-out', html: '<p>Scoped opt-out</p>' }),
  SCHOOL_EMAIL_TEMPLATE: 'school_session_notice'
}));
import { sendRosterEmail } from '../cancellationSchoolRoster.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  m.url.mockImplementation(path => `https://app.example.test/qa450/${path}`);
  m.context.mockResolvedValue({ brand: { tenantName: 'Demo' }, tenant: { name: 'Demo' }, url: m.url });
  m.sender.mockResolvedValue({ senderIdentityId:3,fromDisplayNameOverride:'Provider via ITSCO',replyToOverride:'provider@example.test',cc:['support@example.test'],reviewedCancellationToken:'signed-token',reviewedCancellationItemKey:'school_roster:450:7:2026-11-04:2340:4' });
  m.optedOut.mockResolvedValue(false);
  m.optOut.mockResolvedValue({ url: 'https://example.test/scoped-opt-out', scopeKey: 'scope' });
  m.render.mockImplementation(({ html }) => html);
  m.send.mockResolvedValue({ id: 20 });
});
describe('school roster family appointments link', () => {
  it('uses the tenant portal appointments destination with the client and preserves body and receipt action', async () => {
    const args = { agencyId: 450, providerId:7,clientId: 2340, to: 'family@example.com', subject: 'Reviewed subject', text: 'Reviewed text', html: '<p>Reviewed text</p><a href="https://example.test/receipt">I received this</a>',generatedByUserId:7,reviewedCancellationToken:'signed-token',reviewedCancellationItemKey:'school_roster:450:7:2026-11-04:2340:4' };
    await sendRosterEmail(args);
    expect(m.context).toHaveBeenCalledWith({ agencyId: 450, clientId: 2340 });
    expect(m.url).toHaveBeenCalledWith('guardian?panel=appointments&clientId=2340');
    const sent = m.send.mock.calls[0][0];
    expect(sent).toMatchObject({ agencyId: 450, clientId: 2340, subject: args.subject, templateType: 'day_cancellation',replyToOverride:'provider@example.test',cc:['support@example.test'],reviewedCancellationToken:'signed-token' });
    expect(sent.html).toContain(args.html);
    expect(sent.html).toContain('https://app.example.test/qa450/guardian?panel=appointments&amp;clientId=2340');
    expect(sent.text).toContain('Review my appointments: https://app.example.test/qa450/guardian?panel=appointments&clientId=2340');
    expect(sent.text).not.toContain('/login');
    expect(sent.html.match(/Review my appointments/g)).toHaveLength(1);
  });
  it('keeps reminder-only opt-out separate from the verified operational cancellation', async () => {
    m.optedOut.mockResolvedValue(true);
    await sendRosterEmail({ agencyId: 450, clientId: 2340,providerId:7,to: 'family@example.com', text: 'Reviewed text',generatedByUserId:7,reviewedCancellationToken:'signed-token',reviewedCancellationItemKey:'school_roster:450:7:2026-11-04:2340:4' });
    expect(m.optedOut).not.toHaveBeenCalled();expect(m.optOut).not.toHaveBeenCalled();
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({templateType:'day_cancellation',reviewedCancellationToken:'signed-token'}));
  });
});
