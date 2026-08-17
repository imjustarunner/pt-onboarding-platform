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
    assert.equal(canAutoPartnerDistrict('Poudre School District'), false);
    assert.equal(canAutoPartnerDistrict('Pueblo City Schools'), false);
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

describe('outreach school seed locations', () => {
  it('attaches a street address and coordinates to every directory school except flagged gaps', async () => {
    const { COLORADO_OUTREACH_SCHOOLS } = await import('../../data/coloradoOutreachSchools.js');
    assert.ok(COLORADO_OUTREACH_SCHOOLS.length > 349);
    const missing = COLORADO_OUTREACH_SCHOOLS.filter((s) => !s.address || !/\d/.test(s.address));
    assert.deepEqual(missing.map((s) => s.name), ['Pueblo West Elementary School']);
    const east = COLORADO_OUTREACH_SCHOOLS.find((s) => s.name === 'East High School' && s.city === 'Denver');
    assert.ok(east.address.toLowerCase().includes('city park esplanade'));
    const palmer = COLORADO_OUTREACH_SCHOOLS.find((s) => s.name === 'Palmer Elementary School');
    const swigert = COLORADO_OUTREACH_SCHOOLS.find((s) => s.name === 'Swigert International School');
    const montviewMs = COLORADO_OUTREACH_SCHOOLS.find((s) => s.name === 'DSST: Montview Middle School');
    assert.ok(palmer?.address);
    assert.ok(swigert?.address);
    assert.ok(montviewMs?.address);
    const manual = COLORADO_OUTREACH_SCHOOLS.find((s) => s.key === 'denver-public-schools-mcauliffe-manual-middle-school');
    assert.ok(manual);
    assert.ok(manual.aliases.some((a) => /manual middle/i.test(a)));
    const frontier = COLORADO_OUTREACH_SCHOOLS.find((s) => s.name === 'Aurora Frontier P-8');
    assert.ok(frontier.address.toLowerCase().includes('jericho'));
    const highlands = COLORADO_OUTREACH_SCHOOLS.find((s) => s.name === 'Aurora Highlands P-8');
    assert.ok(highlands.address.includes('42nd'));
    const gilpin = COLORADO_OUTREACH_SCHOOLS.find((s) => s.name === 'Denver Language School - Gilpin');
    assert.ok(gilpin.address.toLowerCase().includes('california'));
    const cec = COLORADO_OUTREACH_SCHOOLS.find((s) => s.name === 'CEC Early College');
    assert.ok(cec.address.toLowerCase().includes('eliot'));
    const csi = COLORADO_OUTREACH_SCHOOLS.filter((s) => s.district === 'Charter');
    assert.ok(csi.length >= 20);
  });
});

describe('trip round-trip mileage', () => {
  it('adds the return-home leg from the last stop to Windchime', async () => {
    const { tripOutboundMiles, tripReturnMiles, tripRoundTripMiles, WINDCHIME_ORIGIN, haversineMiles } =
      await import('../../utils/outreachHubPure.js');
    const stops = [
      { miles_from_prev: 10, lat: 39.7392, lng: -104.9903 },
      { miles_from_prev: 5, lat: 39.7646341, lng: -104.898693 }
    ];
    assert.equal(tripOutboundMiles(stops), 15);
    const home = haversineMiles(stops[1], WINDCHIME_ORIGIN);
    assert.equal(tripReturnMiles(stops), home);
    assert.equal(tripRoundTripMiles(stops), Math.round((15 + home) * 10) / 10);
  });
});
