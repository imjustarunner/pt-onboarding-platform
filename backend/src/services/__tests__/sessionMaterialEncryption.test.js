import { afterEach, describe, expect, it, vi } from 'vitest';
// KMS wrapping is replaced locally; AES-GCM and authenticated data are real.
vi.mock('@google-cloud/kms', () => ({ KeyManagementServiceClient: class {
  async encrypt({ plaintext }) { return [{ ciphertext: Buffer.from(plaintext) }]; }
  async decrypt({ ciphertext }) { return [{ plaintext: Buffer.from(ciphertext) }]; }
} }));
import DocumentEncryptionService from '../documentEncryption.service.js';
afterEach(() => vi.unstubAllEnvs());
describe('session material encryption compatibility', () => {
  it('round-trips the same encrypted file for staff and portal paths, while binding client, agency and filename', async () => {
    vi.stubEnv('DOCUMENTS_KMS_KEY', 'local-test-key'); vi.stubEnv('REFERRAL_KMS_KEY', '');
    const content = Buffer.from('Synthetic session worksheet');
    const identity = { agencyId: 450, clientId: 2273, originalName: 'worksheet.pdf' };
    const result = await DocumentEncryptionService.encryptBuffer(content, { aad: DocumentEncryptionService.sessionMaterialAad(identity) });
    const doc = { document_type: 'session_supporting_material', agency_id: 450, client_id: 2273, original_name: 'worksheet.pdf',
      encryption_key_id: result.encryptionKeyId, encryption_wrapped_key: result.encryptionWrappedKeyB64,
      encryption_iv: result.encryptionIvB64, encryption_auth_tag: result.encryptionAuthTagB64 };
    expect(result.encryptedBuffer).not.toEqual(content);
    expect(await DocumentEncryptionService.decryptPhiDocumentBuffer(doc, result.encryptedBuffer)).toEqual(content);
    for (const changed of [{ agency_id: 451 }, { client_id: 2298 }, { original_name: 'different.pdf' }]) {
      await expect(DocumentEncryptionService.decryptPhiDocumentBuffer({ ...doc, ...changed }, result.encryptedBuffer)).rejects.toThrow();
    }
  });
  it('keeps the established encrypted referral document format readable', async () => {
    vi.stubEnv('DOCUMENTS_KMS_KEY', 'local-test-key'); vi.stubEnv('REFERRAL_KMS_KEY', '');
    const content = Buffer.from('Synthetic referral');
    const result = await DocumentEncryptionService.encryptBuffer(content, { aad: JSON.stringify({ organizationId: 451, uploadType: 'referral_packet', filename: 'referral.pdf' }) });
    const doc = { document_type: 'referral_packet', school_organization_id: 451, original_name: 'referral.pdf',
      encryption_key_id: result.encryptionKeyId, encryption_wrapped_key: result.encryptionWrappedKeyB64,
      encryption_iv: result.encryptionIvB64, encryption_auth_tag: result.encryptionAuthTagB64 };
    expect(await DocumentEncryptionService.decryptPhiDocumentBuffer(doc, result.encryptedBuffer, name => name)).toEqual(content);
  });
});
