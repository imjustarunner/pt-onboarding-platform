import test, { after } from 'node:test';
import pool from '../../config/database.js';
after(() => pool.end());
import assert from 'node:assert/strict';
import { pickLivingDisclosureParties, buildSmartDisclosureHtml, buildSmartDisclosureContext, normalizeSmartDisclosureResponse } from '../smartDisclosure.service.js';

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

test('renders branded school disclosure with distinct school and city providers', () => {
  const html = buildSmartDisclosureHtml({
    disclosureContext: {
      school: { name: 'Example Middle School', city: 'Colorado Springs' },
      businessEntity: { name: 'Example Agency' },
      providers: [
        { fullName: 'School Clinician', category: 'PRE_LICENSED', schoolAssigned: true, licenseNumber: 'SWC.0001234',
          supervisors: [{ fullName: 'Clinical Supervisor', type: 'Clinical', credential: 'LCSW' }] },
        { fullName: 'Other Clinician', category: 'FULLY_LICENSED', schoolAssigned: false }
      ]
    },
    logoDataUrl: 'data:image/png;base64,ZmFrZQ=='
  });
  assert.match(html, /<header class="brand">.*<img src="data:image\/png;base64,ZmFrZQ=="/);
  assert.match(html, /Assigned to this school[\s\S]*School Clinician[\s\S]*Other school providers · Colorado Springs[\s\S]*Other Clinician/);
  assert.match(html, /Clinical Supervisor, LCSW/);
  assert.doesNotMatch(html, /All current providers|None listed/);
});

test('the current signed edition keeps full provider and supervisor details from the server', () => {
  const supervisor = { fullName: 'Supervisor Example', type: 'Clinical', credential: 'LPC' };
  const response = normalizeSmartDisclosureResponse({
    disclosureContext: { contentHash: 'current-edition', providers: [
      { id: 5, fullName: 'Provider Example', schoolAssigned: true, supervisors: [supervisor] }
    ] },
    intakeData: { smartDisclosure: { contentHash: 'current-edition', providers: [
      { id: 5, fullName: 'Provider Example' }
    ] } }
  });
  assert.deepEqual(response.providers[0].supervisors, [supervisor]);
  assert.equal(response.providers[0].schoolAssigned, true);
});
