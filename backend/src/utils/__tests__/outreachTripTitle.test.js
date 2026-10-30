import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { outreachTripTitle } from '../outreachHubPure.js';

describe('outreach trip titles', () => {
  it('corrects old generated counts after stops are added or removed', () => {
    assert.equal(outreachTripTitle('Outreach trip (4 stops)', 5), 'Outreach trip (5 stops)');
    assert.equal(outreachTripTitle('Outreach trip (5 stops)', 1), 'Outreach trip (1 stop)');
    assert.equal(outreachTripTitle('Outreach trip (1 stop)', 2), 'Outreach trip (2 stops)');
    assert.equal(outreachTripTitle(null, 3), 'Outreach trip (3 stops)');
  });
  it('preserves custom trip names, including names containing a count', () => {
    assert.equal(outreachTripTitle('Rachel — Denver schools', 5), 'Rachel — Denver schools');
    assert.equal(outreachTripTitle('North route (4 stops)', 5), 'North route (4 stops)');
  });
});
