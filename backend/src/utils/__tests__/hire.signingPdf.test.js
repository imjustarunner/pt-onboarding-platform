import { beforeAll, afterAll, expect, it } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSigningPdf } from '../signingPdf.js';
import DocumentSigningService from '../../services/documentSigning.service.js';
import StorageService from '../../services/storage.service.js';
import { vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));

const run = promisify(execFile);
let directory, original;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hire-pdf-fixture-'));
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText('Synthetic employee form', { font, x: 30, y: 750 });
  pdf.addPage([612, 792]);
  original = await pdf.save();
  await writeFile(join(directory, 'original.pdf'), original);
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
async function encrypted(userPassword = '') {
  const output = join(directory, userPassword ? 'password.pdf' : 'permission.pdf');
  await run(process.env.GHOSTSCRIPT_BINARY || 'gs', ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
    '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7', '-sOwnerPassword=synthetic-owner',
    `-sUserPassword=${userPassword}`, '-dEncryptionR=3', '-dKeyLength=128', '-dPermissions=-4',
    `-sOutputFile=${output}`, join(directory, 'original.pdf')]);
  return readFile(output);
}
it('preserves ordinary PDF pages without conversion', async () => {
  expect((await loadSigningPdf(original)).getPageCount()).toBe(2);
});
it('saves answers and a signature on a permission-protected PDF, preserving the source', async () => {
  const source = await encrypted(), before = Buffer.from(source);
  await expect(PDFDocument.load(source)).rejects.toThrow('encrypted');
  const read = vi.spyOn(StorageService, 'readTemplate').mockResolvedValue(source);
  try {
    const bytes = await DocumentSigningService.generateFinalizedPDF('templates/synthetic.pdf', 'pdf', null,
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      {}, { firstName: 'Synthetic', lastName: 'Employee', userId: 7, email: 'synthetic@example.test' },
      { signedAt: '2026-11-17T12:00:00Z' }, { x: 30, y: 60, width: 160, height: 40, page: 1 },
      { fieldDefinitions: [{ id: 'name', type: 'text', x: 30, y: 700, width: 200, height: 20, page: 1 }], fieldValues: { name: 'Synthetic Employee' } });
    const signed = await PDFDocument.load(bytes);
    expect(signed.getPageCount()).toBeGreaterThan(2);
    expect(signed.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(signed.getForm().getFields()).toHaveLength(0);
    expect(signed.getPage(0).node.Resources().lookup(PDFName.of('XObject')).keys().length).toBeGreaterThan(0);
    const parser = new PDFParse({ data: bytes });
    try {
      const text = (await parser.getText()).text;
      expect(text).toContain('Synthetic employee form');
      expect(text).toContain('Synthetic Employee');
    } finally { await parser.destroy(); }
    expect(source).toEqual(before);
  } finally { read.mockRestore(); }
});
it('rejects a PDF requiring an opening password with an actionable message', async () => {
  await expect(loadSigningPdf(await encrypted('synthetic-opening-password'))).rejects.toMatchObject({ status: 409,
    message: expect.stringContaining('opens without a password') });
});
