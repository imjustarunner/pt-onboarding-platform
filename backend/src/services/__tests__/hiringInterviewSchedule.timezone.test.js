import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInterviewStart } from '../hiringInterviewSchedule.service.js';

test('wall-clock startsAt stays 1pm in the selected timezone', () => {
  const parsed = parseInterviewStart('2026-08-19T13:00', 'America/Chicago');
  assert.ok(parsed);
  assert.equal(parsed.wallStart, '2026-08-19T13:00:00');
  const parts = parsed.startDate.toISOString();
  // 1pm CDT is 18:00 UTC
  assert.equal(parts.slice(0, 16), '2026-08-19T18:00');
});

test('ISO instants are converted to wall clock instead of stripping Z', () => {
  // 1pm CDT stored as UTC, then scheduled with America/Chicago
  const parsed = parseInterviewStart('2026-08-19T18:00:00.000Z', 'America/Chicago');
  assert.ok(parsed);
  assert.equal(parsed.wallStart, '2026-08-19T13:00:00');
});
