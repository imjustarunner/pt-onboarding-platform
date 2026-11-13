import crypto from 'node:crypto';
import pool from '../config/database.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalDocument from '../models/clinical/ClinicalDocument.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';
import { isSupervisorActor, supervisorCanAccessClient } from '../utils/supervisorSchoolAccess.js';
import { recipientFileAccess, fileShareRecipients, setFileShare, shareableFile, fileKeyHash } from './guardianFileShares.service.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';
import { logAuditEvent } from './auditEvent.service.js';
import { scanSessionMaterial } from './sessionMaterialScan.service.js';
import { queuePrivatePacketScan, privateScanInProgress } from './privatePacketScanJob.service.js';
import { CLIENT_DOCUMENT_MAX_BYTES } from '../utils/clientDocumentUpload.js';

const TYPE = 'session_supporting_material';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const metadata = row => { try { return typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json || {}; } catch { return {}; } };
const clinicalRoles = new Set(['admin', 'super_admin', 'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant']);
async function queueClinicalCheck(doc,session,actorId) {
  try { return await queuePrivatePacketScan({doc,clientId:session.client_id,actorId,kind:'session_material',clinicalSessionId:session.id}); }
  catch { return {status:'pending',message:'The private file check could not be confirmed. Refresh the attachments before retrying.'}; }
}

export async function sessionMaterialAccess(user, sessionId, { write = false } = {}) {
  if (!user?.id || !clinicalRoles.has(user.role) || user.demoMode || user.switchedFromUserId) fail(403, 'Use your own authorized clinical staff account.');
  if (!positiveId(sessionId)) fail(400, 'Choose a clinical session.');
  const session = await ClinicalSession.findById(Number(sessionId));
  if (!session || session.is_deleted) fail(404, 'Clinical session not found.');
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: user, agencyId: session.agency_id });
  await ClinicalEligibilityService.assertAgencyHasClinicalOrg(session.agency_id);
  const access = await resolveClientRecordAccess({ userId: user.id, role: user.role, clientId: session.client_id });
  const supervised = access.client && await isSupervisorActor({ userId: user.id, role: user.role, user })
    && await supervisorCanAccessClient({ supervisorUserId: user.id, client: access.client });
  if ((!access.ok && !supervised) || (!['admin', 'super_admin'].includes(user.role) && !access.isAssignedClinician && !supervised)) fail(403, 'Assigned clinician or supervisor access is required.');
  if (write) {
    await requireStaffCareEligibility(user.id, session.agency_id);
    // Attaching a file also works after completion. It neither creates/signs a
    // note nor changes attendance, service, intake or supervision requirements.
  }
  return session;
}

async function audit(req, session, action, documentId = null) {
  await logAuditEvent(req, { actionType: `clinical_session_material_${action}`, agencyId: session.agency_id,
    targetType: documentId ? 'clinical_document' : 'clinical_session', targetId: documentId || session.id,
    metadata: { clientId: Number(session.client_id), clinicalSessionId: Number(session.id), ...(documentId ? { documentId: Number(documentId) } : {}) } });
}

export async function materialRecipients(req, sessionId) {
  const session = await sessionMaterialAccess(req.user, sessionId);
  const [rows] = await pool.execute(`SELECT cg.guardian_user_id AS id, cg.relationship_type, u.first_name, u.last_name
    FROM client_guardians cg JOIN users u ON u.id = cg.guardian_user_id
    WHERE cg.client_id = ? AND cg.access_enabled = 1 AND u.is_active = 1 AND COALESCE(u.is_archived,0) = 0`, [session.client_id]);
  const recipients = [];
  for (const row of rows) {
    try {
      await recipientFileAccess(Number(row.id), session.client_id, { agencyId: session.agency_id });
      recipients.push({ id: Number(row.id), name: [row.first_name, row.last_name].filter(Boolean).join(' '), kind: row.relationship_type === 'self' ? 'client' : 'guardian' });
    } catch (error) { if (error.status !== 403) throw error; }
  }
  return recipients;
}

function validateFile(file) {
  if (!file?.buffer?.length) fail(400, 'Choose a PDF, JPEG or PNG file.');
  if (file.buffer.length > CLIENT_DOCUMENT_MAX_BYTES) fail(413, 'The file must be 25 MB or smaller.');
  const signatures = {
    'application/pdf': b => b.subarray(0, 5).equals(Buffer.from('%PDF-')),
    'image/jpeg': b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/png': b => b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  };
  if (!signatures[file.mimetype]?.(file.buffer)) fail(400, 'The file contents must match its PDF, JPEG or PNG type.');
}

export async function uploadMaterial(req, sessionId, file, title) {
  const session = await sessionMaterialAccess(req.user, sessionId, { write: true });
  validateFile(file);
  const label = String(title || '').trim();
  if (!label || label.length > 255) fail(400, 'Enter a title of up to 255 characters.');
  if (!DocumentEncryptionService.isConfigured()) fail(503, 'Encrypted document storage is unavailable. Please try again after an administrator checks its configuration.');
  const scan = await scanSessionMaterial(file.buffer);
  if (scan.status === 'infected') fail(422, 'This file did not pass the security scan. Choose a different file.');
  const name = StorageService.sanitizeFilename(file.originalname || 'session-material');
  const encrypted = await DocumentEncryptionService.encryptBuffer(file.buffer, {
    aad: DocumentEncryptionService.sessionMaterialAad({ agencyId: session.agency_id, clientId: session.client_id, originalName: name })
  });
  const path = `clinical-session-materials/${session.agency_id}/${session.id}/${crypto.randomUUID()}.enc`;
  await StorageService.writeObject(path, encrypted.encryptedBuffer, 'application/octet-stream', { cacheControl: 'private, no-store' });
  let doc;
  let linked;
  try {
    doc = await ClientPhiDocument.create({ clientId: session.client_id, agencyId: session.agency_id,
      schoolOrganizationId: session.agency_id, storagePath: path, originalName: name, documentTitle: label,
      documentType: TYPE, mimeType: file.mimetype, uploadedByUserId: req.user.id, isEncrypted: true,
      scanStatus: scan.status, scanResult: scan.reason || null, scannedAt: scan.status === 'clean' ? new Date() : null,
      quarantinePath: scan.status === 'clean' ? null : path,
      encryptionKeyId: encrypted.encryptionKeyId, encryptionWrappedKey: encrypted.encryptionWrappedKeyB64,
      encryptionIv: encrypted.encryptionIvB64, encryptionAuthTag: encrypted.encryptionAuthTagB64, encryptionAlg: encrypted.encryptionAlg });
    linked = await ClinicalDocument.create({ clinicalSessionId: session.id, agencyId: session.agency_id, clientId: session.client_id,
      title: label, documentType: TYPE, originalName: name, mimeType: file.mimetype, createdByUserId: req.user.id,
      metadataJson: { phiDocumentId: Number(doc.id) } });
  } catch (error) {
    // A cross-store failure must not leave an unlinked PHI upload behind.
    await Promise.allSettled([...(doc ? [ClientPhiDocument.deleteByIds([doc.id])] : []), StorageService.deleteObject(path)]);
    throw error;
  }
  await PhiDocumentAuditLog.create({ documentId: doc.id, clientId: session.client_id, action: 'uploaded', actorUserId: req.user.id });
  await audit(req, session, 'uploaded', linked.id);
  const queued=scan.status==='pending'?await queueClinicalCheck(doc,session,req.user.id):null;
  return { id: Number(linked.id), title: label, mimeType: file.mimetype, createdAt: linked.created_at, sharedWith: [], encrypted: true, available: scan.status === 'clean', scanStatus: scan.status,
    ...(queued?{scanQueued:true,scanMessage:queued.message}:{}) };
}

async function linkedMaterial(session, documentId, { requireAvailable = true } = {}) {
  if (!positiveId(documentId)) fail(400, 'Choose a session material.');
  const linked = await ClinicalDocument.findById(Number(documentId));
  if (!linked || linked.is_deleted || linked.document_type !== TYPE || Number(linked.clinical_session_id) !== Number(session.id)
    || Number(linked.client_id) !== Number(session.client_id) || Number(linked.agency_id) !== Number(session.agency_id)) fail(404, 'Session material not found.');
  const doc = await ClientPhiDocument.findById(metadata(linked).phiDocumentId);
  if (!doc || doc.document_type !== TYPE || Number(doc.client_id) !== Number(session.client_id) || Number(doc.agency_id) !== Number(session.agency_id) || !doc.is_encrypted || doc.removed_at || (doc.expires_at && +new Date(doc.expires_at) <= Date.now())) fail(404, 'Session material is no longer available.');
  if (requireAvailable && !shareableFile(doc)) fail(409, 'This encrypted material is pending a private security scan and cannot be opened or shared yet.');
  return { linked, doc };
}

export async function listMaterials(req, sessionId) {
  const session = await sessionMaterialAccess(req.user, sessionId);
  const rows = await ClinicalDocument.listBySession({ clinicalSessionId: session.id });
  const result = [];
  for (const row of rows.filter(row => row.document_type === TYPE)) {
    let item;
    try { item = await linkedMaterial(session, row.id, { requireAvailable: false }); } catch (error) { if (error.status === 404) continue; throw error; }
    const [shares] = await pool.execute(`SELECT s.recipient_user_id AS id, s.file_key_hash, u.first_name, u.last_name FROM family_portal_file_shares s
      JOIN users u ON u.id = s.recipient_user_id WHERE s.document_id = ? AND s.client_id = ? AND s.agency_id = ? AND s.revoked_at IS NULL`, [item.doc.id, session.client_id, session.agency_id]);
    // Keep explicit grants visible to staff even when quarantine or a later
    // permission change blocks access, so those grants can still be revoked.
    const sharingRecipients = shares.filter(share => share.file_key_hash === fileKeyHash(item.doc))
      .map(share => ({ id: Number(share.id), name: [share.first_name, share.last_name].filter(Boolean).join(' ') || `Account #${share.id}` }));
    const sharedWith = [];
    for (const share of shares) {
      if (share.file_key_hash !== fileKeyHash(item.doc) || !shareableFile(item.doc)) continue;
      try { await recipientFileAccess(Number(share.id), session.client_id, { agencyId: session.agency_id }); sharedWith.push({ id: Number(share.id), name: [share.first_name, share.last_name].filter(Boolean).join(' ') }); }
      catch (error) { if (error.status !== 403) throw error; }
    }
    result.push({ id: Number(row.id), title: row.title, mimeType: row.mime_type, createdAt: row.created_at, encrypted: true, available: shareableFile(item.doc), scanStatus: item.doc.scan_status,
      sharedWith, sharingRecipients,...(privateScanInProgress(item.doc)?{scanQueued:true}:{}) });
  }
  await audit(req, session, 'listed');
  return result;
}

export async function downloadMaterial(req, sessionId, documentId) {
  const session = await sessionMaterialAccess(req.user, sessionId);
  const { doc, linked } = await linkedMaterial(session, documentId);
  const stored = await StorageService.readObject(doc.storage_path);
  const body = await DocumentEncryptionService.decryptPhiDocumentBuffer(doc, stored);
  await PhiDocumentAuditLog.create({ documentId: doc.id, clientId: session.client_id, action: 'viewed', actorUserId: req.user.id });
  await audit(req, session, 'downloaded', linked.id);
  return { body, type: doc.mime_type, name: StorageService.sanitizeFilename(doc.original_name || 'session-material') };
}

export async function scanMaterial(req, sessionId, documentId) {
  const session = await sessionMaterialAccess(req.user, sessionId, { write: true });
  const { doc, linked } = await linkedMaterial(session, documentId, { requireAvailable: false });
  if(privateScanInProgress(doc))return {available:false,scanStatus:'pending',scanQueued:true,scanMessage:'The private file check is queued or running. Refresh attachments in a few minutes.'};
  if(shareableFile(doc))return {available:true,scanStatus:'clean'};
  const stored = await StorageService.readObject(doc.storage_path);
  const body = await DocumentEncryptionService.decryptPhiDocumentBuffer(doc, stored);
  const scan = await scanSessionMaterial(body);
  await ClientPhiDocument.updateById(doc.id, { scan_status: scan.status, scan_result: scan.reason || null,
    scanned_at: scan.status === 'pending' ? null : new Date(), quarantine_path: scan.status === 'clean' ? null : doc.storage_path });
  await audit(req, session, 'security_scanned', linked.id);
  const queued=scan.status==='pending'?await queueClinicalCheck({...doc,scan_status:'pending',scan_result:scan.reason||null},session,req.user.id):null;
  return { available: scan.status === 'clean', scanStatus: scan.status,...(queued?{scanQueued:true,scanMessage:queued.message}:{}) };
}

export async function shareMaterial(req, sessionId, documentId, { recipientIds, reviewed }) {
  const session = await sessionMaterialAccess(req.user, sessionId, { write: true });
  const { doc, linked } = await linkedMaterial(session, documentId);
  if (reviewed !== true || !Array.isArray(recipientIds) || !recipientIds.length || recipientIds.length > 20 || recipientIds.some(id => !positiveId(id))) fail(400, 'Review the file and choose each person who may receive it.');
  const ids = [...new Set(recipientIds.map(Number))];
  const options = await fileShareRecipients(req.user, doc.id);
  if (ids.some(id => !options.recipients.some(r => Number(r.id) === id))) fail(403, 'A selected person no longer has permission to receive this document.');
  const added = [];
  try {
    for (const id of ids) {
      await setFileShare(req.user, doc.id, { recipientId: id, shared: true, reviewed: true });
      if (!options.recipients.find(r => Number(r.id) === id)?.shared) added.push(id);
    }
  } catch (error) {
    for (const id of added) await setFileShare(req.user, doc.id, { recipientId: id, shared: false });
    throw error;
  }
  await audit(req, session, 'shared', linked.id);
  return { sharedWith: options.recipients.filter(r => ids.includes(Number(r.id)) || r.shared).map(({ id, name }) => ({ id, name })) };
}

export async function revokeMaterialShare(req, sessionId, documentId, recipientId) {
  const session = await sessionMaterialAccess(req.user, sessionId, { write: true });
  const { doc, linked } = await linkedMaterial(session, documentId, { requireAvailable: false });
  if (!positiveId(recipientId)) fail(400, 'Choose the person whose portal access should be removed.');
  // Revocation needs neither a clean scan nor the recipient's current permission.
  // The session/document/client/agency match is checked before the existing
  // per-recipient share mechanism updates only this document's grant.
  await setFileShare(req.user, doc.id, { recipientId: Number(recipientId), shared: false });
  await audit(req, session, 'share_revoked', linked.id);
  return { revoked: true, recipientId: Number(recipientId) };
}
