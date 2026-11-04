import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
import { schoolEmailAdminOverviewUrl } from '../schoolEmailPortal.service.js';

afterEach(() => vi.unstubAllEnvs());
it.each(['app.itsco.health', 'https://app.itsco.health'])('keeps annual administration on SchoolCareBridge despite custom_domain %s', custom_domain => {
  vi.stubEnv('SCHOOLCAREBRIDGE_PUBLIC_ORIGIN', 'https://schoolcarebridge.org');
  expect(schoolEmailAdminOverviewUrl({ slug: 'itsco', custom_domain })).toBe('https://schoolcarebridge.org/app/itsco/admin/schools/overview?orgType=school&yearUpdate=1');
});
it('preserves the configured trusted MH4Kidz school base', () => {
  vi.stubEnv('SCHOOLCAREBRIDGE_PUBLIC_ORIGIN', 'https://mh4kidz.org');
  expect(schoolEmailAdminOverviewUrl({ slug: 'itsco', custom_domain: 'app.itsco.health' })).toBe('https://mh4kidz.org/schoolcarebridge/app/itsco/admin/schools/overview?orgType=school&yearUpdate=1');
});
it('fails closed for a missing or invalid agency slug', () => {
  expect(() => schoolEmailAdminOverviewUrl({ custom_domain: 'app.itsco.health' })).toThrow('configured agency portal');
  expect(() => schoolEmailAdminOverviewUrl({ slug: '../foreign' })).toThrow('Invalid school slug');
});
