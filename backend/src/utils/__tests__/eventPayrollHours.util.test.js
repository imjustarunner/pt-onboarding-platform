import test from 'node:test';
import assert from 'node:assert/strict';

import { computeEventDirectIndirectHours } from '../eventPayrollHours.util.js';

test('computeEventDirectIndirectHours splits 5h worked with 3h direct cap', () => {
  const clockInAt = new Date('2026-05-27T09:00:00.000Z');
  const clockOutAt = new Date('2026-05-27T14:00:00.000Z');
  const split = computeEventDirectIndirectHours({
    clockInAt,
    clockOutAt,
    directHoursCap: 3
  });
  assert.equal(split.workedHours, 5);
  assert.equal(split.directHours, 3);
  assert.equal(split.indirectHours, 2);
});

test('computeEventDirectIndirectHours uses only direct when worked below cap', () => {
  const clockInAt = new Date('2026-05-27T09:00:00.000Z');
  const clockOutAt = new Date('2026-05-27T11:00:00.000Z');
  const split = computeEventDirectIndirectHours({
    clockInAt,
    clockOutAt,
    directHoursCap: 3
  });
  assert.equal(split.workedHours, 2);
  assert.equal(split.directHours, 2);
  assert.equal(split.indirectHours, 0);
});

test('computeEventDirectIndirectHours uses only indirect when cap is zero', () => {
  const clockInAt = new Date('2026-05-27T09:00:00.000Z');
  const clockOutAt = new Date('2026-05-27T13:00:00.000Z');
  const split = computeEventDirectIndirectHours({
    clockInAt,
    clockOutAt,
    directHoursCap: 0
  });
  assert.equal(split.workedHours, 4);
  assert.equal(split.directHours, 0);
  assert.equal(split.indirectHours, 4);
});
