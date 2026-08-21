import assert from 'node:assert/strict';
import {
  getReadyScheduleDigestWindow,
  isReadyScheduleDigestSendSlot,
  buildDigestCopy
} from '../schoolReadyScheduleDigest.service.js';

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

// Digest copy separates Ready to Schedule and Waitlist
{
  const copy = buildDigestCopy({
    schoolName: 'Columbia',
    items: [
      { client_id: 1, client_initials: 'ABC', item_category: 'ready_to_schedule' },
      { client_id: 2, client_initials: 'DEF', item_category: 'waitlist', waitlist_reason: 'No clinician day' }
    ]
  });
  assert.equal(copy.subject, 'Columbia - Ready to Schedule & Waitlist');
  assert.match(copy.text, /ready to schedule:/i);
  assert.match(copy.text, /on the waitlist:/i);
  assert.match(copy.text, /No clinician day/);
  assert.match(copy.text, /Thank you,\n\nSchool support team/);
  assert.equal(copy.readyCount, 1);
  assert.equal(copy.waitlistCount, 1);
}

{
  const waitOnly = buildDigestCopy({
    schoolName: 'Columbia',
    items: [{ client_id: 3, client_initials: 'GHI', item_category: 'waitlist' }]
  });
  assert.equal(waitOnly.subject, 'Columbia - Waitlist');
  assert.doesNotMatch(waitOnly.text, /ready to schedule:/i);
}

console.log('schoolReadyScheduleDigest.service.test.js: ok');
