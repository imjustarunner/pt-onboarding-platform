import { StandardFonts, rgb } from 'pdf-lib';

const invalid = (message) => { throw Object.assign(new Error(message), { status: 400, statusCode: 400 }); };

// Coordinates use PDF points measured from the upper-left of the unrotated page.
export function validateDocumentAnnotations(pdf, input = []) {
  if (!Array.isArray(input) || input.length > 100) invalid('Use up to 100 entries per document.');
  return input.map((entry) => {
    if (!entry || !['text', 'check', 'signature'].includes(entry.kind)) invalid('Choose text, a checkmark or a signature.');
    const page = Number(entry.page), x = Number(entry.x), y = Number(entry.y);
    const width = Number(entry.width), height = Number(entry.height), fontSize = Number(entry.fontSize || 12);
    if (!Number.isInteger(page) || page < 1 || page > pdf.getPageCount()) invalid('An entry refers to a missing document page.');
    const size = pdf.getPage(page - 1).getSize();
    if (![x, y, width, height, fontSize].every(Number.isFinite) || x < 0 || y < 0 || width < 8 || height < 8 || x + width > size.width + 0.1 || y + height > size.height + 0.1 || fontSize < 6 || fontSize > 36) invalid('Keep each entry inside the document page.');
    const text = entry.kind === 'text' ? String(entry.text || '') : '';
    if (text.length > 4000 || (entry.kind === 'text' && !text.trim())) invalid('Enter text or remove the empty entry before submitting.');
    return { kind: entry.kind, page, x, y, width, height, fontSize, text };
  });
}

export async function applyDocumentAnnotations(pdf, input = [], signatureData = null) {
  const entries = validateDocumentAnnotations(pdf, input);
  if (!entries.length) return entries;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let signature;
  for (const entry of entries) {
    const page = pdf.getPage(entry.page - 1);
    const bottom = page.getHeight() - entry.y - entry.height;
    if (entry.kind === 'signature') {
      if (!/^data:image\/(png|jpeg);base64,/.test(signatureData || '') || signatureData.length > 3_000_000) invalid('Capture your signature before submitting.');
      signature ||= signatureData.startsWith('data:image/png') ? await pdf.embedPng(signatureData) : await pdf.embedJpg(signatureData);
      const fitted = signature.scaleToFit(entry.width, entry.height);
      page.drawImage(signature, { x: entry.x, y: bottom + (entry.height - fitted.height) / 2, ...fitted });
    } else if (entry.kind === 'check') {
      const x = entry.x, y = bottom, w = entry.width, h = entry.height;
      page.drawLine({ start: { x: x + w * .12, y: y + h * .5 }, end: { x: x + w * .4, y: y + h * .18 }, thickness: 1.7, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: x + w * .4, y: y + h * .18 }, end: { x: x + w * .9, y: y + h * .85 }, thickness: 1.7, color: rgb(0, 0, 0) });
    } else {
      const normalized = entry.text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
      let lines, size = entry.fontSize;
      try {
        for (; size >= 6; size -= .5) {
          lines = normalized.split('\n').flatMap(paragraph => {
            const result = []; let line = '';
            for (const char of paragraph) {
              if (font.widthOfTextAtSize(line + char, size) > entry.width && line) { result.push(line); line = ''; }
              line += char;
            }
            result.push(line); return result;
          });
          if (lines.length * size * 1.2 <= entry.height && lines.every(line => font.widthOfTextAtSize(line, size) <= entry.width)) break;
        }
      } catch { invalid('This entry contains characters this PDF font cannot display. Use a supported spelling in the document.'); }
      if (size < 6) invalid('Enlarge the text box so your whole answer fits before signing.');
      lines.forEach((line, index) => page.drawText(line, { x: entry.x, y: page.getHeight() - entry.y - size - index * size * 1.2, size, font }));
    }
  }
  // Preserve the submitted values as well as their visible, flattened appearance.
  await pdf.attach(Buffer.from(JSON.stringify(entries), 'utf8'), 'completed-form-entries.json', { mimeType: 'application/json', description: 'Entries supplied by the signer' });
  return entries;
}
