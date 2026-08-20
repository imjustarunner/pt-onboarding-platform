import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSchoolClientInitials, isValidSchoolClientInitials } from '../schoolClientInitials.js';

test('deriveSchoolClientInitials uses first 3 + last 3 letters uppercase', () => {
  assert.equal(deriveSchoolClientInitials('Harry Potter'), 'HARPOT');
  assert.equal(deriveSchoolClientInitials('Hermione Granger'), 'HERGRA');
  assert.equal(deriveSchoolClientInitials('Justin Finch-Fletchley'), 'JUSFIN');
  assert.equal(deriveSchoolClientInitials('Fake2 Fakerson'), 'FAKFAK');
});

test('isValidSchoolClientInitials requires six letters (case-insensitive)', () => {
  assert.equal(isValidSchoolClientInitials('HARPOT'), true);
  assert.equal(isValidSchoolClientInitials('FakFak'), true);
  assert.equal(isValidSchoolClientInitials('HP'), false);
  assert.equal(isValidSchoolClientInitials('JohDo'), false);
  assert.equal(isValidSchoolClientInitials('ABCDEFG'), false);
});
