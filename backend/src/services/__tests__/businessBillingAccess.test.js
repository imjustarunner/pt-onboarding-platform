import test from 'node:test';
import assert from 'node:assert/strict';

// Disable connection probes before importing the application controllers. Every
// database/provider boundary used below is mocked; no live account is contacted.
process.env.SKIP_DB_CONNECT = '1';
process.env.NODE_ENV = 'test';
const { default: pool } = await import('../../config/database.js');
const { default: Invoice } = await import('../../models/AgencyBillingInvoice.model.js');
const { default: Payments } = await import('../agencyBillingPayment.service.js');
const { default: InvoiceService } = await import('../billingInvoice.service.js');
const { default: Usage } = await import('../billingUsage.service.js');
const { default: User } = await import('../../models/User.model.js');
const { getAgencyBillingEstimate } = await import('../../controllers/billing.controller.js');
const { listAgencyInvoices, generateAgencyInvoice, downloadInvoicePdf } = await import('../../controllers/billingInvoices.controller.js');
const response = () => ({ code: 200, body: null, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } });
const request = role => ({ user: { id: 9, role }, params: { agencyId: '1', invoiceId: '2' }, query: {} });
const invoice = { id: 2, agency_id: 1, line_items_json: { businessAgreement: { revenueCents: 1000000, contractReference: 'Private agreement' } } };
test('ordinary company members cannot retrieve management revenue or generate its invoice', async t => {
  t.mock.method(pool, 'execute', async () => [[{ state_json: { agreements: [{ status: 'active' }], revenue: [] } }]]);
  const usage = t.mock.method(Usage, 'getUsage', async () => { throw new Error('Should not calculate private usage'); });
  const generator = t.mock.method(InvoiceService, 'generateForAgency', async () => invoice);
  for (const role of ['staff', 'support', 'provider', 'guardian']) {
    const estimate = response(); await getAgencyBillingEstimate(request(role), estimate, e => { throw e; }); assert.equal(estimate.code, 403);
    const generated = response(); await generateAgencyInvoice(request(role), generated, e => { throw e; }); assert.equal(generated.code, 403);
  }
  assert.equal(usage.mock.callCount(), 0); assert.equal(generator.mock.callCount(), 0);
});
test('management invoice history and PDFs require company administrator access', async t => {
  t.mock.method(Invoice, 'listByAgency', async () => [invoice]); t.mock.method(Invoice, 'findById', async () => invoice);
  const reconcile = t.mock.method(Payments, 'reconcilePendingPayments', async () => []);
  t.mock.method(User, 'getAgencies', async () => [{ id: 1 }]);
  const list = response(); await listAgencyInvoices(request('staff'), list, e => { throw e; }); assert.equal(list.code, 403); assert.equal(reconcile.mock.callCount(), 0);
  const pdf = response(); await downloadInvoicePdf(request('staff'), pdf, e => { throw e; }); assert.equal(pdf.code, 403);
  const allowed = response(); await listAgencyInvoices(request('admin'), allowed, e => { throw e; }); assert.equal(allowed.code, 200); assert.equal(allowed.body[0].id, 2);
  t.mock.method(User, 'getAgencies', async () => [{ id: 3 }]);
  const otherCompany = response(); await downloadInvoicePdf(request('admin'), otherCompany, e => { throw e; }); assert.equal(otherCompany.code, 403);
});
test('the admin invoice endpoint uses the existing billing service', async t => {
  const generate = t.mock.method(InvoiceService, 'generateForAgency', async () => invoice);
  const res = response(); await generateAgencyInvoice(request('admin'), res, e => { throw e; });
  assert.equal(res.code, 201); assert.equal(res.body.id, 2); assert.equal(generate.mock.callCount(), 1);
});
