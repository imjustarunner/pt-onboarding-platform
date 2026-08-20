import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCanonicalDistrict,
  mergeDistrictRows,
  districtNameMatchKeys
} from '../districtSlug.shared.js';

test('D11 aliases collapse to one public slug', () => {
  const a = resolveCanonicalDistrict('D11');
  const b = resolveCanonicalDistrict('District 11');
  const c = resolveCanonicalDistrict('colorado-springs-school-district-11');
  assert.equal(a.canonicalSlug, 'colorado-springs-school-district-11');
  assert.equal(b.canonicalSlug, a.canonicalSlug);
  assert.equal(c.canonicalSlug, a.canonicalSlug);
  assert.equal(a.canonicalName, 'Colorado Springs School District 11');
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
  const d11 = merged.find((d) => d.slug === 'colorado-springs-school-district-11');
  assert.ok(d11);
  assert.equal(d11.schoolCount, 25);
  assert.equal(merged.filter((d) => d.slug.includes('11') || d.slug === 'd11').length, 1);
});
