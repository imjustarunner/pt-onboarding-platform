import { describe, it, expect, vi } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { addContractSignatureFields, signContractField } from '../../utils/contractSignatureFields.js';
import DocumentSigningService from '../documentSigning.service.js';

const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const images = page => page.node.Resources()?.lookup(PDFName.of('XObject'))?.keys().length || 0;

describe('fixed employment agreement signature fields', () => {
  it('preserves the agreement and places each signature in its own field before audit pages', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    const layout = await addContractSignatureFields(pdf, { employeeName: 'Devon Rodriguez', agencyName: 'ITSCO' });
    expect(layout.page).toBe(2);
    expect(layout.employee.y).toBeGreaterThan(layout.agency.y + layout.agency.height);
    await signContractField(pdf, layout, 'employee', signature, { name: 'Devon Rodriguez', signedAt: '2026-10-06T12:00:00Z' });
    pdf.addPage(); // Existing audit certificate remains separate.
    const retained = await PDFDocument.load(await pdf.save());
    await signContractField(retained, layout, 'agency', signature, { name: 'Agency signer' });
    expect(retained.getPageCount()).toBe(4);
    expect(images(retained.getPages()[2])).toBe(2);
    expect(images(retained.getPages()[0])).toBe(0);
    expect(images(retained.getPages()[3])).toBe(0);
  });
  it('ignores arbitrary annotations for contracts and saves the fixed placement in the audit trail', async () => {
    const base = await PDFDocument.create(); base.addPage();
    vi.spyOn(DocumentSigningService, 'convertHTMLToPDF').mockResolvedValue(await base.save());
    const audit = { signedAt: '2026-10-06T12:00:00Z' };
    const bytes = await DocumentSigningService.generateFinalizedPDF(null, 'html', '<p>Agreement</p>', signature, {},
      { firstName: 'Devon', lastName: 'Rodriguez', userId: 1, email: 'devon@example.com' }, audit, null,
      { employmentContract: true, contractAgencyName: 'ITSCO', documentName: 'Employment agreement',
        documentAnnotations: [{ kind: 'signature', page: 0, x: 0, y: 0, width: 0.5, height: 0.5 }] });
    const signed = await PDFDocument.load(bytes);
    expect(audit.contractSignatureFields.page).toBe(1);
    expect(signed.getPageCount()).toBe(3);
    expect(images(signed.getPages()[0])).toBe(0);
    expect(images(signed.getPages()[1])).toBe(1);
    expect(audit.documentAnnotations).toBeUndefined();
  });
  it('rejects missing signatures instead of completing a blank field', async () => {
    const pdf = await PDFDocument.create();
    const layout = await addContractSignatureFields(pdf);
    await expect(signContractField(pdf, layout, 'employee', '')).rejects.toMatchObject({ statusCode: 400 });
  });
});
