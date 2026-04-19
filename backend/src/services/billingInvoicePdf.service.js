import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function dollars(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function dateOnly(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

function actorLabel(p) {
  if (!p?.lastActorName) return null;
  const ts = p?.lastEffectiveAt ? dateOnly(p.lastEffectiveAt) : '';
  const action = p?.lastEventType || 'updated';
  return `last ${action} by ${p.lastActorName}${ts ? ' on ' + ts : ''}`;
}

class BillingInvoicePdfService {
  static async generateInvoicePdf({ agencyName, invoice }) {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]); // Letter
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

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

    const items = typeof invoice.line_items_json === 'string' ? JSON.parse(invoice.line_items_json) : invoice.line_items_json;
    const featureBilling = items?.featureBilling || null;

    const ensureSpace = (needed = 30) => {
      if (y < 80 + needed) {
        page = pdfDoc.addPage([612, 792]);
        y = page.getSize().height - 72;
      }
    };

    const drawRow = (desc, cents, { indent = 0, italic = false, color = rgb(0, 0, 0) } = {}) => {
      ensureSpace(16);
      const f = italic ? helveticaItalic : helvetica;
      page.drawText(desc, { x: 72 + indent, y, size: 10, font: f, color, maxWidth: width - 260 - indent });
      if (cents != null) {
        page.drawText(`$${dollars(cents)}`, { x: width - 160, y, size: 10, font: helvetica, color });
      }
      y -= 14;
    };

    drawRow('Platform Base Fee', invoice.base_fee_cents);

    const breakdown = items?.lineItems || [];
    for (const it of breakdown) {
      // Skip per-feature legacy lines when dual-axis featureBilling is present;
      // we render them in the structured block below.
      if (featureBilling && String(it?.key || '').startsWith('feature_')) continue;
      if (!it || !it.extraCents || it.extraCents <= 0) continue;
      drawRow(`${it.label} overage (${it.overage} @ $${dollars(it.unitCostCents)})`, it.extraCents);
    }

    if (featureBilling) {
      const days = featureBilling.daysInPeriod || 0;
      const tenantPortions = featureBilling.tenantPortions || [];
      const userPortions = featureBilling.userPortions || [];
      const featureKeys = Array.from(new Set([
        ...tenantPortions.map((p) => p.featureKey),
        ...userPortions.map((p) => p.featureKey)
      ]));

      if (featureKeys.length > 0) {
        ensureSpace(20);
        y -= 6;
        page.drawText('Feature Charges', { x: 72, y, size: 11, font: helveticaBold });
        y -= 14;
      }

      for (const fk of featureKeys) {
        const tp = tenantPortions.find((p) => p.featureKey === fk);
        const up = userPortions.filter((p) => p.featureKey === fk);
        const label = tp?.featureLabel || up[0]?.featureLabel || fk;
        ensureSpace(20);
        page.drawText(label, { x: 72, y, size: 10, font: helveticaBold });
        y -= 14;

        if (tp && (tp.chargeCents > 0 || tp.enabledDays > 0)) {
          const desc = `Tenant fee — ${tp.billableDays}/${days} days @ $${dollars(tp.unitMonthlyCents)}/mo`;
          drawRow(desc, tp.chargeCents, { indent: 12 });
          const audit = actorLabel(tp);
          if (audit) drawRow(audit, null, { indent: 12, italic: true, color: rgb(0.45, 0.45, 0.45) });
        }

        for (const u of up) {
          const desc = `${u.userName} — ${u.billableDays}/${days} days @ $${dollars(u.unitMonthlyCents)}/mo`;
          drawRow(desc, u.chargeCents, { indent: 12 });
          const audit = actorLabel(u);
          if (audit) drawRow(audit, null, { indent: 24, italic: true, color: rgb(0.45, 0.45, 0.45) });
        }
      }
    }

    ensureSpace(40);
    y -= 4;
    page.drawLine({ start: { x: 72, y }, end: { x: width - 72, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    y -= 18;

    page.drawText('TOTAL', { x: width - 240, y, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });
    page.drawText(`$${dollars(invoice.total_cents)}`, { x: width - 160, y, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });

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
