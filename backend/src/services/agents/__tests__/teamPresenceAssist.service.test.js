import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStatus, formatDurationApprox } from '../teamPresenceAssist.service.js';
const now = Date.parse('2026-09-28T12:00:00Z');
const time = delta => new Date(now - delta).toISOString();
test('stale away/timedown and extended sessions are not live presence', () => {
  for (const session_phase of ['away', 'timedown', 'active']) {
    assert.equal(computeStatus({ session_phase, last_heartbeat_at: time(40 * 86400000), session_extend_until: time(-3600000) }, now).status, 'offline');
  }
});
test('fresh active/idle heartbeat and explicit offline are respected', () => {
  assert.equal(computeStatus({ last_heartbeat_at: time(1000), last_activity_at: time(1000) }, now).status, 'online');
  assert.equal(computeStatus({ last_heartbeat_at: time(1000), session_phase: 'away' }, now).status, 'idle');
  assert.equal(computeStatus({ last_heartbeat_at: time(1000), session_phase: 'away', availability_level: 'offline' }, now).status, 'offline');
  assert.equal(computeStatus({ last_heartbeat_at: time(-1000) }, now).status, 'offline');
});

test('formatDurationApprox covers common idle windows', () => {
  assert.equal(formatDurationApprox(20_000), 'under a minute');
  assert.equal(formatDurationApprox(60_000), 'about 1 minute');
  assert.equal(formatDurationApprox(12 * 60_000), 'about 12 minutes');
  assert.equal(formatDurationApprox(90 * 60_000), 'about 2 hours');
  assert.equal(formatDurationApprox(null), null);
});
