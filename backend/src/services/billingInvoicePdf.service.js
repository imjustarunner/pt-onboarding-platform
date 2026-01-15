import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function dollars(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function dateOnly(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

class BillingInvoicePdfService {
  static async generateInvoicePdf({ agencyName, invoice }) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 72;

    page.drawText('Platform Invoice', { x: 72, y, size: 22, font: helveticaBold, color: rgb(0, 0, 0) });
    y -= 28;
    page.drawText(`Agency: ${agencyName}`, { x: 72, y, size: 12, font: helvetica, color: rgb(0, 0, 0) });
    y -= 18;
    page.drawText(`Billing Period: ${dateOnly(invoice.period_start)} - ${dateOnly(invoice.period_end)}`, { x: 72, y, size: 12, font: helvetica, color: rgb(0, 0, 0) });
    y -= 24;

    page.drawText('Line Items', { x: 72, y, size: 14, font: helveticaBold, color: rgb(0, 0, 0) });
    y -= 18;

    const headerY = y;
    page.drawText('Description', { x: 72, y: headerY, size: 10, font: helveticaBold, color: rgb(0, 0, 0) });
    page.drawText('Amount', { x: width - 160, y: headerY, size: 10, font: helveticaBold, color: rgb(0, 0, 0) });
    y -= 12;
    page.drawLine({ start: { x: 72, y }, end: { x: width - 72, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    y -= 14;

    const rows = [];
    rows.push({ desc: 'Platform Base Fee', cents: invoice.base_fee_cents });

    const items = typeof invoice.line_items_json === 'string' ? JSON.parse(invoice.line_items_json) : invoice.line_items_json;
    const breakdown = items?.lineItems || [];
    for (const it of breakdown) {
      if (!it || !it.extraCents || it.extraCents <= 0) continue;
      rows.push({
        desc: `${it.label} overage (${it.overage} @ $${dollars(it.unitCostCents)})`,
        cents: it.extraCents
      });
    }

    for (const r of rows) {
      if (y < 120) break; // single-page guard
      page.drawText(r.desc, { x: 72, y, size: 10, font: helvetica, color: rgb(0, 0, 0), maxWidth: width - 260 });
      page.drawText(`$${dollars(r.cents)}`, { x: width - 160, y, size: 10, font: helvetica, color: rgb(0, 0, 0) });
      y -= 14;
    }

    y -= 10;
    page.drawLine({ start: { x: 72, y }, end: { x: width - 72, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    y -= 18;

    page.drawText('TOTAL', { x: width - 240, y, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });
    page.drawText(`$${dollars(invoice.total_cents)}`, { x: width - 160, y, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });

    // Footer
    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: 72,
      y: 36,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5)
    });

    return await pdfDoc.save();
  }
}

export default BillingInvoicePdfService;

