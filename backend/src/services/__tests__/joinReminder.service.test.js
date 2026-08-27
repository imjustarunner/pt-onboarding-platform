import test from 'node:test';
import assert from 'node:assert/strict';
import { joinReminderWindowSql } from '../joinReminder.service.js';

test('joinReminderWindowSql uses UTC so noon Mountain session matches 11:55 AM Mountain tick', () => {
  // Noon MDT (UTC-6) = 18:00 UTC stored in supervision_sessions.start_at
  const sessionStartUtc = '2026-08-26 18:00:00';
  // 11:55 AM MDT = 17:55 UTC
  const now = new Date('2026-08-26T17:55:00.000Z');
  const { startSql, endSql } = joinReminderWindowSql({ now });
  assert.equal(startSql, '2026-08-26 18:00:00');
  assert.equal(endSql, '2026-08-26 18:03:00');
  assert.ok(sessionStartUtc >= startSql && sessionStartUtc < endSql);
});

test('joinReminderWindowSql does not match noon Mountain session at 5:55 PM Mountain tick', () => {
  const sessionStartUtc = '2026-08-26 18:00:00';
  // 5:55 PM MDT = 23:55 UTC
  const now = new Date('2026-08-26T23:55:00.000Z');
  const { startSql, endSql } = joinReminderWindowSql({ now });
  assert.ok(sessionStartUtc < startSql || sessionStartUtc >= endSql);
});
