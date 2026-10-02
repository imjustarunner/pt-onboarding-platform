import { AVERY_35702, svgDataUrl, safeLogo } from './businessCards';
import { cardSheetPlan, normalizePrintSettings } from './businessCardPrint';
import { loadBusinessCardFonts } from './businessCardFonts';

export function downloadCardFile(contents, type, name) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function embedCardLogo(value) {
  const logo = safeLogo(value);
  if (!logo) return '';
  if (logo.startsWith('data:')) return logo;
  const response = await fetch(logo, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Could not load the organization logo. Upload a PNG or JPEG logo to continue.');
  const blob = await response.blob();
  if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) throw new Error('Upload a PNG, JPEG, or WebP logo to include it in the exported cards.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
  });
}

export async function businessCardsPdf(cards, options = {}) {
  const settings = normalizePrintSettings(options);
  const fonts = await loadBusinessCardFonts();
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle('Business cards · Avery 35702');
  const { bleed, bottomBleed } = settings;
  const artworkWidth = AVERY_35702.card + 2 * bleed;
  const artworkHeight = AVERY_35702.card + bleed + bottomBleed;
  for (const sheet of cardSheetPlan(cards, settings, fonts)) {
    const img = new Image(); img.src = svgDataUrl(sheet.svg);
    await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = Math.round(artworkWidth * 400); canvas.height = Math.round(artworkHeight * 400);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const artwork = await pdf.embedPng(canvas.toDataURL('image/png'));
    const page = pdf.addPage([AVERY_35702.width * 72, AVERY_35702.height * 72]);
    for (const p of sheet.positions) {
      const bounds = { x: p.x * 72, y: (AVERY_35702.height - p.y - AVERY_35702.card) * 72, width: 180, height: 180 };
      page.drawImage(artwork, { x: bounds.x - bleed * 72, y: bounds.y - bottomBleed * 72, width: artworkWidth * 72, height: artworkHeight * 72 });
      if (settings.guides) page.drawRectangle({ ...bounds, borderWidth: 0.4, borderColor: rgb(0.4, 0.4, 0.4), borderDashArray: [2, 2] });
    }
  }
  return pdf.save();
}
