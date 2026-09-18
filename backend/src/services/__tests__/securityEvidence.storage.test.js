vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(() => { throw new Error('Unexpected database access in unit test'); }), getConnection: vi.fn(() => { throw new Error('Unexpected database access in unit test'); }) } }));
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Storage } from '@google-cloud/storage';
import StorageService from '../storage.service.js';
import { evidenceRequestContext } from '../../utils/evidenceRequestContext.js';

// The real SDK signs locally with a disposable key. No cloud requests or files.
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
function setup() {
  const storage = new Storage({ projectId: 'evidence-test', credentials: {
    client_email: 'test@evidence-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })
  } });
  const bucket = storage.bucket('evidence-test');
  const originalFile = bucket.file.bind(bucket);
  vi.spyOn(bucket, 'file').mockImplementation(key => {
    const file = originalFile(key);
    vi.spyOn(file, 'exists').mockResolvedValue([true]);
    return file;
  });
  vi.spyOn(StorageService, 'getGCSBucket').mockResolvedValue(bucket);
  return { evidenceContext: { requestId: crypto.randomUUID() }, auditStorageGrant: vi.fn() };
}

describe('signed storage access correlation', () => {
  it('signs a unique grant ID per link and records matching identifiers without recording the URL or object name', async () => {
    const req = setup();
    const urls = await evidenceRequestContext.run(req, async () => [
      await StorageService.getSignedUrl('private/patient.pdf', 15),
      await StorageService.getSignedUrl('private/patient.pdf', 15)
    ]);
    const grants = req.auditStorageGrant.mock.calls.map(([grant]) => grant);
    expect(grants).toHaveLength(2);
    expect(grants[0].grantId).not.toBe(grants[1].grantId);
    for (let i = 0; i < urls.length; i++) {
      const params = new URL(urls[i]).searchParams;
      expect(params.get('X-Goog-Algorithm')).toBe('GOOG4-RSA-SHA256');
      expect(params.get('x-goog-custom-audit-request')).toBe(req.evidenceContext.requestId);
      expect(params.get('x-goog-custom-audit-grant')).toBe(grants[i].grantId);
      expect(params.get('X-Goog-Signature')).toMatch(/^[0-9a-f]+$/);
      expect(grants[i].storageRef).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(JSON.stringify(grants)).not.toMatch(/patient|Signature|https:/);
  });
  it('supports the existing seven-day issuance duration', async () => {
    const req = setup();
    const url = await evidenceRequestContext.run(req, () => StorageService.getSignedUrl('example.pdf', 60 * 24 * 7));
    expect(Number(new URL(url).searchParams.get('X-Goog-Expires'))).toBeLessThanOrEqual(604800);
  });
  it('does not release the link if recording the grant fails', async () => {
    const req = setup();
    req.auditStorageGrant.mockRejectedValue(Object.assign(new Error('Unavailable'), { code: 'EVIDENCE_UNAVAILABLE' }));
    await expect(evidenceRequestContext.run(req, () => StorageService.getSignedUrl('example.pdf'))).rejects.toMatchObject({ code: 'EVIDENCE_UNAVAILABLE' });
  });
  it('preserves background link behavior without inventing an HTTP actor', async () => {
    const req = setup();
    const url = await StorageService.getSignedUrl('example.pdf');
    expect(new URL(url).searchParams.has('x-goog-custom-audit-request')).toBe(false);
    expect(req.auditStorageGrant).not.toHaveBeenCalled();
  });
});
