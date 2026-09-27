import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNoteAidLocationChoices } from '../noteAidLocations.service.js';
const offices = [{ id: 1, name: 'Assigned office', street_address: '100 Test St', city: 'Test City', state: 'CO', postal_code: '80000' }, { id: 2, name: 'Other office' }];
const locations = [
  { id: 10, name: 'Office', place_of_service: '11', billing_office_location_id: 1 },
  { id: 11, name: 'Office duplicate', place_of_service: '11', billing_office_location_id: 1 },
  { id: 12, name: 'Telehealth home', place_of_service: '10', billing_office_location_id: 1 },
  { id: 13, name: 'Telehealth — patient home', place_of_service: '10' },
  { id: 14, name: 'Office', place_of_service: '11', billing_office_location_id: 2 },
  { id: 15, name: 'Hidden', place_of_service: '03', is_provider_visible: 0 },
  { id: 16, name: 'Office', place_of_service: '11' }
];
test('uses assigned tenant offices, deduplicates POS templates, and retains billing identity', () => {
  const choices = buildNoteAidLocationChoices({ locations, offices, officeIds: [1, 99] });
  assert.equal(choices.length, 2);
  assert.match(choices[0].label, /Assigned office.*POS 11.*100 Test St/);
  assert.equal(choices[0].serviceLocationId, 10);
  assert.equal(choices[0].billingOfficeLocationId, 1);
  assert.equal(choices[1].address, '');
  assert.match(choices[1].detail, /Billing office: Assigned office — 100 Test St/);
});
test('does not expose all offices when the provider has none assigned', () => {
  const choices = buildNoteAidLocationChoices({ locations, offices, officeIds: [] });
  assert.deepEqual(choices.map(c => c.serviceLocationId), [13]);
});
test('does not collapse two assigned offices into one generic Office and flags missing addresses', () => {
  const choices = buildNoteAidLocationChoices({ locations: [], offices, officeIds: [1, 2] });
  assert.equal(choices.length, 2);
  assert.equal(choices[1].detail, 'Address not configured for this location.');
  assert.notEqual(choices[0].value, choices[1].value);
});
