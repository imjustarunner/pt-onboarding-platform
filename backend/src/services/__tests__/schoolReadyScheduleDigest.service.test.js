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

// Digest copy separates Ready to Schedule and Waitlist with provider/day + disclaimers
{
  const copy = buildDigestCopy({
    schoolName: 'Columbia',
    items: [
      {
        client_id: 1,
        client_initials: 'ABC',
        item_category: 'ready_to_schedule',
        assignment_summary: 'Jane Doe · Monday',
        cleared_from_waitlist: 1,
        marked_ready_at: '2026-08-18T16:00:00.000Z'
      },
      {
        client_id: 2,
        client_initials: 'DEF',
        item_category: 'waitlist',
        waitlist_reason: 'No clinician day',
        assignment_summary: 'Sam Lee · Tuesday',
        marked_ready_at: '2026-08-17T16:00:00.000Z'
      }
    ]
  });
  assert.equal(copy.subject, 'Columbia - Ready to Schedule & Waitlist');
  assert.match(copy.text, /ready for soft scheduling:/i);
  assert.match(copy.text, /on the waitlist:/i);
  assert.match(copy.text, /Jane Doe · Monday/);
  assert.match(copy.text, /Removed from the waitlist/);
  assert.match(copy.text, /Sam Lee · Tuesday/);
  assert.match(copy.text, /until a slot opens/i);
  assert.match(copy.text, /No clinician day/);
  assert.match(copy.text, /Moved to Ready for Schedule:/);
  assert.match(copy.text, /Moved to waitlist:/);
  assert.match(copy.text, /digest\/summary email sent three days a week/i);
  assert.match(copy.text, /soft scheduling in the app/i);
  assert.match(copy.text, /Thank you,\n\nSchool support team/);
  assert.match(copy.html, /font-size:11px/);
  assert.equal(copy.readyCount, 1);
  assert.equal(copy.waitlistCount, 1);
}

{
  const waitOnly = buildDigestCopy({
    schoolName: 'Columbia',
    items: [{ client_id: 3, client_initials: 'GHI', item_category: 'waitlist' }]
  });
  assert.equal(waitOnly.subject, 'Columbia - Waitlist');
  assert.doesNotMatch(waitOnly.text, /ready for soft scheduling:/i);
  // No provider/day → no slot-opens messaging
  assert.doesNotMatch(waitOnly.text, /until a slot opens/i);
}

console.log('schoolReadyScheduleDigest.service.test.js: ok');
