import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAssignmentBucket } from '../../utils/schoolReportBuckets.js';

describe('classifyAssignmentBucket', () => {
  it('splits provider + day, provider without day, and unassigned', () => {
    assert.equal(classifyAssignmentBucket({ hasProvider: true, hasDay: true }), 'provider_and_day');
    assert.equal(classifyAssignmentBucket({ hasProvider: true, hasDay: false }), 'provider_no_day');
    assert.equal(classifyAssignmentBucket({ hasProvider: false, hasDay: false }), 'no_provider');
  });
});
