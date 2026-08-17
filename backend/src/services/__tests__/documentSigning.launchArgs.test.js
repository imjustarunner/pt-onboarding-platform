import test from 'node:test';
import assert from 'node:assert/strict';
import { puppeteerLaunchArgs } from '../documentSigning.service.js';

test('Chromium launch args avoid --single-process (Target.setDiscoverTargets crashes)', () => {
  const args = puppeteerLaunchArgs();
  assert.equal(args.includes('--single-process'), false);
  assert.equal(args.includes('--no-sandbox'), true);
  assert.equal(args.includes('--disable-dev-shm-usage'), true);
});
