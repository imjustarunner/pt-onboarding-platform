import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFParse } from 'pdf-parse';
import BillingInvoicePdfService from '../billingInvoicePdf.service.js';
import { emptyLifecycle, applyBusinessAgreement } from '../businessLifecyclePolicy.js';

test('management invoice PDF prints the selected billing basis without duplicate app charges', async () => {
  const base = { totals: { baseFeeCents: 50000, totalCents: 50000 }, lineItems: [] };
  const state = { ...emptyLifecycle(), agreements: [{ status: 'active', startMonth: '2026-09', endMonth: '', mode: 'higher_of', revenueShareBps: 1000, contractReference: 'Agreement-ABC', signedOn: '2026-09-01', revenueBasis: 'Collections', services: [{ id: 'launch', name: 'Launch training', cadence: 'once', month: '2026-09', amountCents: 20000 }] }], revenue: [{ month: '2026-09', amountCents: 1000000, confirmed: true, reference: 'Reconciliation-1' }] };
  const estimate = applyBusinessAgreement(base, state, '2026-09');
  const bytes = await BillingInvoicePdfService.generateInvoicePdf({ agencyName: 'Synthetic Company', invoice: { period_start: '2026-09-01', period_end: '2026-09-30', base_fee_cents: 50000, total_cents: estimate.totals.totalCents, line_items_json: estimate } });
  const parser = new PDFParse({ data: bytes });
  try {
    const { text } = await parser.getText();
    assert.match(text, /PlotTwistCo Invoice/); assert.match(text, /10% revenue share/);
    assert.match(text, /Launch training/); assert.match(text, /1200\.00/); assert.match(text, /Agreement-ABC/);
    assert.doesNotMatch(text, /Platform Base Fee|500\.00/);
  } finally { await parser.destroy(); }
});
