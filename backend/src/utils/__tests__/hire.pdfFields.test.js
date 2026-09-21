import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { detectPdfFormFields, fitPdfFieldText } from '../pdfFormFields.js';
import DocumentSigningService from '../../services/documentSigning.service.js';

describe('reusable PDF input fields', () => {
  it('imports native text and checkbox fields with their actual page and bounds', async () => {
    const doc = await PDFDocument.create(); doc.addPage(); const page = doc.addPage();
    const name = doc.getForm().createTextField('Legal_name'); name.enableRequired(); name.addToPage(page, { x: 40, y: 80, width: 180, height: 24 });
    const consent = doc.getForm().createCheckBox('Acknowledged'); consent.addToPage(page, { x: 40, y: 40, width: 16, height: 16 });
    const fields = await detectPdfFormFields(await doc.save());
    expect(fields).toHaveLength(2); expect(fields[0]).toMatchObject({ type: 'text', nativeFieldName: 'Legal_name', page: 2, required: true });
    expect(fields[1]).toMatchObject({ type: 'checkbox', page: 2 });
    await DocumentSigningService.addFieldValuesToPDF(doc, fields, { [fields[0].id]: 'A long candidate legal name', [fields[1].id]: true });
    expect(doc.getForm().getFields()).toHaveLength(0); // retained PDF cannot have its answers edited
    expect((await doc.save()).length).toBeGreaterThan(100);
  });
  it('does not invent fields on a scanned or flat document', async () => {
    const doc = await PDFDocument.create(); doc.addPage(); expect(await detectPdfFormFields(await doc.save())).toEqual([]);
  });
  it('fits text within the field and rejects an answer that cannot fit legibly', async () => {
    const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
    const result = fitPdfFieldText('A longer candidate name with several words', font, 100, 30);
    expect(result.text.split('\n').every(line => font.widthOfTextAtSize(line, result.size) <= 100)).toBe(true);
    expect(result.text.split('\n').length * result.lineHeight).toBeLessThanOrEqual(30);
    expect(() => fitPdfFieldText('very long '.repeat(100), font, 40, 10)).toThrow('does not fit');
  });
});
