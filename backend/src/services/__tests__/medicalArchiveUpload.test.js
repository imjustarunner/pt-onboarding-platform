import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/ClientPhiDocument.model.js', () => ({ default: {} }));
vi.mock('../storage.service.js', () => ({ default: {} }));
vi.mock('../ehrHistoricalImportLock.service.js', () => ({ withHistoricalImportLock: vi.fn() }));
import { medicalArchiveDescriptor, withMedicalArchiveUpload } from '../medicalArchiveUpload.service.js';
const input = { agencyId: 2, clientId: 5, documentType: 'historical_medical_record', documentTitle: `AW history ${'a'.repeat(64)} pages 1-3`, file: { mimetype: 'application/pdf', buffer: Buffer.from('%PDF-synthetic') } };
let stored, writes, pending;
const deps = () => ({
  lock: async (_agency, _client, _kind, work) => { const previous = pending; let release; pending = new Promise(resolve => { release = resolve; }); await previous; try { return await work(); } finally { release(); } },
  list: async () => stored,
  metadata: async () => ({ size: input.file.buffer.length, metadata: { archiveContentSha256: medicalArchiveDescriptor(input).contentSha256 } })
});
beforeEach(() => { stored = []; writes = 0; pending = Promise.resolve(); });
const save = async (descriptor, existing) => { if (existing) return existing; writes++; const doc = { id: 8, client_id: 5, agency_id: 2, document_title: input.documentTitle, document_type: input.documentType, storage_path: descriptor.filename }; stored.push(doc); return doc; };
it('serializes concurrent same-volume uploads and reuses the stored chart document', async () => {
  const overrides = deps(); const results = await Promise.all([withMedicalArchiveUpload(input, save, overrides), withMedicalArchiveUpload(input, save, overrides)]);
  expect(writes).toBe(1); expect(results.map(doc => doc.id)).toEqual([8, 8]);
});
it('rejects a changed body, duplicate title, or cross-client existing identity without another upload', async () => {
  await withMedicalArchiveUpload(input, save, deps());
  await expect(withMedicalArchiveUpload(input, save, { ...deps(), metadata: async () => ({ size: 99, metadata: { archiveContentSha256: 'different' } }) })).rejects.toThrow('differs');
  stored.push({ ...stored[0], id: 9 }); await expect(withMedicalArchiveUpload(input, save, deps())).rejects.toThrow('Duplicate');
  stored = [{ ...stored[0], client_id: 999 }]; await expect(withMedicalArchiveUpload(input, save, deps())).rejects.toThrow('identity'); expect(writes).toBe(1);
});
it('validates source/page identity before entering the historical upload lock', async () => {
  const work = vi.fn(); await expect(withMedicalArchiveUpload({ ...input, documentTitle: 'Not a prepared archive' }, work, deps())).rejects.toThrow('incomplete');
  expect(() => medicalArchiveDescriptor({ ...input, documentType: 'historical_record_manifest' })).toThrow('incomplete'); expect(work).not.toHaveBeenCalled();
});
it('keeps ordinary chart uploads on their established path', async () => {
  const work = vi.fn(async () => ({ normal: true })), lock = vi.fn();
  await expect(withMedicalArchiveUpload({ ...input, documentType: 'other' }, work, { lock })).resolves.toEqual({ normal: true });
  expect(lock).not.toHaveBeenCalled(); expect(work).toHaveBeenCalledWith(null, null);
});
