import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIncompleteOnboardingDigestWindow,
  isIncompleteOnboardingDigestSendSlot
} from '../schoolOnboardingIncompleteDigest.service.js';

test('incomplete onboarding digest send slot is Mon/Wed/Fri 10:00–10:14 Denver', () => {
  // 2026-09-14 is a Monday; construct UTC that is 10:05 America/Denver (MDT = UTC-6)
  const monSlot = new Date('2026-09-14T16:05:00.000Z');
  assert.equal(isIncompleteOnboardingDigestSendSlot(monSlot), true);

  const monBefore = new Date('2026-09-14T15:59:00.000Z');
  assert.equal(isIncompleteOnboardingDigestSendSlot(monBefore), false);

  const tue = new Date('2026-09-15T16:05:00.000Z');
  assert.equal(isIncompleteOnboardingDigestSendSlot(tue), false);
});

test('incomplete onboarding digest window keys use mon/wed/fri labels', () => {
  const beforeMondaySend = new Date('2026-09-14T15:00:00.000Z');
  const window = getIncompleteOnboardingDigestWindow(beforeMondaySend);
  assert.match(window.windowKey, /_mon$/);
  assert.equal(window.sendLabel, 'Monday');
});
