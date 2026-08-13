import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOutreachName } from '../../data/coloradoOutreachSchools.js';
import {
  canAutoPartnerDistrict,
  haversineMiles,
  scoreNameMatch
} from '../../utils/outreachHubPure.js';

describe('outreach name matching', () => {
  it('normalizes elementary / MS suffixes', () => {
    assert.equal(normalizeOutreachName('Ashley Elementary School'), 'ashley');
    assert.equal(normalizeOutreachName('Bear Valley MS'), 'bear valley');
    assert.equal(normalizeOutreachName('Montbello HS'), 'montbello');
  });

  it('matches existing partner short names to directory schools', () => {
    assert.equal(scoreNameMatch('Ashley Elementary School', 'Ashley') >= 70, true);
    assert.equal(scoreNameMatch('Bear Valley International School', 'Bear Valley MS') >= 70, true);
    assert.equal(scoreNameMatch('Garden Place Elementary School', 'Gardenplace') >= 70, true);
    assert.equal(scoreNameMatch('Westerly Creek Elementary School', 'Westerly Creek') >= 70, true);
    assert.ok(scoreNameMatch('East High School', 'Unrelated Magnet') < 70);
  });
});

describe('outreach partnership and routing', () => {
  it('does not auto-partner Aurora schools', () => {
    assert.equal(canAutoPartnerDistrict('Aurora Public Schools'), false);
    assert.equal(canAutoPartnerDistrict('Denver Public Schools'), true);
  });

  it('ranks nearby points with haversine miles', () => {
    const windchime = { lat: 38.9246, lng: -104.8452 };
    const downtownCs = { lat: 38.8339, lng: -104.8214 };
    const denver = { lat: 39.7392, lng: -104.9903 };
    const toCs = haversineMiles(windchime, downtownCs);
    const toDenver = haversineMiles(windchime, denver);
    assert.ok(toCs != null && toCs < 20);
    assert.ok(toDenver != null && toDenver > toCs);
  });
});
