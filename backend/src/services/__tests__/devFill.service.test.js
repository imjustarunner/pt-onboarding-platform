import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDevFillRequested,
  canUseDevFill
} from '../devFill.service.js';

describe('devFill.service', () => {
  it('isDevFillRequested detects payload flags', () => {
    assert.equal(isDevFillRequested({ createdViaDevFill: true }), true);
    assert.equal(isDevFillRequested({ devFillUsed: true }), true);
    assert.equal(isDevFillRequested({ created_via_dev_fill: 1 }), true);
    assert.equal(isDevFillRequested({}), false);
  });

  it('canUseDevFill allows super_admin without agency check', async () => {
    const ok = await canUseDevFill({ id: 1, role: 'super_admin' }, 99);
    assert.equal(ok, true);
  });

  it('canUseDevFill denies provider role', async () => {
    assert.equal(await canUseDevFill({ id: 3, role: 'provider', agencies: [{ id: 42 }] }, 42), false);
  });
});
