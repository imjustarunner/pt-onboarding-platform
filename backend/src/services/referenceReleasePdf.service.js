/**
 * Branded Reference Release PDF stored on the applicant file.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function hexToRgb(hex, fallback = { r: 0.1, g: 0.55, b: 0.33 }) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildReferenceReleasePdfBuffer({
  agencyName = 'the organization',
  applicantName = '',
  applicantEmail = '',
  jobTitle = '',
  signatureDataUrl = '',
  signedAt = new Date(),
  references = [],
  accentHex = '#1a8c54'
} = {}) {
  const accent = hexToRgb(accentHex);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [612, 792];
  const margin = 48;
  const maxWidth = pageSize[0] - margin * 2;
  const page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - 36;

  page.drawRectangle({
    x: 0,
    y: pageSize[1] - 56,
    width: pageSize[0],
    height: 56,
    color: rgb(accent.r, accent.g, accent.b)
  });
  page.drawText(String(agencyName || 'People Operations').slice(0, 80), {
    x: margin,
    y: pageSize[1] - 36,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1)
  });
  y = pageSize[1] - 88;

  const draw = (text, { size = 11, bold = false, gap = 4, color = rgb(0.12, 0.14, 0.18) } = {}) => {
    const active = bold ? fontBold : font;
    for (const line of wrapText(text, active, size, maxWidth)) {
      page.drawText(line, { x: margin, y: y - size, size, font: active, color });
      y -= size + gap;
    }
  };

  draw('Reference Release', { size: 18, bold: true, gap: 10 });
  if (jobTitle) draw(`Role: ${jobTitle}`, { size: 11, color: rgb(0.35, 0.4, 0.45) });
  if (applicantName) draw(`Applicant: ${applicantName}`, { size: 11, color: rgb(0.35, 0.4, 0.45) });
  if (applicantEmail) draw(`Email: ${applicantEmail}`, { size: 11, color: rgb(0.35, 0.4, 0.45), gap: 12 });

  draw(
    `I authorize ${agencyName} to contact the professional references I have provided and to obtain information regarding my employment history, educational background, professional conduct, qualifications, and character. I release ${agencyName}, its employees and agents, and those references from any and all liability arising from this inquiry. I understand this signed release will be stored with my application and employment file.`,
    { size: 11, gap: 5 }
  );
  y -= 8;

  const refs = Array.isArray(references) ? references.filter((r) => r?.name || r?.email) : [];
  if (refs.length) {
    draw('References named', { size: 13, bold: true, color: rgb(accent.r, accent.g, accent.b), gap: 8 });
    refs.forEach((r, i) => {
      const line = [r.name, r.email, r.organization].filter(Boolean).join(' · ');
      draw(`${i + 1}. ${line}`, { size: 11, gap: 4 });
    });
    y -= 8;
  }

  const when = signedAt instanceof Date && Number.isFinite(signedAt.getTime())
    ? signedAt.toISOString()
    : String(signedAt || '');
  draw(`Signed electronically on ${when}`, { size: 10, color: rgb(0.35, 0.4, 0.45), gap: 8 });

  const dataUrl = String(signatureDataUrl || '').trim();
  if (dataUrl.startsWith('data:image')) {
    try {
      const b64 = dataUrl.split(',')[1] || '';
      const bytes = Buffer.from(b64, 'base64');
      const img = dataUrl.includes('image/png')
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);
      const dims = img.scale(0.35);
      page.drawImage(img, { x: margin, y: Math.max(margin + 40, y - dims.height), width: dims.width, height: dims.height });
      y -= dims.height + 12;
    } catch {
      /* signature image optional */
    }
  }

  page.drawText('Electronic signature — ESIGN Act, 15 U.S.C. § 7001 et seq.', {
    x: margin,
    y: margin,
    size: 8,
    font,
    color: rgb(0.5, 0.52, 0.55)
  });

  return Buffer.from(await pdfDoc.save());
}
