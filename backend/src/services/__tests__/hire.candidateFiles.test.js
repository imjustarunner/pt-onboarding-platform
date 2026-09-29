import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), read: vi.fn(), save: vi.fn(), decrypt: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../storage.service.js', () => ({ default: { readObject: m.read, saveAdminDoc: m.save } }));
vi.mock('../documentEncryption.service.js', () => ({ default: { decryptBuffer: m.decrypt } }));
import { resolveOwnedAdminDocStoragePath } from '../../utils/candidateApplicationFile.js';
beforeEach(() => vi.clearAllMocks());
describe('applicant resume files', () => {
  it('uses the readable imported copy rather than encrypted source bytes', async () => {
    const doc = { id: 173, doc_type: 'resume', storage_path: 'admin_docs/application-30-unique.pdf' };
    expect(await resolveOwnedAdminDocStoragePath(doc, 30)).toBe(doc.storage_path);
    expect(m.execute).not.toHaveBeenCalled();
  });
  it.each(['application','resume','reference-release','candidate-copy'])('recognizes the unique saveAdminDoc prefix for %s without reopening protected intake storage',async(kind)=>{
    const doc={id:193,doc_type:'resume',storage_path:`admin_docs/1790634023437-f5ngbvg7-${kind}-1312-unique.pdf`};
    m.read.mockRejectedValue(Object.assign(new Error('held'),{code:'ACTIVITY_REVIEW_REQUIRED'}));
    expect(await resolveOwnedAdminDocStoragePath(doc,1312)).toBe(doc.storage_path);
    expect(m.read).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
  });
  it('does not treat another candidate’s named copy as an owned import',async()=>{
    m.execute.mockResolvedValue([[]]);
    await resolveOwnedAdminDocStoragePath({doc_type:'resume',storage_path:'admin_docs/1790634023437-f5ngbvg7-application-999-unique.pdf'},1312);
    expect(m.execute).toHaveBeenCalledWith(expect.any(String),[1312]);
  });
  it('repairs an older shared filename from the candidate-owned encrypted upload', async () => {
    m.execute.mockResolvedValueOnce([[{ storage_path: 'intake/8/resume.enc', original_filename: 'resume.pdf', mime_type: 'application/pdf', is_encrypted: 1, encryption_wrapped_key: 'wrapped', encryption_iv: 'iv', encryption_auth_tag: 'tag' }]]).mockResolvedValue([{}]);
    m.read.mockResolvedValue(Buffer.from('encrypted'));
    m.decrypt.mockResolvedValue(Buffer.from('%PDF-readable'));
    m.save.mockResolvedValue({ relativePath: 'admin_docs/candidate-copy-30-unique.pdf' });
    expect(await resolveOwnedAdminDocStoragePath({ id: 173, doc_type: 'resume', storage_path: 'admin_docs/resume.pdf', original_name: 'resume.pdf' }, 30)).toBe('admin_docs/candidate-copy-30-unique.pdf');
    expect(m.execute.mock.calls[0][1]).toEqual([30]);
    expect(m.save.mock.calls[0][0]).toEqual(Buffer.from('%PDF-readable'));
    expect(m.execute.mock.calls[1][1]).toEqual(['admin_docs/candidate-copy-30-unique.pdf', 173, 30, 'admin_docs/resume.pdf']);
  });
});
