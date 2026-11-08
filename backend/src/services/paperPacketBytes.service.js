import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';

export async function paperPacketBytes({ documentId, clientId, schoolOrganizationId, requireClean = true }, overrides = {}) {
  const { documents = ClientPhiDocument, storage = StorageService, encryption = DocumentEncryptionService } = overrides;
  const doc = await documents.findSchoolPaperPacket(clientId, documentId);
  if (!doc || Number(doc.client_id) !== Number(clientId) || Number(doc.school_organization_id) !== Number(schoolOrganizationId) || doc.removed_at) {
    throw Object.assign(new Error('The uploaded packet does not belong to this client and school.'), { code: 'packet_source_mismatch', status: 404 });
  }
  if (requireClean && doc.scan_status !== 'clean') {
    throw Object.assign(new Error('The packet is waiting for a completed private file check.'), { code: 'file_check_pending', status: 409 });
  }
  const stored = await storage.readObject(doc.storage_path);
  const buffer = doc.is_encrypted
    ? await encryption.decryptPhiDocumentBuffer(doc, stored, name => storage.sanitizeFilename(name))
    : Buffer.from(stored);
  return { doc, buffer };
}
