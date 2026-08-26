import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeViewedRate,
  deriveLifecycleStatus,
  parsePriority,
  parsePublishStatus
} from '../agencyAnnouncementHub.service.js';

test('parsePublishStatus and parsePriority', () => {
  assert.equal(parsePublishStatus('draft'), 'draft');
  assert.equal(parsePublishStatus(''), 'published');
  assert.equal(parsePriority('HIGH'), 'high');
  assert.equal(parsePriority(''), 'medium');
});

test('computeViewedRate uses opens over impressions', () => {
  assert.equal(computeViewedRate(0, 0), 0);
  assert.equal(computeViewedRate(16, 16), 100);
  assert.equal(computeViewedRate(16, 8), 50);
  assert.equal(computeViewedRate(10, 0), 0);
});

test('deriveLifecycleStatus from window', () => {
  const now = new Date('2026-05-15T12:00:00.000Z');
  assert.equal(deriveLifecycleStatus({
    publishStatus: 'draft',
    startsAt: '2026-05-01T00:00:00.000Z',
    endsAt: '2026-05-20T00:00:00.000Z',
    now
  }), 'draft');
  assert.equal(deriveLifecycleStatus({
    publishStatus: 'published',
    startsAt: '2026-05-20T00:00:00.000Z',
    endsAt: '2026-05-25T00:00:00.000Z',
    now
  }), 'scheduled');
  assert.equal(deriveLifecycleStatus({
    publishStatus: 'published',
    startsAt: '2026-05-01T00:00:00.000Z',
    endsAt: '2026-05-20T00:00:00.000Z',
    now
  }), 'active');
  assert.equal(deriveLifecycleStatus({
    publishStatus: 'published',
    startsAt: '2026-04-01T00:00:00.000Z',
    endsAt: '2026-04-10T00:00:00.000Z',
    now
  }), 'expired');
});
