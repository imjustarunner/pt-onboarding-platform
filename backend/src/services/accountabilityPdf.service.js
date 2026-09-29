import { PDFDocument, StandardFonts } from 'pdf-lib';
import { reportTotals } from '../utils/accountability.js';

// Receipt bytes are supplied only by the authenticated report service.
export async function createAccountabilityPdf({ snapshot, receipts = [], signature = null }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page;
  let y = 0;
  const space = (height = 18) => {
    if (y < 50 + height) { page = pdf.addPage([612, 792]); y = 742; }
  };
  const line = (value, heading = false) => {
    // Standard PDF fonts cannot encode arbitrary Unicode. Preserve supported text
    // and replace unsupported glyphs instead of failing the entire report.
    const safe = [...String(value)].map((c) => { try { font.encodeText(c); return c; } catch { return '?'; } }).join('');
    for (const paragraph of safe.split('\n')) {
      let chunk = '';
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(chunk + char, 11) > 510) { space(); page.drawText(chunk, { x: 50, y, size: 11, font: heading ? bold : font }); y -= 16; chunk = ''; }
        chunk += char;
      }
      space(); page.drawText(chunk, { x: 50, y, size: 11, font: heading ? bold : font }); y -= 18;
    }
  };
  const { settings, data } = snapshot;
  const totals = reportTotals(data, settings);
  line(`${signature ? 'SIGNED' : 'DRAFT - UNSIGNED'} MONTHLY ACCOUNTABILITY REPORT`, true);
  if (!signature) line('Working copy. Printing does not submit or lock this report.');
  line(`${snapshot.agencyName} | ${snapshot.month}`);
  line(`Participant: ${snapshot.userName}`);
  line(`Approved home office: ${settings.officeAddress}`);
  line(`Recipient: ${settings.recipient}`);
  line('Plan parameters', true); line(settings.policy);
  line('Home office expenses', true);
  for (const e of data.expenses) {
    const category = settings.categories.find((c) => c.key === e.category);
    line(`${e.date} | ${category.label} | ${e.vendor}`);
    line(`Paid: ${e.amount == null ? '________' : '$' + e.amount.toFixed(2)} | Business allocation: ${category.percent}% | Requested: ${e.amount == null ? '________' : '$' + (Math.round(e.amount * category.percent) / 100).toFixed(2)}`);
    if (e.notes) line(e.notes);
    line(`Receipts: ${receipts.filter((r) => r.expense_id === e.id).map((r) => r.original_name).join(', ') || 'None attached'}`);
  }
  line('Personal vehicle business mileage', true);
  line(`Configured rate: $${settings.mileageRate.toFixed(4)} per mile`);
  for (const m of data.mileage) {
    line(`${m.date || '________'} | ${m.start || '________'} to ${m.end || '________'} | ${m.miles ?? '________'} miles`);
    line(`Business purpose: ${m.purpose}`);
    if (m.notes) line(m.notes);
  }
  line(`Expenses: $${(totals.expenseCents / 100).toFixed(2)} | Mileage: $${(totals.mileageCents / 100).toFixed(2)}`, true);
  line(`Total requested: $${(totals.totalCents / 100).toFixed(2)}`, true);
  line('Certification', true); line(settings.attestation);
  if (signature) {
    const img = await pdf.embedPng(Buffer.from(signature.split(',')[1], 'base64'));
    space(110);
    const size = img.scaleToFit(260, 65);
    page.drawImage(img, { x: 50, y: y - size.height, ...size }); y -= 80;
    line(`Signed by ${snapshot.userName} on ${snapshot.signedAt} (UTC)`);
    line(`Report ${snapshot.reportId} | Account ${snapshot.userId}`);
  }
  for (const r of receipts) {
    y = 0;
    line(`Receipt: ${r.original_name}`, true);
    const expense = data.expenses.find((e) => e.id === r.expense_id);
    line(`${expense?.date || ''} | ${expense?.vendor || ''} | ${expense?.category || ''}`);
    if (r.mime_type === 'application/pdf') {
      const source = await PDFDocument.load(r.bytes);
      const pages = await pdf.copyPages(source, source.getPageIndices());
      pages.forEach((p) => pdf.addPage(p));
    } else {
      const img = r.mime_type === 'image/png' ? await pdf.embedPng(r.bytes) : await pdf.embedJpg(r.bytes);
      const size = img.scaleToFit(510, 620);
      page.drawImage(img, { x: 50, y: y - size.height, ...size });
    }
  }
  return Buffer.from(await pdf.save());
}
