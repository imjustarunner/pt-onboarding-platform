import test, { after } from 'node:test';
import pool from '../../config/database.js';
after(() => pool.end());
import assert from 'node:assert/strict';
import { pickLivingDisclosureParties, buildSmartDisclosureHtml, buildSmartDisclosureContext } from '../smartDisclosure.service.js';

test('pickLivingDisclosureParties prefers live agency roster over signed snapshot', () => {
  const live = [{ id: 1, fullName: 'Live A' }, { id: 2, fullName: 'Live B' }];
  const signed = [{ id: 9, fullName: 'Signed Only' }];
  assert.deepEqual(pickLivingDisclosureParties(live, signed), live);
});

test('pickLivingDisclosureParties falls back to signed when live roster empty', () => {
  const signed = [{ id: 9, fullName: 'Signed Only' }];
  assert.deepEqual(pickLivingDisclosureParties([], signed), signed);
  assert.deepEqual(pickLivingDisclosureParties(null, signed), signed);
});

test('signed disclosure labels the same Denver instant as its audit certificate', () => {
  const html = buildSmartDisclosureHtml({ response: { acknowledged: true, signerName: 'QA Guardian' }, signedAt: '2026-11-07T23:48:57.000Z' });
  assert.match(html, /4:48:57 PM MST/);
  assert.doesNotMatch(html, /11:48:57 PM/);
});


test('fresh disclosure context uses neutral enrollment-signer wording and retains historical context wording', async () => {
  const context = await buildSmartDisclosureContext({ link: { form_type: 'smart_disclosure' } });
  assert.match(context.copy.introHtml, /signed by the person completing enrollment/);
  assert.doesNotMatch(context.copy.introHtml, /parent\/guardian[’']s/);
  const savedCopy = { ...context.copy, introHtml: '<p>Historical custom parent/guardian disclosure wording</p>' };
  const html = buildSmartDisclosureHtml({ disclosureContext: { ...context, copy: savedCopy }, response: { acknowledged: true, signerName: 'QA' } });
  assert.match(html, /Historical custom parent\/guardian disclosure wording/);
});
