import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOutreachName } from '../../data/coloradoOutreachSchools.js';
import {
  canAutoPartnerDistrict,
  haversineMiles,
  scoreNameMatch,
  schoolMapPoint,
  WINDCHIME_ORIGIN,
  isPlaceholderOutreachAddress,
  buildSchoolPlaceSearchQueries,
  scoreSchoolPlaceCandidate,
  pickBestSchoolPlaceCandidate,
  normalizePlaceSearchResult
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

  it('does not treat null DB coordinates as (0,0)', () => {
    const pt = schoolMapPoint({ name: 'Altura Elementary School', city: 'Aurora', lat: null, lng: null });
    assert.ok(pt);
    assert.notEqual(pt.lat, 0);
    assert.notEqual(pt.lng, 0);
    const miles = haversineMiles(WINDCHIME_ORIGIN, pt);
    assert.ok(miles != null && miles < 120);
    assert.ok(miles > 40);
  });
});

describe('outreach school address resolution helpers', () => {
  it('detects placeholder directory addresses', () => {
    assert.equal(
      isPlaceholderOutreachAddress({ name: 'East High School', city: 'Denver', address: 'East High School, Denver, CO' }),
      true
    );
    assert.equal(
      isPlaceholderOutreachAddress({
        name: 'East High School',
        city: 'Denver',
        address: '1600 City Park Esplanade, Denver, CO 80206, USA'
      }),
      false
    );
  });

  it('builds place search queries from school metadata', () => {
    const queries = buildSchoolPlaceSearchQueries({
      name: 'East High School',
      city: 'Denver',
      districtName: 'Denver Public Schools'
    });
    assert.ok(queries.includes('East High School, Denver, Colorado'));
    assert.ok(queries.some((q) => q.includes('Denver Public Schools')));
  });

  it('scores and picks a Colorado school place candidate', () => {
    const candidates = [
      {
        name: 'East High School',
        formatted_address: '1600 City Park Esplanade, Denver, CO 80206, USA',
        types: ['secondary_school', 'school']
      },
      {
        name: 'Random Business',
        formatted_address: '100 Main St, Denver, CO 80202, USA',
        types: ['establishment']
      }
    ];
    const best = pickBestSchoolPlaceCandidate('East High School', candidates);
    assert.equal(best?.name, 'East High School');
    assert.ok(scoreSchoolPlaceCandidate('East High School', best) >= 65);
  });

  it('normalizes Places API (New) result shape', () => {
    const normalized = normalizePlaceSearchResult({
      displayName: { text: 'East High School', languageCode: 'en' },
      formattedAddress: '1600 City Park Esplanade, Denver, CO 80206, USA',
      location: { latitude: 39.7402, longitude: -104.9503 },
      types: ['secondary_school', 'school']
    });
    assert.equal(normalized.name, 'East High School');
    assert.ok(normalized.formatted_address.includes('Denver'));
    assert.equal(normalized.geometry.location.lat, 39.7402);
    const best = pickBestSchoolPlaceCandidate('East High School', [{
      displayName: { text: 'East High School' },
      formattedAddress: '1600 City Park Esplanade, Denver, CO 80206, USA',
      location: { latitude: 39.7402, longitude: -104.9503 },
      types: ['secondary_school', 'school']
    }]);
    assert.equal(best?.name, 'East High School');
  });
});
