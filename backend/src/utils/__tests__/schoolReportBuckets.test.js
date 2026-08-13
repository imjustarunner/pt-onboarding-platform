import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAssignmentBucket,
  displayServiceDay,
  isRealServiceDay,
  sqlRealWeekdayPredicate
} from '../schoolReportBuckets.js';

describe('classifyAssignmentBucket', () => {
  it('splits provider + day, provider without day, and unassigned', () => {
    assert.equal(classifyAssignmentBucket({ hasProvider: true, hasDay: true }), 'provider_and_day');
    assert.equal(classifyAssignmentBucket({ hasProvider: true, hasDay: false }), 'provider_no_day');
    assert.equal(classifyAssignmentBucket({ hasProvider: false, hasDay: false }), 'no_provider');
  });
});

describe('isRealServiceDay', () => {
  it('treats Unknown and blanks as no day', () => {
    assert.equal(isRealServiceDay(null), false);
    assert.equal(isRealServiceDay(''), false);
    assert.equal(isRealServiceDay('Unknown'), false);
    assert.equal(isRealServiceDay('Friday'), true);
    assert.equal(isRealServiceDay('Monday, Wednesday'), true);
  });
});

describe('displayServiceDay', () => {
  it('prefers assignment weekdays when clients.service_day is empty', () => {
    assert.equal(displayServiceDay({ service_day: null, provider_day_pairs: '515:|515:Wednesday' }), 'Wednesday');
    assert.equal(displayServiceDay({ service_day: 'Unknown', provider_day_pairs: '488:' }), null);
  });
});

describe('sqlRealWeekdayPredicate', () => {
  it('rejects Unknown in SQL', () => {
    const sql = sqlRealWeekdayPredicate('cpa.service_day');
    assert.match(sql, /unknown/);
    assert.match(sql, /Monday/);
  });
});
