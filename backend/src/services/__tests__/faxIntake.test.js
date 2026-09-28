import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), conn: { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }, create: vi.fn(), find: vi.fn(), encrypt: vi.fn(), decrypt: vi.fn(), save: vi.fn(), remove: vi.fn(), demographics: vi.fn(), guardian: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, getConnection: async () => mocks.conn } }));
vi.mock('../../models/Client.model.js', () => ({ default: { create: mocks.create, findById: mocks.find } }));
vi.mock('../documentEncryption.service.js', () => ({ default: { encryptBuffer: mocks.encrypt, decryptBuffer: mocks.decrypt } }));
vi.mock('../storage.service.js', () => ({ default: { getGCSBucket: async () => ({ file: () => ({ save: mocks.save, delete: mocks.remove }) }) } }));
vi.mock('../demographicsImport.service.js', () => ({ encryptDemographicsPayload: mocks.demographics }));
vi.mock('../guardianIntakeEncryption.service.js', () => ({ encryptGuardianIntake: mocks.guardian }));
import { createClientFromFax, getFaxDraft, saveFaxDraft } from '../faxIntake.service.js';
const draft = () => ({ id: 'draft', agency_id: 3, organization_id: 4, payload_encrypted: Buffer.from('cipher'), encryption_metadata: {}, expires_at: new Date(Date.now() + 50000) });
const input = () => ({ userId: 9, payload: { agency_id: 3, organization_id: 4, initials: 'SamSam' }, fax: { draftId: 'draft', entryId: 10, reviewed: true, fields: { client_full_name: 'Sam Sample', guardian_full_name: 'Taylor Example', guardian_phone: '7195550100' } } });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.demographics.mockReturnValue({ ciphertextB64: 'sealed' });
  mocks.guardian.mockReturnValue({ ciphertextB64: 'sealed-guardian', ivB64: 'iv', authTagB64: 'tag', keyId: 'v1' });
  mocks.encrypt.mockResolvedValue({ encryptedBuffer: Buffer.from('sealed'), encryptionKeyId: 'kms', encryptionWrappedKeyB64: 'key', encryptionIvB64: 'iv', encryptionAuthTagB64: 'tag', encryptionAlg: 'AES-256-GCM' });
  mocks.decrypt.mockResolvedValue(Buffer.from(JSON.stringify({ file: Buffer.from('%PDF-original').toString('base64'), mimeType: 'application/pdf' })));
  mocks.create.mockResolvedValue({ id: 50 }); mocks.find.mockResolvedValue({ id: 50 });
  mocks.conn.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT * FROM fax_intake_drafts')) return [[draft()]];
    if (sql.includes('SELECT id FROM referral_directory_entries')) return [[{ id: 10 }]];
    return [{ insertId: 60 }];
  });
});
describe('fax intake persistence', () => {
  it('requires review and an approved agency directory entry', async () => {
    await expect(createClientFromFax({ ...input(), fax: { ...input().fax, reviewed: false } })).rejects.toThrow('Confirm');
    mocks.conn.execute.mockImplementation(async sql => sql.includes('fax_intake_drafts') ? [[draft()]] : [[]]);
    await expect(createClientFromFax(input())).rejects.toThrow('approved');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects another agency before decrypting the fax', async () => {
    await expect(createClientFromFax({ ...input(), payload: { agency_id: 8, organization_id: 4 } })).rejects.toThrow('another agency');
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.conn.rollback).toHaveBeenCalled();
  });
  it('commits client, encrypted guardian profile, original document and referral together', async () => {
    expect(await createClientFromFax(input())).toEqual({ id: 50 });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ contact_phone: null }), { executor: mocks.conn, hydrate: false });
    const sql = mocks.conn.execute.mock.calls.map(([query]) => query).join('\n');
    expect(sql).toContain('INSERT INTO client_guardian_intake_profiles'); expect(sql).toContain('INSERT INTO client_phi_documents'); expect(sql).toContain('INSERT INTO client_referral_links'); expect(sql).toContain('payload_encrypted = NULL');
    expect(sql).toContain('INSERT INTO phi_document_audit_logs');
    expect(mocks.save.mock.calls[0][0].toString()).toBe('sealed');
    expect(mocks.conn.commit).toHaveBeenCalledOnce();
    // A guardian phone is never silently assigned as the client's phone.
    expect(mocks.guardian.mock.calls[0][0]).toContain('7195550100');
  });
  it('rolls back and removes the encrypted object if document attachment fails', async () => {
    const original = mocks.conn.execute.getMockImplementation();
    mocks.conn.execute.mockImplementation(async (sql, args) => { if (sql.includes('INSERT INTO client_phi_documents')) throw new Error('database contains synthetic PHI'); return original(sql, args); });
    await expect(createClientFromFax(input())).rejects.toThrow('No client was created');
    expect(mocks.conn.commit).not.toHaveBeenCalled(); expect(mocks.conn.rollback).toHaveBeenCalledOnce(); expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it('reuses a committed draft on retry', async () => {
    mocks.conn.execute.mockResolvedValue([[{ ...draft(), client_id: 50 }]]);
    expect(await createClientFromFax(input())).toEqual({ id: 50 }); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('keeps the encrypted source when the commit acknowledgement is lost', async () => {
    mocks.conn.commit.mockRejectedValue(new Error('connection lost'));
    await expect(createClientFromFax(input())).rejects.toThrow('could not be confirmed');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('rejects expired and wrong-owner drafts', async () => {
    mocks.execute.mockResolvedValue([[{ ...draft(), expires_at: new Date(0) }]]);
    await expect(getFaxDraft('draft', 9)).rejects.toThrow('expired');
    mocks.execute.mockResolvedValue([[]]); await expect(getFaxDraft('draft', 2)).rejects.toThrow('not found');
    expect(mocks.execute.mock.calls[1][1]).toEqual(['draft', 2]);
  });
  it('stores only ciphertext in temporary drafts', async () => {
    mocks.execute.mockResolvedValue([{}]);
    await saveFaxDraft({ buffer: Buffer.from('synthetic name'), mimeType: 'application/pdf', pages: [], candidates: [], agencyId: 3, organizationId: 4, userId: 9 });
    expect(mocks.execute.mock.calls[0][1][4].toString()).toBe('sealed');
    expect(JSON.stringify(mocks.execute.mock.calls)).not.toContain('synthetic name');
  });
});
