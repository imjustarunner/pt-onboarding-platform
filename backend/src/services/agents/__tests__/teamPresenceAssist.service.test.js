import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDurationApprox } from '../teamPresenceAssist.service.js';

test('formatDurationApprox covers common idle windows', () => {
  assert.equal(formatDurationApprox(20_000), 'under a minute');
  assert.equal(formatDurationApprox(60_000), 'about 1 minute');
  assert.equal(formatDurationApprox(12 * 60_000), 'about 12 minutes');
  assert.equal(formatDurationApprox(90 * 60_000), 'about 2 hours');
  assert.equal(formatDurationApprox(null), null);
});
