import assert from 'node:assert/strict';
import {
  getReadyScheduleDigestWindow,
  isReadyScheduleDigestSendSlot
} from '../schoolReadyScheduleDigest.service.js';

function denverDate({ y, m, d, h = 12, min = 0 }) {
  // Construct an instant that is that Denver wall time via Intl offset probe
  const guess = new Date(Date.UTC(y, m - 1, d, h + 6, min)); // MT ≈ UTC-6/7
  return guess;
}

// Wednesday before 10am → Wednesday window
{
  const now = new Date('2026-08-19T15:00:00.000Z'); // ~09:00 MT
  const w = getReadyScheduleDigestWindow(now);
  assert.match(w.windowKey, /_wed$/);
  assert.equal(w.sendLabel, 'Wednesday');
}

// Wednesday after 10am → Friday window
{
  const now = new Date('2026-08-19T17:30:00.000Z'); // ~11:30 MT
  const w = getReadyScheduleDigestWindow(now);
  assert.match(w.windowKey, /_fri$/);
  assert.equal(w.sendLabel, 'Friday');
}

// Send slot detection
{
  const inSlot = new Date('2026-08-19T16:05:00.000Z'); // Wed ~10:05 MT
  assert.equal(isReadyScheduleDigestSendSlot(inSlot), true);
  const outSlot = new Date('2026-08-19T18:00:00.000Z');
  assert.equal(isReadyScheduleDigestSendSlot(outSlot), false);
}

console.log('schoolReadyScheduleDigest.service.test.js: ok');
