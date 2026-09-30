import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesExchangeListing, ageRange, clientAge } from '../clientExchangeMatching.js';
const base = {
  user: { sees_clients: 1, provider_accepting_new_clients: 1, in_office_available: 1 },
  profile: { details: {}, insurances: ['Aetna'] },
  facets: { ageGroups: ['Children (6-10)'], specialties: ['Anxiety'] },
  listing: { demographics: { ageBand: '8-10' }, presentingProblems: ['anxiety'], preferences: { modality: 'in_person' } }
};
test('matches age, normalized specialties and in-person availability', () => {
  assert.equal(matchesExchangeListing(base), true);
  assert.equal(matchesExchangeListing({ ...base, facets: { ...base.facets, ageGroups: ['Adults (18+)'] } }), false);
  assert.equal(matchesExchangeListing({ ...base, facets: { ...base.facets, specialties: ['Depression'] } }), false);
});
test('virtual-only providers do not need the Office Available chat toggle', () => {
  const args = { ...base, user: { ...base.user, in_office_available: 0 }, profile: { details: { virtualEnabled: true } }, listing: { ...base.listing, preferences: { modality: 'virtual' } } };
  assert.equal(matchesExchangeListing(args), true);
  assert.equal(matchesExchangeListing({ ...args, listing: base.listing }), false);
});
test('agency-specific closed intake and does-not-see-clients exclude recipients', () => {
  for (const policy of [
    { seesClients: false, acceptingNewClients: true, inPerson: true },
    { seesClients: true, acceptingNewClients: false, inPerson: true },
    { seesClients: true, acceptingNewClients: true, inPerson: false, virtual: false }
  ]) assert.equal(matchesExchangeListing({ ...base, profile: { agencyAvailability: policy } }), false);
  assert.equal(matchesExchangeListing({ ...base, user: { ...base.user, provider_accepting_new_clients: 0 } }), false);
});
test('tenant-specific open virtual intake overrides global closed intake', () => {
  assert.equal(matchesExchangeListing({ ...base, user: { provider_accepting_new_clients: 0 }, profile: { agencyAvailability: { seesClients: true, acceptingNewClients: true, virtual: true } }, listing: { ...base.listing, preferences: { modality: 'either' } } }), true);
});
test('uses DOB age when a broad listing band is provided, without copying DOB', () => {
  assert.equal(clientAge({ date_of_birth: '2016-10-01' }, new Date('2026-09-29')), 9);
  assert.equal(matchesExchangeListing({ ...base, client: { date_of_birth: '2016-10-01' }, now: new Date('2026-09-29'), listing: { ...base.listing, demographics: { ageBand: 'child' } } }), true);
});
test('broad adult referrals do not match teen-only profiles at the overlapping boundary', () => {
  assert.deepEqual(ageRange('adult'), [18, 120]);
  assert.equal(matchesExchangeListing({ ...base, facets: { ...base.facets, ageGroups: ['Teen (14-18)'] }, listing: { ...base.listing, demographics: { ageBand: 'adult' } } }), false);
});
test('specified insurance requires a supported insurance', () => {
  assert.equal(matchesExchangeListing({ ...base, listing: { ...base.listing, preferences: { insurance: 'aetna' } } }), true);
  assert.equal(matchesExchangeListing({ ...base, listing: { ...base.listing, preferences: { insurance: 'Other' } } }), false);
});
test('honors an explicitly requested provider gender', () => {
  const listing = { ...base.listing, preferences: { ...base.listing.preferences, providerGender: 'female' } };
  assert.equal(matchesExchangeListing({ ...base, listing, profile: { ...base.profile, details: { gender: 'Woman (she/her)' } } }), true);
  assert.equal(matchesExchangeListing({ ...base, listing, profile: { ...base.profile, details: { gender: 'male' } } }), false);
  assert.equal(matchesExchangeListing({ ...base, listing }), false);
});
