import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../chatEncryption.service.js', () => ({
  isChatEncryptionConfigured: vi.fn(() => true),
  encryptChatText: vi.fn((text) => ({ ciphertextB64: `encrypted:${text}` })),
  decryptChatText: vi.fn((value) => value.ciphertextB64.replace('encrypted:', ''))
}));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: vi.fn() }));
vi.mock('../smsEnrollment.service.js', () => ({ enrollSmsRecipient: vi.fn() }));
import pool from '../../config/database.js';
import { isChatEncryptionConfigured, encryptChatText } from '../chatEncryption.service.js';
import { getSmsSender } from '../smsCompliance.service.js';
import { enrollSmsRecipient } from '../smsEnrollment.service.js';
import { validateSmsSignature, signSmsConsentRequest, viewSmsConsentRequest, reviewSmsConsentRequest } from '../smsConsentRequest.service.js';
import { buildSmsConsentDisclosure } from '../../utils/smsConsentDisclosure.js';

const registration = { brandName: 'ITSCO', legalName: 'ITSCO, LLC', supportContact: 'support@itsco.health',
  termsUrl: 'https://www.itsco.health/terms', privacyUrl: 'https://www.itsco.health/privacy', purposes: ['care', 'reminders'] };
const disclosure = buildSmsConsentDisclosure(registration);
const disclosureHash = createHash('sha256').update(JSON.stringify(disclosure)).digest('hex');
const token = 'a'.repeat(64);
const row = { id: 4, agency_id: 2, number_id: 3, phone: '+13035550101', signer_role: 'guardian',
  disclosure_json: disclosure, disclosure_hash: disclosureHash, signed_at: null };
const signature = { disclosureHash, signerName: 'Sample Guardian', phone: row.phone,
  choices: { care: 'yes', reminders: 'no' }, authorityAccepted: true, electronicSignatureAccepted: true };
const valid = { ...signature, disclosure, expectedHash: disclosureHash, expectedPhone: row.phone };
beforeEach(() => {
  vi.clearAllMocks(); isChatEncryptionConfigured.mockReturnValue(true);
  pool.execute.mockResolvedValue([[row]]);
});

describe('recipient/guardian signatures', () => {
  it('allows a signed decline of every optional program', () => {
    expect(validateSmsSignature({ ...valid, choices: { care: 'no', reminders: 'no' } })).toEqual([]);
  });
  it.each([
    { signerName: '' }, { signerName: 123 }, { authorityAccepted: false }, { electronicSignatureAccepted: false },
    { disclosureHash: 'stale' }, { phone: '+13035550199' }, { choices: { care: 'yes' } }, { choices: { care: null, reminders: null } }, { choices: { care: 'yes', reminders: null } },
    { choices: { care: 'yes', reminders: 'no', marketing: 'yes' } }
  ])('refuses incomplete or mismatched signatures: %j', (patch) => {
    expect(validateSmsSignature({ ...valid, ...patch }).length).toBeGreaterThan(0);
  });
  it('only returns masked recipient data to a signing link', async () => {
    const result = await viewSmsConsentRequest(token);
    expect(result).toMatchObject({ phoneLastFour: '0101', signerRole: 'guardian', signed: false });
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('signed_payload_json');
    expect(pool.execute.mock.calls[0][1][0]).not.toBe(token);
  });
  it('saves the exact version, choices and electronic signature encrypted, without sending', async () => {
    pool.execute.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect(await signSmsConsentRequest({ token, input: signature, ip: '127.0.0.1', userAgent: 'test' })).toMatchObject({ signed: true, awaitingReview: true });
    expect(JSON.parse(encryptChatText.mock.calls[0][0])).toMatchObject({ signerName: 'Sample Guardian', signerRole: 'guardian', choices: signature.choices, disclosure, disclosureHash });
    expect(enrollSmsRecipient).not.toHaveBeenCalled();
  });
  it('does not save unsigned or stale requests', async () => {
    await expect(signSmsConsentRequest({ token, input: { ...signature, electronicSignatureAccepted: false } })).rejects.toMatchObject({ status: 400 });
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(encryptChatText).not.toHaveBeenCalled();
  });
  it('fails closed when encryption is unavailable', async () => {
    isChatEncryptionConfigured.mockReturnValue(false);
    await expect(signSmsConsentRequest({ token, input: signature })).rejects.toThrow('Encryption is unavailable');
    expect(encryptChatText).not.toHaveBeenCalled();
  });
  it('requires an explicit signer review attestation', async () => {
    await expect(reviewSmsConsentRequest({ agencyId: 2, requestId: 4, actorUserId: 7 })).rejects.toMatchObject({ code: 'sms_review_required' });
    expect(enrollSmsRecipient).not.toHaveBeenCalled();
  });
  it('cannot activate a request without a stored signature', async () => {
    await expect(reviewSmsConsentRequest({ agencyId: 2, requestId: 4, actorUserId: 7, signerVerified: true })).rejects.toMatchObject({ code: 'sms_signature_missing' });
    expect(enrollSmsRecipient).not.toHaveBeenCalled();
  });
  it('checks the agency and current disclosure before activation', async () => {
    const signed = { ...signature, disclosure, signedAt: '2026-01-01T00:00:00Z' };
    pool.execute.mockResolvedValueOnce([[{ ...row, signed_at: new Date(), signed_payload_json: { ciphertextB64: `encrypted:${JSON.stringify(signed)}` } }]])
      .mockResolvedValueOnce([[{ phone_number: '+13035550100' }]]);
    getSmsSender.mockResolvedValue({ registration: { ...registration, supportContact: 'changed@example.org' } });
    await expect(reviewSmsConsentRequest({ agencyId: 2, requestId: 4, actorUserId: 7, signerVerified: true })).rejects.toMatchObject({ code: 'sms_disclosure_changed' });
    expect(pool.execute.mock.calls[0][1]).toEqual([4, 2]);
    expect(enrollSmsRecipient).not.toHaveBeenCalled();
  });
  it('keeps client and staff subscription choices separate', () => {
    const program = { ...registration, purposes: ['care', 'reminders', 'workforce'] };
    expect(buildSmsConsentDisclosure(program, { signerRole: 'guardian' }).purposes.map(p => p.purpose)).toEqual(['care', 'reminders']);
    expect(buildSmsConsentDisclosure(program, { signerRole: 'staff' }).purposes.map(p => p.purpose)).toEqual(['workforce']);
  });
  it('activates only signed choices and retains per-purpose results', async () => {
    const signed = { ...signature, disclosure, signedAt: '2026-01-01T00:00:00Z' };
    pool.execute.mockReset().mockResolvedValue([{}]);
    pool.execute.mockResolvedValueOnce([[{ ...row, signed_at: new Date(), signed_payload_json: { ciphertextB64: `encrypted:${JSON.stringify(signed)}` } }]])
      .mockResolvedValueOnce([[{ phone_number: '+13035550100' }]])
      .mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ activation_json: null }]]);
    getSmsSender.mockResolvedValue({ registration, phone_number: '+13035550100' });
    await expect(reviewSmsConsentRequest({ agencyId: 2, requestId: 4, actorUserId: 7, signerVerified: true })).resolves.toMatchObject({ reviewed: true });
    expect(enrollSmsRecipient.mock.calls.map(([call]) => [call.purpose, call.status])).toEqual([['care', 'opted_in'], ['reminders', 'opted_out']]);
    expect(pool.execute.mock.calls.at(-1)[0]).toContain('review_token = NULL');
  });
  it.each(['newer', 'claimed'])('blocks activation when %s', async (reason) => {
    const signed = { ...signature, disclosure, signedAt: '2026-01-01T00:00:00Z' };
    pool.execute.mockReset().mockResolvedValue([{}]);
    pool.execute.mockResolvedValueOnce([[{ ...row, signed_at: new Date(), signed_payload_json: { ciphertextB64: `encrypted:${JSON.stringify(signed)}` } }]])
      .mockResolvedValueOnce([[{ phone_number: '+13035550100' }]])
      .mockResolvedValueOnce([reason === 'newer' ? [{ id: 5 }] : []])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    getSmsSender.mockResolvedValue({ registration });
    await expect(reviewSmsConsentRequest({ agencyId: 2, requestId: 4, actorUserId: 7, signerVerified: true })).rejects.toMatchObject({ code: reason === 'newer' ? 'sms_consent_superseded' : 'sms_review_in_progress' });
    expect(enrollSmsRecipient).not.toHaveBeenCalled();
  });

});
