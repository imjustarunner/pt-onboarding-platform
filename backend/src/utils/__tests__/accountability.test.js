import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { validateSettings, validateReport, reportTotals } from '../accountability.js';
import { createAccountabilityPdf } from '../../services/accountabilityPdf.service.js';

const settings = { recipient: 'melissa@plottwistco.com', officeAddress: 'Approved office', policy: 'Configured plan wording', attestation: 'These expenses have not been reimbursed.', mileageRate: 0.7, categories: [{ key: 'utilities', label: 'Utilities', percent: 20 }] };
const data = { expenses: [{ id: 'e1', category: 'utilities', date: '2026-09-01', vendor: 'Power company', amount: 123.45, notes: '' }], mileage: [{ id: 'm1', date: '2026-09-02', start: 'Office', end: 'School', purpose: 'Meeting', miles: 12.5, notes: '' }] };
test('unfinished worksheet rows can be saved and printed, but cannot be submitted', async () => {
  const incomplete = { expenses: [{ id: 'e', category: 'utilities', date: '', vendor: '', amount: '', notes: '' }], mileage: [{ id: 'm', date: '', start: '', end: '', purpose: '', miles: '', notes: '' }] };
  const draft = validateReport(incomplete, '2026-09', settings);
  assert.equal(draft.expenses[0].amount, null);
  assert.equal(draft.mileage[0].miles, null);
  const bytes = await createAccountabilityPdf({ snapshot: { settings, data: draft, agencyName: 'ITSCO', userName: 'Participant', month: '2026-09' } });
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.throws(() => validateReport(draft, '2026-09', settings, { final: true }));
});
test('calculates allocated cents and mileage without charging the full household bill', () => {
  assert.deepEqual(reportTotals(validateReport(data, '2026-09', settings), settings), { expenseCents: 2469, miles: 12.5, mileageCents: 875, totalCents: 3344 });
});
test('requires a receipt for every expense before signing, but permits a draft', () => {
  assert.doesNotThrow(() => validateReport(data, '2026-09', settings));
  assert.throws(() => validateReport(data, '2026-09', settings, { final: true }), /receipt/);
  assert.doesNotThrow(() => validateReport(data, '2026-09', settings, { final: true, receipts: [{ expense_id: 'e1' }] }));
});
test('rejects wrong months, invalid dates, negative miles, duplicate entry ids, and unconfigured categories', () => {
  for (const patch of [{ date: '2026-08-01' }, { date: '2026-09-31' }, { date: '2026-09-99' }, { amount: -1 }, { amount: 1.001 }, { category: 'unknown' }, { id: 'm1' }]) {
    assert.throws(() => validateReport({ ...data, expenses: [{ ...data.expenses[0], ...patch }] }, '2026-09', settings), error => error.status === 400);
  }
  assert.throws(() => validateReport({ expenses: [], mileage: [{ ...data.mileage[0], miles: -4 }] }, '2026-09', settings));
  assert.throws(() => validateReport({ expenses: [], mileage: [] }, '2026-09', settings, { final: true }));
});
test('settings require explicit parameters, one email address, and allocations within bounds', () => {
  assert.deepEqual(validateSettings(settings), settings);
  for (const patch of [{ recipient: 'one@example.com,two@example.com' }, { policy: '' }, { officeAddress: '' }, { mileageRate: '' }, { categories: [{ ...settings.categories[0], percent: 101 }] }, { categories: [...settings.categories, ...settings.categories] }]) assert.throws(() => validateSettings({ ...settings, ...patch }));
});
test('generates a signed multi-page PDF and appends a PDF receipt', async () => {
  const receipt = await PDFDocument.create(); receipt.addPage();
  // Valid 1x1 PNG to exercise signature embedding independently of canvas.
  const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const bytes = await createAccountabilityPdf({ snapshot: { settings: { ...settings, policy: 'Long parameters '.repeat(1000) }, data, agencyName: 'ITSCO', userName: 'Test Participant', month: '2026-09', signedAt: '2026-09-28T12:00:00Z', reportId: 5, userId: 6 }, signature, receipts: [{ expense_id: 'e1', original_name: 'power.pdf', mime_type: 'application/pdf', bytes: Buffer.from(await receipt.save()) }] });
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 4);
});
