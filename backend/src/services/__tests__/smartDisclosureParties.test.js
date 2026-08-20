import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLivingDisclosureParties } from '../smartDisclosure.service.js';

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
