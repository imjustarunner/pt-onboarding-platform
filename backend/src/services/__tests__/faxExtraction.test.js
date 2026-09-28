import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { detectFaxMime, readFax, suggestFaxFields, validateFaxFields, validateSuggestions } from '../faxExtraction.service.js';

describe('fax extraction using synthetic content', () => {
  it('rejects misleading file extensions / unsupported bytes', () => {
    expect(() => detectFaxMime(Buffer.from('<html>not a pdf</html>'))).toThrow('PDF');
  });
  it('reads every PDF page in batches of five without removing printed text', async () => {
    const pdf = await PDFDocument.create(); for (let i = 0; i < 7; i++) pdf.addPage();
    const vision = { batchAnnotateFiles: vi.fn(async ({ requests }) => [{ responses: [{ responses: requests[0].pages.map(page => ({ fullTextAnnotation: { text: `Printed patient name page ${page}`, pages: [] } })) }] }]) };
    const result = await readFax(Buffer.from(await pdf.save()), { vision });
    expect(result.pages.map(p => p.page)).toEqual([1,2,3,4,5,6,7]);
    expect(vision.batchAnnotateFiles.mock.calls.map(([r]) => r.requests[0].pages)).toEqual([[1,2,3,4,5],[6,7]]);
    expect(result.pages[0].text).toContain('Printed');
    expect(vision.batchAnnotateFiles.mock.calls[0][0].requests[0].inputConfig.content).toBeInstanceOf(Buffer);
  });
  it('fails if even one page has an OCR error', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const vision = { batchAnnotateFiles: vi.fn(async () => [{ responses: [{ responses: [{ error: { code: 3 } }] }] }]) };
    await expect(readFax(Buffer.from(await pdf.save()), { vision })).rejects.toThrow('page');
  });
  it('uses only the sensitive Vertex path and keeps geometry in the prompt', async () => {
    const generate = vi.fn(async () => ({ text: JSON.stringify({ candidates: [{ field: 'guardian_full_name', value: 'Taylor Example', evidence: 'Guardian: Taylor Example', page: 1, confidence: 'high' }] }) }));
    const result = await suggestFaxFields([{ page: 1, text: 'Guardian: Taylor Example', words: [{ text: 'Guardian', box: [{ x: 40, y: 20 }] }] }], { generate });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ vertexOnly: true, sensitive: true }));
    expect(generate.mock.calls[0][0].prompt).toContain('"x":40');
    expect(result[0].field).toBe('guardian_full_name');
  });
  it('does not let invented evidence, values or unknown field keys silently become chart fields', () => {
    const candidates = [
      { field: 'client_full_name', value: 'Fake Person', evidence: 'Patient: Sam Sample', page: 1 },
      { field: 'client_phone', value: '555-1234', evidence: 'invented', page: 1 },
      { field: 'admin', value: 'Sam Sample', evidence: 'Patient: Sam Sample', page: 1 }
    ];
    expect(validateSuggestions({ candidates }, [{ page: 1, text: 'Patient: Sam Sample' }])).toMatchObject([{ field: '', value: 'Sam Sample' }]);
  });
  it('stops automatic intake when multiple clients are detected', async () => {
    await expect(suggestFaxFields([], { generate: async () => ({ text: '{"multipleClients":true,"candidates":[]}' }) })).rejects.toThrow('multiple clients');
  });
  it('validates dates, emails and required identity without guessing', () => {
    expect(() => validateFaxFields({ client_full_name: 'Sam Sample', date_of_birth: '2020-02-30' })).toThrow('valid');
    expect(() => validateFaxFields({ client_full_name: 'Sam Sample', guardian_email: 'not-email' })).toThrow('email');
    expect(() => validateFaxFields({ guardian_full_name: 'Sam Sample' })).toThrow('client name');
    expect(validateFaxFields({ client_first_name: 'Sam', client_last_name: 'Sample', arbitrary: 'ignored' })).toEqual({ client_first_name: 'Sam', client_last_name: 'Sample', client_full_name: 'Sam Sample' });
  });
});
