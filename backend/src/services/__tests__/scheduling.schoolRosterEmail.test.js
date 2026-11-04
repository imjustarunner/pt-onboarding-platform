import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ context: vi.fn(), mailboxes: vi.fn(), optedOut: vi.fn(), optOut: vi.fn(), send: vi.fn(), render: vi.fn(), url: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../clientPortalEmail.service.js', () => ({ clientEmailContext: m.context }));
vi.mock('../providerWaitlistEmail.service.js', () => ({ resolveWaitlistMailboxes: m.mailboxes }));
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
  m.mailboxes.mockResolvedValue({ support: 'support@example.test', senderIdentityId: 3 });
  m.optedOut.mockResolvedValue(false);
  m.optOut.mockResolvedValue({ url: 'https://example.test/scoped-opt-out', scopeKey: 'scope' });
  m.render.mockImplementation(({ html }) => html);
  m.send.mockResolvedValue({ id: 20 });
});
describe('school roster family appointments link', () => {
  it('uses the tenant portal appointments destination with the client and preserves body and receipt action', async () => {
    const args = { agencyId: 450, clientId: 2340, to: 'family@example.com', subject: 'Reviewed subject', text: 'Reviewed text', html: '<p>Reviewed text</p><a href="https://example.test/receipt">I received this</a>' };
    await sendRosterEmail(args);
    expect(m.context).toHaveBeenCalledWith({ agencyId: 450, clientId: 2340 });
    expect(m.url).toHaveBeenCalledWith('guardian?panel=appointments&clientId=2340');
    const sent = m.send.mock.calls[0][0];
    expect(sent).toMatchObject({ agencyId: 450, clientId: 2340, subject: args.subject, templateType: 'school_session_notice', schoolSessionScopeKey: 'scope' });
    expect(sent.html).toContain(args.html);
    expect(sent.html).toContain('https://app.example.test/qa450/guardian?panel=appointments&amp;clientId=2340');
    expect(sent.text).toContain('Review my appointments: https://app.example.test/qa450/guardian?panel=appointments&clientId=2340');
    expect(sent.text).not.toContain('/login');
    expect(sent.html.match(/Review my appointments/g)).toHaveLength(1);
  });
  it('retains the existing scoped opt-out before resolving a portal or sending anything', async () => {
    m.optedOut.mockResolvedValue(true);
    expect(await sendRosterEmail({ agencyId: 450, clientId: 2340, to: 'family@example.com', text: 'Reviewed text' })).toMatchObject({ skipped: true });
    expect(m.optedOut).toHaveBeenCalledWith({ agencyId: 450, clientId: 2340, to: 'family@example.com' });
    expect(m.context).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
});
