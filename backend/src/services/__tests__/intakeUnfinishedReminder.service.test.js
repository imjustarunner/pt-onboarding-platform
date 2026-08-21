import test from 'node:test';
import assert from 'node:assert/strict';
import {
  draftExpiryForConsent,
  hashDeletionToken,
  mintDeletionToken,
  REMINDER_AGREE_TTL_MS,
  REMINDER_DECLINE_TTL_MS,
  REMINDER_SLOTS
} from '../intakeUnfinishedReminder.service.js';

test('draftExpiryForConsent: agreed is 10 days', () => {
  const from = new Date('2026-08-21T12:00:00.000Z');
  const expires = draftExpiryForConsent('agreed', from);
  assert.equal(expires.getTime() - from.getTime(), REMINDER_AGREE_TTL_MS);
});

test('draftExpiryForConsent: declined is 12 hours', () => {
  const from = new Date('2026-08-21T12:00:00.000Z');
  const expires = draftExpiryForConsent('declined', from);
  assert.equal(expires.getTime() - from.getTime(), REMINDER_DECLINE_TTL_MS);
});

test('reminder slots have exact subjects', () => {
  assert.equal(REMINDER_SLOTS['24h'].subject, 'Reminder: Complete Your Enrollment Form');
  assert.equal(REMINDER_SLOTS['72h'].subject, 'Friendly Reminder: Complete Your Enrollment Form');
  assert.equal(REMINDER_SLOTS['7d'].subject, 'Final Reminder: Please Complete Your Enrollment Form');
});

test('deletion token hash is stable sha256 hex', () => {
  const { raw, hash } = mintDeletionToken();
  assert.equal(hash.length, 64);
  assert.equal(hashDeletionToken(raw), hash);
  assert.notEqual(hashDeletionToken('other'), hash);
});
