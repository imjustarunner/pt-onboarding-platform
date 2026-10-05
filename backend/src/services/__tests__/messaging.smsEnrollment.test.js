import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: vi.fn(), recordSmsPermission: vi.fn(), isSmsSuppressed: vi.fn() }));
import { getSmsSender, recordSmsPermission, isSmsSuppressed } from '../smsCompliance.service.js';
import pool from '../../config/database.js';
import { enrollSmsRecipient, saveSmsRegistration } from '../smsEnrollment.service.js';
const registration = { brandId: 'B123', campaignId: 'C123', resellerId: 'R123', brandName: 'ITSCO', legalName: 'ITSCO, LLC',
  supportContact: 'support@itsco.health', website: 'https://www.itsco.health', privacyUrl: 'https://www.itsco.health/privacy',
  termsUrl: 'https://www.itsco.health/terms', evidenceUrl: 'https://www.itsco.health/proof',
  purposes: ['reminders'], keywordOwner: 'application', approved: true, numberLinked: true };
const enrollment = { from: '+13035550100', phone: '+13035550101', purpose: 'reminders', status: 'opted_in', actorUserId: 7,
  evidence: { source: 'web_form', reference: 'request:4', signatureReference: 'request:4', signerVerified: true,
    disclosure: 'Exact disclosed choices', collectedAt: '2026-01-01T00:00:00Z' } };
beforeEach(() => {
  vi.resetAllMocks(); getSmsSender.mockResolvedValue({ registration, scope: 'campaign:C123', phone_number: enrollment.from });
  isSmsSuppressed.mockResolvedValue(false);
});
describe('signed enrollment', () => {
  it('rejects conflicting purposes on another number of the same campaign', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 3, agency_id: 2 }]]).mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ registration_json: { ...registration, purposes: ['marketing'] } }]]);
    await expect(saveSmsRegistration({ numberId: 3, registration, actorUserId: 7 })).rejects.toMatchObject({ code: 'sms_campaign_inconsistent' });
  });
  it('sends the recurring confirmation for a reviewed signature', async () => {
    const sendConfirmation = vi.fn();
    await enrollSmsRecipient({ ...enrollment, sendConfirmation });
    expect(sendConfirmation.mock.calls[0][0].body).toContain('Message and data rates may apply');
    expect(recordSmsPermission.mock.calls[0][0]).toMatchObject({ purpose: 'reminders', status: 'opted_in' });
  });
  it('disables consent when the required confirmation fails', async () => {
    await expect(enrollSmsRecipient({ ...enrollment, sendConfirmation: vi.fn().mockRejectedValue(new Error('provider unavailable')) })).rejects.toThrow('provider unavailable');
    expect(recordSmsPermission.mock.calls.at(-1)[0]).toMatchObject({ status: 'opted_out', evidence: { source: 'confirmation_failed' } });
  });
  it('never allows a signed form to override STOP', async () => {
    isSmsSuppressed.mockResolvedValue(true);
    const sendConfirmation = vi.fn();
    await expect(enrollSmsRecipient({ ...enrollment, sendConfirmation })).rejects.toMatchObject({ code: 'sms_opted_out' });
    expect(recordSmsPermission).not.toHaveBeenCalled(); expect(sendConfirmation).not.toHaveBeenCalled();
  });
});
