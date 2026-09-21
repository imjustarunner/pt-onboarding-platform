import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFSignature } from 'pdf-lib';

// Reuse fields already authored in a PDF. Flat/scanned pages need a reusable
// template: guessing where a person should sign is not reliable.
export async function detectPdfFormFields(bytes) {
  const document = await PDFDocument.load(bytes);
  const pages = document.getPages();
  const definitions = [];
  for (const field of document.getForm().getFields()) {
    if (field.isReadOnly()) continue;
    const type = field instanceof PDFTextField ? (field.isMultiline() ? 'textarea' : 'text')
      : field instanceof PDFCheckBox ? 'checkbox'
        : field instanceof PDFDropdown || field instanceof PDFOptionList ? 'select'
          : field instanceof PDFSignature ? 'signature' : null;
    if (!type) continue;
    const widget = field.acroField.getWidgets()[0];
    if (!widget) continue;
    const pageIndex = pages.findIndex(page => widget.P()?.toString() === page.ref.toString()
      || page.node.Annots()?.asArray().some(ref => document.context.lookup(ref) === widget.dict));
    if (pageIndex < 0) continue;
    const rect = widget.getRectangle();
    definitions.push({ id: `pdf-${definitions.length + 1}`, nativeFieldName: field.getName(), label: field.getName().replace(/[_\.]+/g, ' '),
      type, page: pageIndex + 1, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      required: field.isRequired(), ...(type === 'select' ? { options: field.getOptions().map(value => ({ value, label: value })) } : {}) });
  }
  return definitions;
}

export function fitPdfFieldText(text, font, width, height, preferredSize = 12) {
  const words = String(text).split(/\s+/);
  for (let size = Math.min(20, Math.max(6, preferredSize)); size >= 6; size -= .5) {
    const lines = []; let line = '';
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > width) { // Break long email addresses / identifiers, too.
        if (line) { lines.push(line); line = ''; }
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width && line) { lines.push(line); line = ''; }
          line += char;
        }
      } else if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    if (lines.length * size * 1.15 <= height) return { text: lines.join('\n'), size, lineHeight: size * 1.15 };
  }
  throw Object.assign(new Error('This answer does not fit in the document field. Shorten it or ask People Operations to enlarge the field.'), { status: 400, statusCode: 400 });
}
