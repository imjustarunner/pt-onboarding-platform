import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSegmentSeconds } from '../meetingAttendanceSegments.service.js';

test('live attendance counts actual in-room time before the scheduled start', () => {
  const event = {
    start_at: '2026-08-04 10:00:00',
    meeting_completed_at: null
  };
  const segments = [{
    started_at: '2026-08-04 09:00:00',
    ended_at: '2026-08-04 09:10:00'
  }];
  const asOf = new Date(2026, 7, 4, 9, 10, 0);

  assert.equal(computeSegmentSeconds(segments, event, { asOf }), 0);
  assert.equal(computeSegmentSeconds(segments, event, {
    asOf,
    clampToScheduledStart: false
  }), 600);
});
