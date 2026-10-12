import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFHexString } from 'pdf-lib';
import { fillLibraryPdf } from '../libraryPdf.service.js';
const signatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZ8AAAAASUVORK5CYII=';
const text = { kind: 'text', page: 1, x: 40, y: 50, width: 180, height: 30, fontSize: 12, text: 'Sample Person' };
async function fixture() {
  const pdf = await PDFDocument.create(), page = pdf.addPage([612, 792]), form = pdf.getForm();
  const name = form.createTextField('Name'); name.addToPage(page, { x: 30, y: 700, width: 180, height: 25 });
  const check = form.createCheckBox('Agree'); check.addToPage(page, { x: 30, y: 650, width: 18, height: 18 });
  const choice = form.createDropdown('Office'); choice.addOptions(['Denver', 'Colorado Springs']); choice.addToPage(page, { x: 30, y: 600, width: 180, height: 25 });
  return Buffer.from(await pdf.save());
}
describe('library PDF filling', () => {
  it('persists native fields, placed text, a date, a check and a signature as visible PDF content', async () => {
    const source = await fixture();
    const result = await fillLibraryPdf(source, { fieldValues: { Name: 'Sample Person', Agree: true, Office: 'Denver' }, entries: [text, { ...text, y: 90, text: '10/12/2026' }, { ...text, kind: 'check', y: 130, width: 18, height: 18 }, { ...text, kind: 'signature', y: 160, height: 50 }], signatureData, signatureConsent: true }, { actorUserId: 7, sourceResourceId: 10 });
    const restored = await PDFDocument.load(result);
    expect(restored.getPageCount()).toBe(1); expect(restored.getForm().getFields()).toHaveLength(0);
    expect(restored.getPage(0).node.Resources().toString()).toContain('Image'); expect(restored.catalog.toString()).toContain('EmbeddedFiles');
    expect((await PDFDocument.load(source)).getForm().getFields()).toHaveLength(3);
  });
  it('requires explicit intent before adding a signature and rejects invalid fields/options/placement', async () => {
    const source = await fixture();
    await expect(fillLibraryPdf(source, { entries: [{ ...text, kind: 'signature' }], signatureData })).rejects.toThrow('Confirm');
    await expect(fillLibraryPdf(source, { fieldValues: { Missing: 'value' } })).rejects.toThrow('no longer exists');
    await expect(fillLibraryPdf(source, { fieldValues: { Office: 'Unknown' } })).rejects.toThrow('existing options');
    await expect(fillLibraryPdf(source, { entries: [{ ...text, x: 900 }] })).rejects.toThrow('visible');
    await expect(fillLibraryPdf(source, { entries: [{ ...text, text: '' }] })).rejects.toThrow('empty');
    await expect(fillLibraryPdf(Buffer.from('not a pdf'))).rejects.toThrow('cannot be filled');
  });

  it('resolves native radio on-values and choice export values from the uploaded PDF', async () => {
    const pdf = await PDFDocument.create(), page = pdf.addPage([612, 792]), form = pdf.getForm();
    const office = form.createDropdown('Office');
    office.addToPage(page, { x: 30, y: 700, width: 200, height: 25 });
    office.acroField.setOptions([
      { value: PDFHexString.fromText('DEN'), display: PDFHexString.fromText('Denver office') },
      { value: PDFHexString.fromText('COS'), display: PDFHexString.fromText('Colorado Springs office') }
    ]);
    const location = form.createRadioGroup('Location');
    location.addOptionToPage('Denver', page, { x: 30, y: 620, width: 18, height: 18 });
    location.addOptionToPage('Colorado Springs', page, { x: 60, y: 620, width: 18, height: 18 });
    const source = Buffer.from(await pdf.save());
    expect(location.getOptions()).toEqual(['Denver', 'Colorado Springs']);
    expect(location.acroField.getOnValues().map(value => value.decodeText())).toEqual(['0', '1']);
    // These are the exact raw values emitted by PDF.js, including an unselected radio.
    for (const fieldValues of [{ Office: 'DEN', Location: '0' }, { Office: 'COS', Location: '1' }, { Office: 'DEN', Location: 'Off' }]) {
      const filled = await fillLibraryPdf(source, { fieldValues });
      expect((await PDFDocument.load(filled)).getForm().getFields()).toHaveLength(0);
    }
    await expect(fillLibraryPdf(source, { fieldValues: { Office: 'Other office' } })).rejects.toThrow('existing options');
    await expect(fillLibraryPdf(source, { fieldValues: { Location: '2' } })).rejects.toThrow('existing options');
    // Filling creates a copy; the source options and selections are unchanged.
    const original = (await PDFDocument.load(source)).getForm();
    expect(original.getDropdown('Office').getSelected()).toEqual([]);
    expect(original.getRadioGroup('Location').getSelected()).toBeUndefined();
  });
  it('honors visible crop coordinates and can reopen a completed copy for further entries', async () => {
    const source = await PDFDocument.create(), page = source.addPage([612,792]); page.setCropBox(20,30,550,700);
    const filled = await fillLibraryPdf(Buffer.from(await source.save()), { entries: [text] });
    const refilled = await fillLibraryPdf(filled, { entries: [{ ...text, y: 120, text: 'Second entry' }] });
    const restored = await PDFDocument.load(refilled); expect(restored.getPage(0).getCropBox()).toEqual({ x: 20, y: 30, width: 550, height: 700 });
  });
});
