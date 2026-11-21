import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { fillPublicProviderBlurbs } from '../schoolProviderBlurb.service.js';
import ProviderPublicProfile from '../../models/ProviderPublicProfile.model.js';

it.each([
  ['Website introduction', 'School introduction', 'Website introduction', 'School introduction'],
  ['Website introduction', '', 'Website introduction', 'Website introduction'],
  ['', 'School introduction', 'School introduction', 'School introduction'],
  ['', '', '', null]
])('uses the appropriate optional biography with fallback: website=%j, school=%j', async (website, school, expectedWebsite, expectedSchool) => {
  const row = { user_id: 7, public_blurb: website, public_details_json: {} };
  const person = { provider_school_info_blurb: school };
  const database = { execute: vi.fn(async sql => sql.includes('FROM users WHERE') ? [[person]] : [[row]]) };
  const profile = await ProviderPublicProfile.getForProvider({ providerUserId: 7, database });
  const [card] = await fillPublicProviderBlurbs([{ provider_user_id: 7, school_info_blurb: school }], database);
  expect(profile.publicBlurb).toBe(expectedWebsite);
  expect(card.school_info_blurb).toBe(expectedSchool);
  expect(row.public_blurb).toBe(website); expect(person.provider_school_info_blurb).toBe(school);
  expect(database.execute.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql.trim()))).toBe(false);
});
