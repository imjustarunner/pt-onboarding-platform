import { createHash } from 'node:crypto';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from './storage.service.js';
import { withHistoricalImportLock } from './ehrHistoricalImportLock.service.js';

const fail = message => Object.assign(new Error(message), { status: 409, code: 'MEDICAL_ARCHIVE_REVIEW_REQUIRED' });
export function medicalArchiveDescriptor({ documentType, documentTitle, file }) {
  if (!['historical_medical_record', 'historical_record_manifest'].includes(documentType)) return null;
  const match = String(documentTitle || '').match(/^AW history ([a-f0-9]{64}) (?:pages (\d+)-(\d+)|(manifest))$/);
  if (!match || (documentType === 'historical_record_manifest') !== !!match[4]
    || (match[2] && (Number(match[2]) < 1 || Number(match[3]) < Number(match[2]) || Number(match[3]) > 5000))
    || file?.mimetype !== 'application/pdf' || !file?.buffer?.length) throw fail('The history volume identity is incomplete. Prepare the client PDF again before uploading.');
  const contentSha256 = createHash('sha256').update(file.buffer).digest('hex');
  return { contentSha256, filename: `auricwell-history-${match[1]}-${match[4] || `${match[2]}-${match[3]}`}-${contentSha256}.pdf` };
}

/** Authorization runs in the document controller before this serialization boundary. */
export async function withMedicalArchiveUpload(input, work, overrides = {}) {
  const descriptor = medicalArchiveDescriptor(input);
  if (!descriptor) return work(null, null);
  const deps = {
    lock: withHistoricalImportLock,
    list: clientId => ClientPhiDocument.findByClientId(clientId),
    metadata: async path => { const bucket = await StorageService.getGCSBucket(); return (await bucket.file(path).getMetadata())[0]; },
    ...overrides
  };
  return deps.lock(Number(input.agencyId), Number(input.clientId), 'archive', async () => {
    const docs = (await deps.list(input.clientId)).filter(doc => !doc.removed_at && doc.document_title === input.documentTitle);
    if (docs.length > 1) throw fail('Duplicate history volumes need review in the client chart. No additional file was uploaded.');
    const existing = docs[0];
    if (existing) {
      if (Number(existing.client_id) !== Number(input.clientId) || Number(existing.agency_id) !== Number(input.agencyId) || existing.document_type !== input.documentType) throw fail('The existing archive identity needs chart review.');
      const metadata = await deps.metadata(existing.storage_path);
      if (metadata?.metadata?.archiveContentSha256 !== descriptor.contentSha256 || Number(metadata.size) !== input.file.buffer.length) throw fail('The existing history volume differs from this upload. Review the source and stored volume before retrying.');
      return work(descriptor, existing);
    }
    return work(descriptor, null);
  });
}
