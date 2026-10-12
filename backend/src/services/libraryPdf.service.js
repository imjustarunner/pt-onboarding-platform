import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, StandardFonts } from 'pdf-lib';
import { applyDocumentAnnotations } from '../utils/pdfDocumentAnnotations.js';

const invalid = message => { throw Object.assign(new Error(message), { status: 400, statusCode: 400 }); };
export const isPrivateLibraryPdf = path => /^phi-documents\/library\//.test(String(path || ''));

export async function fillLibraryPdf(buffer, { entries = [], fieldValues = {}, signatureData, signatureConsent = false } = {}, audit = {}) {
  if (!buffer || buffer.length > 40 * 1024 * 1024) invalid('Choose a PDF smaller than 40 MB.');
  let pdf;
  try { pdf = await PDFDocument.load(buffer); }
  catch { invalid('This PDF cannot be filled. Upload an unlocked, readable PDF and try again.'); }
  if (!pdf.getPageCount() || pdf.getPageCount() > 200) invalid('Use a PDF with 1–200 pages.');
  if (!Array.isArray(entries) || entries.length > 100) invalid('Use up to 100 entries per document.');
  if (!fieldValues || Array.isArray(fieldValues) || typeof fieldValues !== 'object' || Object.keys(fieldValues).length > 500) invalid('The PDF field values are not valid.');
  const hasSignature = entries.some(entry => entry?.kind === 'signature');
  if (hasSignature && signatureConsent !== true) invalid('Confirm that you intend to place your signature on this copy.');

  const form = pdf.getForm();
  for (const [name, value] of Object.entries(fieldValues)) {
    const field = form.getFieldMaybe(name);
    if (!field) invalid('A field no longer exists in this PDF. Reopen the source document.');
    if (field.isReadOnly()) continue;
    if (field instanceof PDFTextField) {
      if (typeof value !== 'string' || value.length > 4000) invalid('Text fields support up to 4,000 characters.');
      if (field.getMaxLength() && value.length > field.getMaxLength()) invalid(`The answer for ${name} exceeds the field length.`);
      try { field.setText(value); } catch { invalid(`The answer for ${name} does not fit this field.`); }
    } else if (field instanceof PDFCheckBox) {
      if (typeof value !== 'boolean') invalid('Checkbox fields must be checked or unchecked.');
      if (value) field.check(); else field.uncheck();
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
      if (value == null || value === '' || (field instanceof PDFRadioGroup && value === 'Off')) { field.clear(); continue; }
      if (typeof value !== 'string') invalid('Choose one of the PDF’s existing options.');
      // PDF.js submits the widget's on-value for radios and export-value for
      // choices. pdf-lib selects radio /Opt values and choice display labels.
      // Resolve only values actually defined by the uploaded PDF.
      let selection = value;
      if (field instanceof PDFRadioGroup) {
        const index = field.acroField.getOnValues().findIndex(option => option.decodeText() === value);
        if (index >= 0) selection = field.getOptions()[index];
      } else {
        const option = field.acroField.getOptions().find(option => option.value.decodeText() === value);
        if (option) selection = (option.display ?? option.value).decodeText();
      }
      if (!field.getOptions().includes(selection)) invalid('Choose one of the PDF’s existing options.');
      field.select(selection);
    } else invalid('This field cannot be changed. Place your signature using the signature tool.');
  }
  try {
    form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica));
    form.flatten();
  } catch { invalid('This PDF has unsupported form fields or characters. Try an unlocked PDF with standard form fields.'); }

  // The editor uses the visible crop box at rotation 0; translate to PDF page points.
  const placed = entries.map(entry => {
    if (!entry || !Number.isInteger(Number(entry.page)) || Number(entry.page) < 1 || Number(entry.page) > pdf.getPageCount()) invalid('An entry refers to a missing PDF page.');
    const page = pdf.getPage(Number(entry.page) - 1), crop = page.getCropBox();
    const x = Number(entry.x), y = Number(entry.y), width = Number(entry.width), height = Number(entry.height);
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || x + width > crop.width + .1 || y + height > crop.height + .1) invalid('Keep each entry inside the visible document page.');
    return { ...entry, x: x + crop.x, y: y + page.getHeight() - crop.y - crop.height };
  });
  await applyDocumentAnnotations(pdf, placed, signatureData);
  // Server-recorded provenance, independent of the editable document wording.
  await pdf.attach(Buffer.from(JSON.stringify({ sourceResourceId: audit.sourceResourceId, savedByUserId: audit.actorUserId, savedAt: new Date().toISOString(), signaturePlaced: hasSignature, signatureConsent: hasSignature && signatureConsent === true })), 'library-copy-record.json', { mimeType: 'application/json', description: 'Library copy creation record' });
  return Buffer.from(await pdf.save());
}
