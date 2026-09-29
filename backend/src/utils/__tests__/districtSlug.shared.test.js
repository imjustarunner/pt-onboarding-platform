import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCanonicalDistrict,
  mergeDistrictRows,
  districtNameMatchKeys,
  toStoredDistrictName,
  validateSchoolDistrictSelection
} from '../districtSlug.shared.js';

test('D11 aliases collapse to one public slug', () => {
  const a = resolveCanonicalDistrict('D11');
  const b = resolveCanonicalDistrict('District 11');
  const c = resolveCanonicalDistrict('colorado-springs-school-district-11');
  assert.equal(a.canonicalSlug, 'd11');
  assert.equal(b.canonicalSlug, a.canonicalSlug);
  assert.equal(c.canonicalSlug, a.canonicalSlug);
  assert.equal(a.canonicalName, 'D11');
});

test('district name aliases collapse for school matching', () => {
  const keys = districtNameMatchKeys('D11');
  assert.ok(keys.includes('district 11'));
  assert.ok(keys.includes('colorado springs school district 11'));
});

test('mergeDistrictRows combines D11 variants and sums school counts', () => {
  const merged = mergeDistrictRows([
    { id: 1, name: 'D11', slug: 'd11', schoolCount: 23 },
    { id: 8, name: 'Colorado Springs School District 11', slug: 'colorado-springs-school-district-11', schoolCount: 1 },
    { id: 7, name: 'District 11', slug: 'district-11', schoolCount: 1 }
  ]);
  const d11 = merged.find((d) => d.slug === 'd11');
  assert.ok(d11);
  assert.equal(d11.schoolCount, 25);
  assert.equal(merged.filter((d) => d.slug.includes('11') || d.slug === 'd11').length, 1);
});

test('school writes normalize Denver aliases and preserve genuinely different districts', () => {
  for (const input of ['Denver Public Schools', ' denver PUBLIC school ', 'denver-public-schools', 'DPS']) {
    assert.equal(toStoredDistrictName(input), 'DPS');
  }
  assert.equal(toStoredDistrictName('Colorado Springs School District 11'), 'D11');
  assert.equal(toStoredDistrictName('District 523'), 'District 523');
  for (const input of [null, undefined, '', '   ']) assert.equal(toStoredDistrictName(input), null);
});

test('school contacts cannot invent new districts through onboarding requests', () => {
  assert.equal(validateSchoolDistrictSelection('Denver Public Schools'), 'DPS');
  assert.equal(validateSchoolDistrictSelection('d13'), 'D13');
  assert.equal(validateSchoolDistrictSelection('other'), 'Other');
  assert.equal(validateSchoolDistrictSelection('District 523', 'District 523'), 'District 523');
  assert.equal(validateSchoolDistrictSelection(''), null);
  assert.throws(() => validateSchoolDistrictSelection('Denvar Public Schools', 'DPS'), { status: 400 });
  assert.throws(() => validateSchoolDistrictSelection('Brand new district'), { status: 400 });
});

test('Denver full name and DPS produce one district group with every school included', () => {
  const districts = mergeDistrictRows([
    { id: 1, name: 'DPS', slug: 'dps', schoolCount: 21 },
    { id: 2, name: 'Denver Public Schools', slug: 'denver-public-schools', schoolCount: 1 }
  ]);
  assert.equal(districts.length, 1);
  assert.equal(districts[0].name, 'DPS');
  assert.equal(districts[0].schoolCount, 22);
});
