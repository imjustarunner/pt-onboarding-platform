import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLifecycle, validateLifecycle, applyBusinessAgreement, agreementForMonth } from '../businessLifecyclePolicy.js';
import { createBusinessLifecycleAccess } from '../../middleware/businessLifecycleAccess.js';
const estimate = () => ({ totals: { baseFeeCents: 40000, totalCents: 50000 }, lineItems: [{ key: 'usage', label: 'Usage', extraCents: 10000 }] });
const agreement = () => ({ startMonth: '2026-09', endMonth: '', status: 'active', signedOn: '2026-09-01', contractReference: 'Contract-123', revenueBasis: 'Monthly collected revenue', revenueShareBps: 1000, thresholdCents: 0, mode: 'higher_of', services: [{ id: 'facilitation', name: 'Facilitation', amountCents: 30000, cadence: 'monthly', month: '' }, { id: 'setup', name: 'Company setup', amountCents: 20000, cadence: 'once', month: '2026-09' }] });
const state = (revenueCents = 0) => ({ ...emptyLifecycle(), agreements: [agreement()], revenue: [{ month: '2026-09', amountCents: revenueCents, confirmed: true, reference: 'Reconciled report' }] });
const quote = (s, month = '2026-09', options = {}) => applyBusinessAgreement(estimate(), validateLifecycle(s), month, options);
test('zero-revenue company pays app + selected services + one-time setup', () => {
  const result = quote(state());
  assert.equal(result.totals.totalCents, 100000);
  assert.equal(result.businessAgreement.floorCents, 80000);
  assert.equal(result.businessAgreement.breakEvenRevenueCents, 800000);
  assert.equal(result.chargeLines.reduce((n, l) => n + l.amountCents, 0), 100000);
});
test('at break-even, revenue share replaces app and recurring services without double charging', () => {
  const result = quote(state(800000));
  assert.equal(result.totals.totalCents, 100000);
  assert.equal(result.businessAgreement.basis, 'revenue_share');
  assert.equal(result.chargeLines.length, 2);
});
test('growing business pays contracted percentage plus one-time charges', () => {
  const s = state(1000000); s.agreements[0].revenueShareBps = 1250;
  assert.equal(quote(s).totals.totalCents, 145000);
});
test('one-time setup is not repeated in the following month', () => {
  const s = state(); s.revenue.push({ ...s.revenue[0], month: '2026-10' });
  assert.equal(quote(s, '2026-10').totals.totalCents, 80000);
});
test('unconfirmed or missing revenue cannot generate a percentage invoice, including zero', () => {
  for (const s of [state(), { ...state(), revenue: [] }]) {
    if (s.revenue[0]) s.revenue[0].confirmed = false;
    assert.equal(quote(s).businessAgreement.ready, false);
    assert.throws(() => quote(s, '2026-09', { requireRevenue: true }), e => e.status === 409);
  }
  assert.equal(quote(state(), '2026-09', { requireRevenue: true }).businessAgreement.ready, true);
});
test('each contractual transition method follows its own formula', () => {
  const s = state(600000); s.agreements[0].thresholdCents = 600000;
  s.agreements[0].mode = 'threshold'; assert.equal(quote(s).totals.totalCents, 80000);
  s.revenue[0].amountCents = 599999; assert.equal(quote(s).totals.totalCents, 100000);
  s.agreements[0].mode = 'additive'; assert.equal(quote(s).totals.totalCents, 160000);
  s.agreements[0].mode = 'a_la_carte'; s.revenue = []; assert.equal(quote(s, '2026-09', { requireRevenue: true }).totals.totalCents, 100000);
});
test('draft agreements do not change app invoices or supersede signed terms', () => {
  const s = state(); s.agreements[0].status = 'draft';
  const base = estimate(); assert.equal(applyBusinessAgreement(base, s, '2026-09'), base);
  s.agreements[0].status = 'active'; s.agreements.push({ ...agreement(), startMonth: '2026-10', status: 'draft', services: [] });
  assert.equal(agreementForMonth(s, '2026-10').startMonth, '2026-09');
});
test('future agreement versions preserve earlier monthly pricing', () => {
  const s = state(1000000); s.agreements.push({ ...agreement(), startMonth: '2026-10', revenueShareBps: 2000, services: [] }); s.revenue.push({ ...s.revenue[0], month: '2026-10' });
  assert.equal(quote(s).totals.totalCents, 120000);
  assert.equal(quote(s, '2026-10').totals.totalCents, 200000);
});
test('the final month bills normally; following months pause invoicing', () => {
  const s = state(); s.agreements[0].endMonth = '2026-09';
  assert.equal(quote(s).totals.totalCents, 100000);
  assert.equal(quote(s, '2026-10').totals.totalCents, 0);
  assert.throws(() => quote(s, '2026-10', { requireRevenue: true }), e => e.status === 409 && /ended/.test(e.message));
});
test('dual-axis feature charges appear once and reconcile to invoice total', () => {
  const base = estimate(); base.lineItems.push({ key: 'feature_a', label: 'Legacy feature', extraCents: 90000 });
  base.featureBilling = { tenantPortions: [{ featureKey: 'a', featureLabel: 'Training', chargeCents: 1234 }], userPortions: [{ featureKey: 'a', userName: 'Team member', chargeCents: 567 }] };
  base.totals.totalCents += 1801;
  const result = applyBusinessAgreement(base, state(), '2026-09');
  assert.equal(result.totals.totalCents, 101801);
  assert.equal(result.chargeLines.filter(l => l.key === 'feature_a').length, 2);
  base.totals.totalCents += 1;
  assert.throws(() => applyBusinessAgreement(base, state(), '2026-09'), e => e.status === 409);
});
test('rejects invalid money, ambiguous months, unsigned active terms, and unknown tasks', () => {
  const patches = [s => s.revenue[0].amountCents = -1, s => s.revenue[0].amountCents = 0.5, s => s.revenue[0].month = '2026-13', s => s.revenue[0].reference = '', s => s.agreements[0].revenueShareBps = 10001, s => s.agreements[0].signedOn = '2026-02-30', s => s.agreements[0].contractReference = '', s => s.agreements[0].services[0].amountCents = Infinity, s => s.stages.setup.completed = ['hidden'], s => s.stages.exit.completed = ['notice'], s => s.agreements.push(agreement())];
  for (const patch of patches) { const s = state(); patch(s); assert.throws(() => validateLifecycle(s), e => e.status === 400); }
});
test('business administrator access requires membership in the exact company', async () => {
  const access = createBusinessLifecycleAccess(async () => [{ id: 7 }]);
  for (const [role, agencyId, allowed] of [['admin', 7, true], ['admin', 8, false], ['support', 7, false], ['staff', 7, false], ['super_admin', 8, true]]) {
    let called = false, status;
    const res = { status(s) { status = s; return this; }, json() {} };
    await access({ user: { id: 1, role }, params: { agencyId } }, res, () => { called = true; });
    assert.equal(called, allowed); if (!allowed) assert.equal(status, 403);
  }
});
