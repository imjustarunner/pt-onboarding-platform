/**
 * Branded Reference Release PDF stored on the applicant file.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { resolvePacketBrandChrome } from './packetBrandChrome.service.js';

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
  preview = false,
  agency = null,
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
  let page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - 36;

  const brand = await resolvePacketBrandChrome(agency || { name: agencyName });
  const logoUrl = brand.headerImageDataUrl || brand.headerLogoDataUrl;
  let logo;
  if (logoUrl) {
    try {
      const bytes = Buffer.from(logoUrl.split(',')[1], 'base64');
      logo = bytes[0] === 0xff ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
    } catch { /* Text letterhead remains available if an agency image is invalid. */ }
  }
  const decorate = () => {
    page.drawRectangle({x:0,y:780,width:612,height:12,color:rgb(accent.r,accent.g,accent.b)});
    if (logo) {
      const factor = Math.min(maxWidth / logo.width, 70 / logo.height);
      const width = logo.width * factor, height = logo.height * factor;
      page.drawImage(logo, {x:margin,y:748-height,width,height});
    } else {
      page.drawText(String(agencyName).slice(0,65), {x:margin,y:715,size:20,font:fontBold,color:rgb(accent.r,accent.g,accent.b)});
    }
    page.drawText('PEOPLE OPERATIONS  /  REFERENCE AUTHORIZATION', {x:margin,y:657,size:9,font:fontBold,color:rgb(.35,.43,.39)});
    page.drawLine({start:{x:margin,y:645},end:{x:564,y:645},thickness:1,color:rgb(.8,.87,.82)});
    y = 626;
  };
  decorate();
  const contentBottom = new Map();

  const draw = (text, { size = 11, bold = false, gap = 4, color = rgb(0.12, 0.14, 0.18) } = {}) => {
    const active = bold ? fontBold : font;
    for (const line of wrapText(text, active, size, maxWidth)) {
      if (y - size < 105) { contentBottom.set(page, y); page = pdfDoc.addPage(pageSize); decorate(); }
      page.drawText(line, { x: margin, y: y - size, size, font: active, color });
      y -= size + gap;
    }
  };

  if (preview) draw('PREVIEW - FICTIONAL APPLICANT - NOT SIGNED', { size: 10, bold: true });
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

  if (!refs.length) draw('References may be added separately. This authorization can be completed before references are listed.', {size:10, gap:8});

  const when = signedAt instanceof Date && Number.isFinite(signedAt.getTime())
    ? signedAt.toISOString()
    : String(signedAt || '');
  draw(preview ? 'Signature and date are collected when the applicant signs.' : `Signed electronically on ${when}`, { size: 10, color: rgb(0.35, 0.4, 0.45), gap: 8 });

  const dataUrl = String(signatureDataUrl || '').trim();
  if (dataUrl.startsWith('data:image')) {
    try {
      const b64 = dataUrl.split(',')[1] || '';
      const bytes = Buffer.from(b64, 'base64');
      const img = dataUrl.includes('image/png')
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);
      const dims = img.scale(Math.min(240 / img.width, 75 / img.height));
      if (y - dims.height < 95) { contentBottom.set(page, y); page = pdfDoc.addPage(pageSize); decorate(); }
      page.drawImage(img, { x: margin, y: Math.max(margin + 40, y - dims.height), width: dims.width, height: dims.height });
      y -= dims.height + 12;
    } catch {
      /* signature image optional */
    }
  }

  contentBottom.set(page, y);
  pdfDoc.getPages().forEach((p, i) => {
    const bottom = preview ? Math.max(0, (contentBottom.get(p) || 95) - 90) : 0;
    if (bottom) p.setCropBox(0, bottom, 612, 792 - bottom);
    p.drawLine({start:{x:margin,y:bottom+65},end:{x:564,y:bottom+65},thickness:1,color:rgb(.8,.87,.82)});
    p.drawText(preview ? 'Fictional applicant - practice only - no reference requests sent.' : 'Electronically signed reference authorization', {x:margin,y:bottom+48,size:8,font,color:rgb(.4,.47,.43)});
    p.drawText(`Plotline | ${i + 1} / ${pdfDoc.getPageCount()}`, {x:455,y:bottom+32,size:8,font,color:rgb(.4,.47,.43)});
  });

  return Buffer.from(await pdfDoc.save());
}
