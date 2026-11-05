import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolStaffCanSeeCollaborationItem } from '../schoolStaffCollaborationWindow.js';

const access = { granted_at: '2026-10-01T15:00:00Z', revoked_at: null };

test('hides comments and tickets from before that staff member had ROI', () => {
  assert.equal(schoolStaffCanSeeCollaborationItem('2026-09-30T12:00:00Z', access), false);
  assert.equal(schoolStaffCanSeeCollaborationItem('2026-10-02T12:00:00Z', access), true);
});

test('hides comments and tickets from after ROI was revoked', () => {
  const closed = { granted_at: '2026-10-01T15:00:00Z', revoked_at: '2026-10-15T15:00:00Z' };
  assert.equal(schoolStaffCanSeeCollaborationItem('2026-10-10T12:00:00Z', closed), true);
  assert.equal(schoolStaffCanSeeCollaborationItem('2026-10-16T12:00:00Z', closed), false);
});

test('hides the record when this staff member was never granted ROI', () => {
  assert.equal(schoolStaffCanSeeCollaborationItem('2026-10-02T12:00:00Z', null), false);
  assert.equal(schoolStaffCanSeeCollaborationItem('2026-10-02T12:00:00Z', { granted_at: null }), false);
});
