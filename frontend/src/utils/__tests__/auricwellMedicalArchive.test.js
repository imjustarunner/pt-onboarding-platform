import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { prepareMedicalArchive, uploadMedicalArchive } from '../auricwellMedicalArchive.js';
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
async function pdf(pages = 6) { const doc = await PDFDocument.create(); for (let i = 0; i < pages; i++) doc.addPage().drawText(`Synthetic medical history page ${i + 1}`); return doc.save(); }
describe('medical history archive', () => {
  it('preserves the original bytes when the complete file fits', async () => {
    const bytes = await pdf(); const archive = await prepareMedicalArchive(bytes);
    expect(archive.parts).toHaveLength(1); expect(archive.parts[0].bytes).toBe(bytes); expect(archive.parts[0]).toMatchObject({ startPage: 1, endPage: 6 });
    expect((await PDFDocument.load(archive.manifest.bytes)).getPageCount()).toBeGreaterThan(0);
  });
  it('splits into complete ordered pages below the upload limit without gaps', async () => {
    const archive = await prepareMedicalArchive(await pdf(), { maxPartBytes: 1100 });
    expect(archive.parts.length).toBeGreaterThan(1); let next = 1;
    for (const part of archive.parts) { expect(part.bytes.byteLength).toBeLessThanOrEqual(1100); expect(part.startPage).toBe(next); expect((await PDFDocument.load(part.bytes)).getPageCount()).toBe(part.endPage - part.startPage + 1); next = part.endPage + 1; }
    expect(next).toBe(7);
  });
  it('prepares a real PDF above 25 MB as bounded page volumes with reproducible integrity hashes', async () => {
    const doc = await PDFDocument.create();
    const content = '%' + 'x'.repeat(3 * 1024 * 1024) + '\n';
    for (let i = 0; i < 9; i++) {
      const page = doc.addPage();
      page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(content)));
    }
    const bytes = await doc.save(); expect(bytes.byteLength).toBeGreaterThan(25 * 1024 * 1024);
    const archive = await prepareMedicalArchive(bytes);
    expect(archive.parts.length).toBeGreaterThan(1);
    expect(archive.parts.every(part => part.bytes.byteLength < 25 * 1024 * 1024)).toBe(true);
    expect(archive.parts.reduce((count, part) => count + part.endPage - part.startPage + 1, 0)).toBe(9);
    const retry = await prepareMedicalArchive(bytes);
    expect(retry.parts.map(part => part.sha256)).toEqual(archive.parts.map(part => part.sha256));
  }, 15000);
  it('rejects invalid, locked or unsplittable files before uploading', async () => {
    await expect(prepareMedicalArchive(new TextEncoder().encode('not a PDF'))).rejects.toThrow('could not be opened');
    await expect(prepareMedicalArchive(await pdf(1), { maxPartBytes: 100 })).rejects.toThrow('page 1 alone');
  });
  it('resumes complete volumes after an interrupted upload and saves the manifest last', async () => {
    const archive = await prepareMedicalArchive(await pdf(3), { maxPartBytes: 1100 }); const saved = []; let fail = true;
    const api = { get: vi.fn(async () => ({ data: [...saved] })), post: vi.fn(async (_url, form) => { if (saved.length === 1 && fail) throw new Error('Interrupted'); const document = { id: saved.length + 1, document_title: form.get('documentTitle') }; saved.push(document); return { data: { document } }; }) };
    await expect(uploadMedicalArchive(api, 20, archive)).rejects.toThrow('Interrupted'); expect(saved).toHaveLength(1);
    fail = false; await uploadMedicalArchive(api, 20, archive); expect(saved).toHaveLength(archive.parts.length + 1); expect(saved.at(-1).document_title).toBe(archive.manifest.title);
  });
  it('never proceeds after a client context change or an unverifiable document listing', async () => {
    const archive = await prepareMedicalArchive(await pdf(1)); const api = { get: vi.fn(async () => ({ data: null })), post: vi.fn() };
    await expect(uploadMedicalArchive(api, 20, archive)).rejects.toThrow('list could not be verified'); expect(api.post).not.toHaveBeenCalled();
    await expect(uploadMedicalArchive(api, 20, archive, { assertContext: () => { throw new Error('Changed client'); } })).rejects.toThrow('Changed client');
  });
});
