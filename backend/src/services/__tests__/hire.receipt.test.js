import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../storage.service.js', () => ({ default: {} }));
import { buildSignedReceipt } from '../prehireSignedReceipt.service.js';
const signatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
describe('retained signature receipt', () => {
  it('keeps all original PDF pages and appends a signed receipt', async () => {
    const source = await PDFDocument.create(); source.addPage(); source.addPage();
    const bytes = await buildSignedReceipt({ title: 'Policy', body: 'Acknowledged policy text', signerName: 'Elena', signatureData, source: await source.save() });
    const copy = await PDFDocument.load(bytes); expect(copy.getPageCount()).toBe(3);
    expect(copy.catalog.has(copy.context.obj('Names'))).toBe(true);
  });
  it('rejects a missing signature before claiming a document was signed', async () => {
    await expect(buildSignedReceipt({ title: 'Policy', body: 'Text', signerName: 'Elena', signatureData: '' })).rejects.toThrow('valid signature');
  });
});
