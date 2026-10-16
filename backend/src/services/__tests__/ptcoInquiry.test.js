import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../email.service.js', () => ({ default: { sendEmail: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: vi.fn() } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByAgencyAndIdentityKey: vi.fn(async () => null) } }));
vi.mock('../../config/config.js', () => ({ default: { nodeEnv: 'test' } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findByPortalUrl: vi.fn(async () => ({ id: 1, slug: 'platform', name: 'Platform', support_team_email: 'old@example.test' })) } }));
vi.mock('../publicWebsiteIdentity.service.js', () => ({ getPublicWebsiteIdentity: vi.fn(async slug => ({ slug, name: 'Plot Twist Co.' })) }));
vi.mock('../publicWebsiteTicketRouting.service.js', () => ({ routePublicWebsiteTicket: vi.fn(async () => {}) }));
vi.mock('../websiteChatReferral.service.js', () => ({ resolveChatReferral: vi.fn(async () => null) }));
vi.mock('../../utils/supportTicketCrypto.js', () => ({ prepareEncryptedTicketText: text => ({ plain: text }) }));
vi.mock('../intakeResponsesEncryption.service.js', () => ({ encryptIntakePayload: () => ({ ciphertext: 'encrypted', ivB64: 'iv', authTagB64: 'tag', keyId: 'test' }), decryptIntakePayload: vi.fn() }));
import pool from '../../config/database.js';
import EmailService from '../email.service.js';
import { deliverPtcoInquiry } from '../ptcoInquiry.service.js';
import { createBusinessOnboardingService } from '../businessOnboarding.service.js';
import { createPublicAgencySupportTicket, getPublicAgencySupportConfig } from '../publicAgencySupport.service.js';

const contact = { name: 'Sample Visitor', email: 'visitor@example.test', message: 'Please tell me about medical billing.', category: 'billing', phiAcknowledged: true };
const business = { businessName: 'Sample Practice', firstName: 'Sample', lastName: 'Owner', email: 'owner@example.test', phone: '555-0100', path: 'operations', businessType: 'mental-health', stage: 'established', services: ['medical-billing', 'credentialing'], goals: 'Help with billing and payer enrollment.', consent: true };
beforeEach(() => {
  vi.clearAllMocks();
  EmailService.sendEmail.mockResolvedValue({ id: 'sent' });
  pool.execute.mockImplementation(async sql => sql.includes('INSERT INTO support_tickets') ? [{ insertId: 31 }] : [[]]);
});

describe('Plot Twist Co. inquiry delivery', () => {
  it('routes contact inquiries to admin even with a shared support agency and ignores public recipient overrides', async () => {
    const result = await createPublicAgencySupportTicket('ptco', { ...contact, to: 'wrong@example.test' }, null);
    expect(result).toMatchObject({ ticketId: 31, emailDelivered: true });
    expect(EmailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@plottwistco.com', fromAddress: 'notifications@plottwistco.com', replyTo: contact.email, text: expect.stringContaining(contact.message) }));
    expect((await getPublicAgencySupportConfig('ptco')).supportContact.email).toBe('admin@plottwistco.com');
  });
  it('does not redirect another website sharing the agency', async () => {
    await createPublicAgencySupportTicket('range', contact, null);
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
    expect((await getPublicAgencySupportConfig('range')).supportContact.email).toBe('old@example.test');
  });
  it('keeps the contact ticket when email delivery fails', async () => {
    EmailService.sendEmail.mockRejectedValue(new Error('Unavailable'));
    await expect(createPublicAgencySupportTicket('ptco', contact, null)).resolves.toMatchObject({ ticketId: 31, emailDelivered: false });
  });
  it.each([{ skipped: true }, { blocked: true }, { queued: true }, { pendingApproval: true }, { redirected: true }, { success: false }])('does not claim held or redirected mail was delivered: %j', async flag => {
    const send = vi.fn(async () => ({ id: 'log-id', ...flag }));
    expect(await deliverPtcoInquiry({ subject: 'Inquiry', text: 'Details' }, { send })).toBe(false);
  });
  it.each([true, false])('notifies once after committing a service request and records delivery status (%s)', async delivered => {
    let fingerprint, claimed = false;
    const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, args) => {
      if (sql.startsWith('INSERT INTO business_onboarding_requests')) fingerprint = args[1];
      if (sql.startsWith('SELECT submission_hash')) return [[{ submission_hash: fingerprint }]];
      if (sql.startsWith('SELECT id FROM business_onboarding_events')) return [claimed ? [{ id: 1 }] : []];
      if (sql.startsWith('INSERT INTO business_onboarding_events')) claimed = true;
      return [{}];
    }) };
    const store = { getConnection: async () => db, execute: vi.fn(async () => [{}]) };
    EmailService.sendEmail.mockImplementation(async () => {
      expect(db.commit).toHaveBeenCalled();
      if (!delivered) throw new Error('Unavailable');
      return { id: 'sent' };
    });
    const service = createBusinessOnboardingService({ pool: store });
    const id = '12345678-1234-4123-8123-123456789abc';
    await expect(service.submit(business, id)).resolves.toEqual({ id, status: 'submitted' });
    await service.submit(business, id);
    expect(EmailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(EmailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@plottwistco.com', replyTo: business.email, text: expect.stringContaining('credentialing, medical-billing') }));
    expect(store.execute).toHaveBeenCalledWith(expect.any(String), [id, delivered ? 'inquiry_email_sent' : 'inquiry_email_not_sent', null]);
  });
  it('never sends an inquiry email when the database transaction fails', async () => {
    const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn().mockRejectedValue(new Error('Database unavailable')) };
    const service = createBusinessOnboardingService({ pool: { getConnection: async () => db } });
    await expect(service.submit(business, '12345678-1234-4123-8123-123456789abc')).rejects.toThrow('Database unavailable');
    expect(db.rollback).toHaveBeenCalled();
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });
});
