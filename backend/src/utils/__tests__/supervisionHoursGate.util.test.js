import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sessionHoursAreCountable,
  isSupervisionPayEligibleHours
} from '../supervisionHoursGate.util.js';

test('sessionHoursAreCountable requires effective start date', () => {
  assert.equal(sessionHoursAreCountable({
    sessionDateYmd: '2026-07-01',
    effectiveStartDate: null
  }), false);
});

test('sessionHoursAreCountable excludes sessions before effective date', () => {
  assert.equal(sessionHoursAreCountable({
    sessionDateYmd: '2026-06-30',
    effectiveStartDate: '2026-07-01'
  }), false);
});

test('sessionHoursAreCountable includes sessions on/after effective date', () => {
  assert.equal(sessionHoursAreCountable({
    sessionDateYmd: '2026-07-01',
    effectiveStartDate: '2026-07-01'
  }), true);
  assert.equal(sessionHoursAreCountable({
    sessionDateYmd: '2026-08-15',
    effectiveStartDate: '2026-07-01'
  }), true);
});

test('isSupervisionPayEligibleHours requires 50 individual and 100 total', () => {
  assert.equal(isSupervisionPayEligibleHours({ individualHours: 49, groupHours: 60 }), false);
  assert.equal(isSupervisionPayEligibleHours({ individualHours: 50, groupHours: 49 }), false);
  assert.equal(isSupervisionPayEligibleHours({ individualHours: 50, groupHours: 50 }), true);
  assert.equal(isSupervisionPayEligibleHours({ individualHours: 100, groupHours: 0 }), true);
});
