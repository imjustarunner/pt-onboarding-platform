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
test('unsigned management proposal PDF clearly identifies its collection hold and discount', async () => {
  const bytes = await BillingInvoicePdfService.generateInvoicePdf({ agencyName:'Synthetic Coaching', invoice:{period_start:'2026-11-01',period_end:'2026-11-30',total_cents:30000,line_items_json:{chargeLines:[{label:'Full management package',amountCents:37500},{label:'Managed-company discount (20%)',amountCents:-7500}],businessAgreement:{requiresSignatures:true,ready:false,signedOn:'',contractReference:'Draft-ABC'}}} });
  const parser = new PDFParse({data:bytes});
  try { const {text}=await parser.getText(); assert.match(text,/REVIEW DRAFT/); assert.match(text,/not ready for collection/); assert.match(text,/discount \(20%\)/); assert.match(text,/-75\.00/); assert.match(text,/300\.00/); }
  finally {await parser.destroy();}
});
