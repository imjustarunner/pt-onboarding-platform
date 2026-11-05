import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function wrapLine(font, text, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function buildIntroductionPdf({
  schoolName,
  staffNames = [],
  providerName,
  blurb = '',
  supervisorName = '',
  logoBytes = null
} = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.09, 0.35, 0.28);
  const ink = rgb(0.1, 0.12, 0.14);
  const page = pdf.addPage([612, 792]);
  let y = 740;
  page.drawText('SchoolCareBridge', { x: 48, y, size: 22, font: bold, color: green });
  y -= 28;
  page.drawText(String(schoolName || 'School'), { x: 48, y, size: 16, font: bold, color: ink });
  y -= 16;
  if (logoBytes) {
    try {
      const head = Buffer.from(logoBytes).slice(0, 4).toString('hex');
      const image = head.startsWith('89504e47')
        ? await pdf.embedPng(logoBytes)
        : head.startsWith('ffd8ff')
          ? await pdf.embedJpg(logoBytes)
          : null;
      if (image) {
        const width = 120;
        const height = Math.min(72, (image.height / image.width) * width);
        y -= height;
        page.drawImage(image, { x: 48, y, width, height });
        y -= 16;
      }
    } catch {
      // A missing or unreadable logo still leaves the school name on the page.
    }
  }
  const drawBlock = (title, body) => {
    y -= 8;
    page.drawText(title, { x: 48, y, size: 12, font: bold, color: green });
    y -= 16;
    for (const line of wrapLine(font, body, 11, 500)) {
      page.drawText(line, { x: 48, y, size: 11, font, color: ink });
      y -= 15;
    }
  };
  drawBlock('School staff', staffNames.length ? staffNames.join(', ') : 'No school staff are listed yet.');
  drawBlock(providerName || 'Provider', blurb || 'No short introduction is on file yet.');
  if (supervisorName) drawBlock('Supervisor', supervisorName);
  return Buffer.from(await pdf.save());
}
