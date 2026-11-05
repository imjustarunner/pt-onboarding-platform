import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDemographicMergeRows,
  defaultUseIncoming,
  mergedDemographicsPayload
} from '../demographicFieldMerge.js';

test('both sides with a name keep the file until the checkbox switches', () => {
  assert.equal(defaultUseIncoming('Jane', 'Janet'), false);
  assert.equal(defaultUseIncoming('', 'Janet'), true);
  assert.equal(defaultUseIncoming('Jane', ''), false);
  const rows = buildDemographicMergeRows(
    { firstName: 'Jane', lastName: 'Doe' },
    { firstName: 'Janet', lastName: 'Doe' }
  );
  const first = rows.find((row) => row.key === 'firstName');
  const last = rows.find((row) => row.key === 'lastName');
  assert.equal(first.useIncoming, false);
  assert.equal(last.same, true);
  first.useIncoming = true;
  const payload = mergedDemographicsPayload(rows);
  assert.equal(payload.fullName, 'Janet Doe');
});

test('an empty file starts on the pasted value', () => {
  const rows = buildDemographicMergeRows(
    { firstName: '', contactPhone: '' },
    { firstName: 'Jordan', contactPhone: '(719) 555-0101' }
  );
  assert.equal(rows.every((row) => row.useIncoming), true);
  const payload = mergedDemographicsPayload(rows);
  assert.equal(payload.fullName, 'Jordan');
  assert.match(payload.contactPhone, /719/);
});
