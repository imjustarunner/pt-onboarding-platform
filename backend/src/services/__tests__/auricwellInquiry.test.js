import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../email.service.js', () => ({ default: { sendEmail: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: vi.fn() } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByAgencyAndIdentityKey: vi.fn(async () => null) } }));
vi.mock('../../config/config.js', () => ({ default: { nodeEnv: 'test' } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 1, slug: 'platform', name: 'Platform', support_team_email: 'old@example.test' })), findByPortalUrl: vi.fn(async () => ({ id: 1, slug: 'platform', name: 'Platform' })) } }));
vi.mock('../publicWebsiteIdentity.service.js', () => ({ getPublicWebsiteIdentity: vi.fn(async () => null) }));
vi.mock('../publicWebsiteTicketRouting.service.js', () => ({ routePublicWebsiteTicket: vi.fn() }));
vi.mock('../websiteChatReferral.service.js', () => ({ resolveChatReferral: vi.fn() }));
vi.mock('../../utils/supportTicketCrypto.js', () => ({ prepareEncryptedTicketText: text => ({ plain: text }) }));
import pool from '../../config/database.js';
import EmailService from '../email.service.js';
import Notification from '../../models/Notification.model.js';
import { deliverAuricwellInquiry } from '../auricwellInquiry.service.js';
import { createPublicAgencySupportTicket, getPublicAgencySupportConfig } from '../publicAgencySupport.service.js';

const inquiry = { name: 'Fictional Visitor', email: 'visitor@example.test', message: 'Please help set up a new practice account.', category: 'intake_join', phiAcknowledged: true };
beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockImplementation(async sql => sql.includes('INSERT INTO support_tickets') ? [{ insertId: 42 }] : [[]]);
  EmailService.sendEmail.mockResolvedValue({ id: 'accepted' });
});
it('uses the shared support form configuration without exposing internal recipients', async () => {
  const config = await getPublicAgencySupportConfig('auricwell');
  expect(config.agency.name).toBe('AuricWell');
  expect(config.categories.map(c => c.label)).toContain('New practice or account setup');
  expect(JSON.stringify(config)).not.toMatch(/michael@|melissa@|admin@auricwell|old@example/);
});
it('saves the inquiry before emailing both fixed recipients and ignores recipient overrides', async () => {
  const result = await createPublicAgencySupportTicket('auricwell', { ...inquiry, to: 'attacker@example.test' });
  expect(result).toMatchObject({ ok: true, ticketId: 42, emailDelivered: true });
  expect(EmailService.sendEmail.mock.calls.map(([input]) => input.to).sort()).toEqual(['admin@auricwell.com']);
  for (const [input] of EmailService.sendEmail.mock.calls) {
    expect(input).toMatchObject({ fromAddress: 'notifications@plottwistco.com', fromName: 'AuricWell', replyTo: inquiry.email });
    expect(input.text).toContain(inquiry.message);
  }
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('source_website_slug'), ['auricwell', 42, 1]);
  expect(Notification.create).not.toHaveBeenCalled();
});
it('retains the ticket when the group alert fails', async () => {
  EmailService.sendEmail.mockImplementation(async input => {
    throw new Error('Temporary send failure');
  });
  expect(await createPublicAgencySupportTicket('auricwell', inquiry)).toMatchObject({ ticketId: 42, emailDelivered: false });
  expect(EmailService.sendEmail).toHaveBeenCalledTimes(1);
});
it('never sends an alert when saving the ticket fails', async () => {
  pool.execute.mockRejectedValue(new Error('Database unavailable'));
  await expect(createPublicAgencySupportTicket('auricwell', inquiry)).rejects.toThrow('Database unavailable');
  expect(EmailService.sendEmail).not.toHaveBeenCalled();
});
it.each([{ skipped: true }, { blocked: true }, { queued: true }, { pendingApproval: true }, { redirected: true }, { success: false }])('does not claim mail was accepted when held or redirected: %j', async flags => {
  expect(await deliverAuricwellInquiry({ subject: 'Test', text: 'Fictional inquiry' }, { send: async () => ({ id: 'logged', ...flags }) })).toBe(false);
});
