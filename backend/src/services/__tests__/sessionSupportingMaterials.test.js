import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ sql: vi.fn(), session: vi.fn(), clinicalCreate: vi.fn(), clinicalFind: vi.fn(), clinicalList: vi.fn(), phiCreate: vi.fn(), phiFind: vi.fn(), phiDelete: vi.fn(), phiUpdate: vi.fn(), phiAudit: vi.fn(), agency: vi.fn(), clinicalOrg: vi.fn(), eligible: vi.fn(), record: vi.fn(), care: vi.fn(), supervisor: vi.fn(), supervisedClient: vi.fn(), recipients: vi.fn(), recipient: vi.fn(), share: vi.fn(), write: vi.fn(), read: vi.fn(), remove: vi.fn(), configured: vi.fn(), encrypt: vi.fn(), decrypt: vi.fn(), audit: vi.fn(), scan: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mock.sql } }));
vi.mock('../../models/clinical/ClinicalSession.model.js', () => ({ default: { findById: mock.session } }));
vi.mock('../../models/clinical/ClinicalDocument.model.js', () => ({ default: { create: mock.clinicalCreate, findById: mock.clinicalFind, listBySession: mock.clinicalList } }));
vi.mock('../../models/ClientPhiDocument.model.js', () => ({ default: { create: mock.phiCreate, findById: mock.phiFind, deleteByIds: mock.phiDelete, updateById: mock.phiUpdate } }));
vi.mock('../../models/PhiDocumentAuditLog.model.js', () => ({ default: { create: mock.phiAudit } }));
vi.mock('../clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: mock.agency, assertAgencyHasClinicalOrg: mock.clinicalOrg, assertSessionNoteEligible: mock.eligible } }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: mock.record }));
vi.mock('../staffCareEligibility.service.js', () => ({ requireStaffCareEligibility: mock.care }));
vi.mock('../../utils/supervisorSchoolAccess.js', () => ({ isSupervisorActor: mock.supervisor, supervisorCanAccessClient: mock.supervisedClient }));
vi.mock('../guardianFileShares.service.js', () => ({ recipientFileAccess: mock.recipient, fileShareRecipients: mock.recipients, setFileShare: mock.share, fileKeyHash: () => 'current-hash', shareableFile: doc => !!doc && doc.scan_status === 'clean' && !doc.quarantine_path && !doc.removed_at }));
vi.mock('../storage.service.js', () => ({ default: { sanitizeFilename: name => String(name).replace(/[^\w.-]/g, '_'), writeObject: mock.write, readObject: mock.read, deleteObject: mock.remove } }));
vi.mock('../documentEncryption.service.js', () => ({ default: { isConfigured: mock.configured, encryptBuffer: mock.encrypt, decryptPhiDocumentBuffer: mock.decrypt, sessionMaterialAad: data => JSON.stringify(data) } }));
vi.mock('../auditEvent.service.js', () => ({ logAuditEvent: mock.audit }));
vi.mock('../sessionMaterialScan.service.js', () => ({ scanSessionMaterial: mock.scan }));
import { uploadMaterial, listMaterials, downloadMaterial, shareMaterial, scanMaterial, materialRecipients, sessionMaterialAccess, revokeMaterialShare } from '../sessionSupportingMaterials.service.js';
const req = { user: { id: 1433, role: 'provider' } };
const session = { id: 166, agency_id: 450, client_id: 2273, provider_user_id: 1433 };
const linked = { id: 8, clinical_session_id: 166, agency_id: 450, client_id: 2273, document_type: 'session_supporting_material', title: 'Thought record', metadata_json: JSON.stringify({ phiDocumentId: 9 }) };
const phi = { id: 9, agency_id: 450, client_id: 2273, document_type: 'session_supporting_material', is_encrypted: 1, scan_status: 'clean', storage_path: 'private/never-exposed', encryption_wrapped_key: 'private-key', original_name: 'thought.pdf', mime_type: 'application/pdf' };
const file = { buffer: Buffer.from('%PDF- synthetic worksheet'), mimetype: 'application/pdf', originalname: 'thought.pdf' };
beforeEach(() => {
  vi.resetAllMocks();
  mock.session.mockResolvedValue({ ...session }); mock.record.mockResolvedValue({ ok: true, isAssignedClinician: true, client: { id: 2273, agency_id: 450 } });
  mock.configured.mockReturnValue(true); mock.encrypt.mockResolvedValue({ encryptedBuffer: Buffer.from('ciphertext'), encryptionKeyId: 'kms', encryptionWrappedKeyB64: 'wrapped', encryptionIvB64: 'iv', encryptionAuthTagB64: 'tag', encryptionAlg: 'AES-256-GCM' });
  mock.scan.mockResolvedValue({ status: 'clean' }); mock.phiCreate.mockResolvedValue({ ...phi }); mock.phiFind.mockResolvedValue({ ...phi });
  mock.clinicalCreate.mockResolvedValue({ ...linked }); mock.clinicalFind.mockResolvedValue({ ...linked }); mock.clinicalList.mockResolvedValue([{ ...linked }]);
  mock.read.mockResolvedValue(Buffer.from('ciphertext')); mock.decrypt.mockResolvedValue(file.buffer); mock.sql.mockResolvedValue([[]]);
  mock.recipients.mockResolvedValue({ recipients: [{ id: 20, name: 'First parent', shared: false }, { id: 21, name: 'Second parent', shared: false }] });
});
describe('encrypted session supporting materials', () => {
  it('encrypts before storage and creates a session link without changing the signed note', async () => {
    const result = await uploadMaterial(req, 166, file, 'Thought record');
    expect(mock.write.mock.calls[0][1]).toEqual(Buffer.from('ciphertext'));
    expect(mock.write.mock.calls[0][1]).not.toEqual(file.buffer);
    expect(mock.phiCreate).toHaveBeenCalledWith(expect.objectContaining({ isEncrypted: true, encryptionWrappedKey: 'wrapped', scanStatus: 'clean', quarantinePath: null }));
    expect(mock.clinicalCreate).toHaveBeenCalledWith(expect.objectContaining({ metadataJson: { phiDocumentId: 9 }, clinicalSessionId: 166 }));
    expect(result).toMatchObject({ id: 8, available: true, encrypted: true, sharedWith: [] });
    expect(result).not.toHaveProperty('storagePath'); expect(mock.share).not.toHaveBeenCalled();
    expect(mock.audit).toHaveBeenCalledWith(req, expect.objectContaining({ metadata: { clientId: 2273, clinicalSessionId: 166, documentId: 8 } }));
  });
  it('accepts materials for a completed session without invoking note creation or signing gates', async () => {
    mock.session.mockResolvedValue({ ...session, encounter_status: 'completed' });
    await uploadMaterial(req, 166, file, 'After-session worksheet');
    expect(mock.care).toHaveBeenCalledWith(1433, 450); expect(mock.eligible).not.toHaveBeenCalled();
  });
  it('quarantines when the private scan is unavailable and prevents downloads and shares', async () => {
    mock.scan.mockResolvedValue({ status: 'pending', reason: 'No private scanner' });
    const result = await uploadMaterial(req, 166, file, 'Thought record'); expect(result.available).toBe(false);
    expect(mock.phiCreate).toHaveBeenCalledWith(expect.objectContaining({ scanStatus: 'pending', quarantinePath: expect.stringContaining('clinical-session-materials/') }));
    mock.phiFind.mockResolvedValue({ ...phi, scan_status: 'pending', quarantine_path: 'quarantine' });
    await expect(downloadMaterial(req, 166, 8)).rejects.toMatchObject({ status: 409 });
    await expect(shareMaterial(req, 166, 8, { reviewed: true, recipientIds: [20] })).rejects.toMatchObject({ status: 409 });
    expect(mock.read).not.toHaveBeenCalled(); expect(mock.share).not.toHaveBeenCalled();
  });
  it('fails closed before writing a file if encryption is unavailable or the type is spoofed', async () => {
    mock.configured.mockReturnValue(false); await expect(uploadMaterial(req, 166, file, 'Thought record')).rejects.toMatchObject({ status: 503 });
    mock.configured.mockReturnValue(true); await expect(uploadMaterial(req, 166, { ...file, buffer: Buffer.from('not a PDF') }, 'Thought record')).rejects.toMatchObject({ status: 400 });
    expect(mock.write).not.toHaveBeenCalled(); expect(mock.phiCreate).not.toHaveBeenCalled();
  });
  it('rejects infected files before any persistent write', async () => {
    mock.scan.mockResolvedValue({ status: 'infected' }); await expect(uploadMaterial(req, 166, file, 'Thought record')).rejects.toMatchObject({ status: 422 });
    expect(mock.write).not.toHaveBeenCalled();
  });
  it('removes encrypted orphan storage if the session-link write fails', async () => {
    mock.clinicalCreate.mockRejectedValue(new Error('session write failed'));
    await expect(uploadMaterial(req, 166, file, 'Thought record')).rejects.toThrow('session write failed');
    expect(mock.phiDelete).toHaveBeenCalledWith([9]); expect(mock.remove).toHaveBeenCalledOnce();
  });
  it('denies support, school staff, unrelated providers and cross-agency callers', async () => {
    for (const role of ['support', 'school_staff', 'client_guardian']) await expect(sessionMaterialAccess({ id: 1, role }, 166)).rejects.toMatchObject({ status: 403 });
    mock.record.mockResolvedValue({ ok: false, client: { id: 2273 } }); await expect(sessionMaterialAccess(req.user, 166)).rejects.toMatchObject({ status: 403 });
    mock.record.mockResolvedValue({ ok: true, isAssignedClinician: true }); mock.agency.mockRejectedValue(Object.assign(new Error('wrong agency'), { status: 403 }));
    await expect(uploadMaterial(req, 166, file, 'Thought record')).rejects.toMatchObject({ status: 403 }); expect(mock.write).not.toHaveBeenCalled();
  });
  it('allows a provider with supervisor privileges only for their supervisee’s client', async () => {
    mock.record.mockResolvedValue({ ok: false, isAssignedClinician: false, client: { id: 2273 } });
    mock.supervisor.mockResolvedValue(true); mock.supervisedClient.mockResolvedValue(true);
    await expect(sessionMaterialAccess({ id: 1438, role: 'provider' }, 166)).resolves.toMatchObject(session);
    mock.supervisedClient.mockResolvedValue(false); await expect(sessionMaterialAccess({ id: 1438, role: 'provider' }, 166)).rejects.toMatchObject({ status: 403 });
  });
  it.each(['clinical_session_id', 'client_id', 'agency_id'])('rejects a material with mismatched %s', async field => {
    mock.clinicalFind.mockResolvedValue({ ...linked, [field]: 999 });
    await expect(downloadMaterial(req, 166, 8)).rejects.toMatchObject({ status: 404 }); expect(mock.read).not.toHaveBeenCalled();
  });
  it('rechecks guardian permissions, requires review and shares only with the explicit recipient', async () => {
    await expect(shareMaterial(req, 166, 8, { recipientIds: [20], reviewed: false })).rejects.toMatchObject({ status: 400 });
    await expect(shareMaterial(req, 166, 8, { recipientIds: [99], reviewed: true })).rejects.toMatchObject({ status: 403 });
    await shareMaterial(req, 166, 8, { recipientIds: [20], reviewed: true });
    expect(mock.share).toHaveBeenCalledExactlyOnceWith(req.user, 9, { recipientId: 20, shared: true, reviewed: true });
  });
  it('rolls back new shares after a recipient loses access, without revoking pre-existing shares', async () => {
    mock.share.mockResolvedValueOnce({ saved: true }).mockRejectedValueOnce(Object.assign(new Error('permission changed'), { status: 403 })).mockResolvedValue({ saved: true });
    await expect(shareMaterial(req, 166, 8, { recipientIds: [20, 21], reviewed: true })).rejects.toMatchObject({ status: 403 });
    expect(mock.share).toHaveBeenLastCalledWith(req.user, 9, { recipientId: 20, shared: false });
  });
  it('lists pending materials honestly without storage paths, encryption keys or private file bytes', async () => {
    mock.phiFind.mockResolvedValue({ ...phi, scan_status: 'pending', quarantine_path: 'private/path' });
    const rows = await listMaterials(req, 166); expect(rows).toEqual([expect.objectContaining({ title: 'Thought record', available: false, scanStatus: 'pending' })]);
    expect(JSON.stringify(rows)).not.toContain('private'); expect(JSON.stringify(rows)).not.toContain('ciphertext');
  });
  it('filters out recipients who no longer have document permission', async () => {
    mock.sql.mockResolvedValue([[{ id: 20, first_name: 'One', relationship_type: 'parent' }, { id: 21, first_name: 'Two', relationship_type: 'parent' }]]);
    mock.recipient.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('scope'), { status: 403 }));
    expect(await materialRecipients(req, 166)).toEqual([{ id: 20, name: 'One', kind: 'guardian' }]);
  });
  it('retries a local scan and clears quarantine only after a clean result', async () => {
    mock.phiFind.mockResolvedValue({ ...phi, scan_status: 'pending', quarantine_path: 'private/path' });
    await expect(scanMaterial(req, 166, 8)).resolves.toEqual({ available: true, scanStatus: 'clean' });
    expect(mock.phiUpdate).toHaveBeenCalledWith(9, expect.objectContaining({ scan_status: 'clean', quarantine_path: null }));
  });
  it('revokes only the named portal share while a material is quarantined and preserves the attachment', async () => {
    mock.phiFind.mockResolvedValue({ ...phi, scan_status: 'pending', quarantine_path: 'private/path' });
    await expect(revokeMaterialShare(req, 166, 8, 20)).resolves.toEqual({ revoked: true, recipientId: 20 });
    expect(mock.share).toHaveBeenCalledExactlyOnceWith(req.user, 9, { recipientId: 20, shared: false });
    expect(mock.read).not.toHaveBeenCalled(); expect(mock.phiDelete).not.toHaveBeenCalled(); expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.audit).toHaveBeenCalledWith(req, expect.objectContaining({ actionType: 'clinical_session_material_share_revoked', targetId: 8, metadata: { clientId: 2273, clinicalSessionId: 166, documentId: 8 } }));
  });
  it.each(['clinical_session_id', 'client_id', 'agency_id'])('cannot revoke using a material with a mismatched %s', async field => {
    mock.clinicalFind.mockResolvedValue({ ...linked, [field]: 999 });
    await expect(revokeMaterialShare(req, 166, 8, 20)).rejects.toMatchObject({ status: 404 }); expect(mock.share).not.toHaveBeenCalled();
  });
  it('denies unauthorized revocation and invalid recipient IDs before changing any grant', async () => {
    await expect(revokeMaterialShare({ user: { id: 1434, role: 'support' } }, 166, 8, 20)).rejects.toMatchObject({ status: 403 });
    await expect(revokeMaterialShare(req, 166, 8, 0)).rejects.toMatchObject({ status: 400 }); expect(mock.share).not.toHaveBeenCalled();
  });
  it('lists recorded grants for removal while quarantine blocks opening or current recipient access has changed', async () => {
    mock.phiFind.mockResolvedValue({ ...phi, scan_status: 'pending', quarantine_path: 'private/path' });
    mock.sql.mockResolvedValue([[{ id: 20, first_name: 'One', file_key_hash: 'current-hash' }]]);
    const [row] = await listMaterials(req, 166);
    expect(row).toMatchObject({ available: false, sharedWith: [], sharingRecipients: [{ id: 20, name: 'One' }] });
    expect(mock.sql).toHaveBeenCalledWith(expect.stringContaining('s.client_id = ? AND s.agency_id = ?'), [9, 2273, 450]);
  });
});
