import { rgb, StandardFonts } from 'pdf-lib';

export function isEmploymentContract(metadata = {}) {
  if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { return false; } }
  return !!(metadata?.contractGeneration || metadata?.employmentContract || metadata?.autoFromSendPreHire);
}

const printable = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '');

// A dedicated final agreement page keeps signatures clear of contract text regardless
// of template length. Persist its coordinates with the signed copy, before audit pages.
export async function addContractSignatureFields(pdf, { employeeName = '', agencyName = '', documentName = 'Employment agreement', employeeSignedAt = null } = {}) {
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.18, 0.2);
  const text = (value, x, y, size = 11, strong = false) => {
    let label = printable(value);
    const face = strong ? bold : font;
    while (face.widthOfTextAtSize(label, size) > 504) label = label.slice(0, -1);
    page.drawText(label, { x, y, size, font: face, color: ink });
  };
  text(agencyName || 'Employment agreement', 54, 735, 18, true);
  text(documentName, 54, 706, 11);
  page.drawLine({ start: { x: 54, y: 690 }, end: { x: 558, y: 690 }, color: ink, thickness: 1 });
  text('Agreement signatures', 54, 650, 18, true);
  text('By signing below, the parties agree to the preceding employment agreement.', 54, 620, 10);
  const layout = { version: 1, page: pdf.getPageCount() - 1,
    employee: { x: 66, y: 435, width: 350, height: 75, dateY: 411 },
    agency: { x: 66, y: 215, width: 350, height: 75, dateY: 191 } };
  for (const [key, label, name] of [['employee', 'Employee signature', employeeName], ['agency', 'Agency authorized signer signature', agencyName]]) {
    const field = layout[key];
    text(label, 54, field.y + 120, 13, true);
    text(name, 54, field.y + 99, 11);
    page.drawRectangle({ x: 54, y: field.y - 3, width: 504, height: 86, borderColor: rgb(0.65, 0.72, 0.72), borderWidth: 1 });
    text('Date signed: ____________________', 54, field.dateY, 10);
    if (key === 'employee' && employeeSignedAt) {
      text('Employee signature retained in the preceding signed document.', 66, field.y + 34, 10);
      const date = new Date(employeeSignedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      page.drawRectangle({ x: 54, y: field.dateY - 3, width: 504, height: 17, color: rgb(1, 1, 1) });
      text(`Date signed: ${date}`, 54, field.dateY, 10);
    }
  }
  text('Signatures and signing dates are recorded electronically with this agreement.', 54, 120, 10);
  return layout;
}

export async function signContractField(pdf, layout, role, signatureData, { name = '', signedAt = new Date().toISOString() } = {}) {
  const field = layout?.[role];
  const page = pdf.getPages()[layout?.page];
  if (!field || !page || !/^data:image\/(png|jpeg);base64,/.test(String(signatureData || ''))) {
    throw Object.assign(new Error('A valid signature and agreement signature field are required.'), { statusCode: 400 });
  }
  const signature = signatureData.startsWith('data:image/png') ? await pdf.embedPng(signatureData) : await pdf.embedJpg(signatureData);
  page.drawImage(signature, { x: field.x, y: field.y, ...signature.scaleToFit(field.width, field.height) });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 54, y: field.dateY - 3, width: 504, height: 17, color: rgb(1, 1, 1) });
  const date = new Date(signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  page.drawText(printable(`Date signed: ${date}   ${name}`).slice(0, 95), { x: 54, y: field.dateY, font, size: 10 });
}
