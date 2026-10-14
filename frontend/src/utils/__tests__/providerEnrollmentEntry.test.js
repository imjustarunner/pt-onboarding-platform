import { describe, expect, it } from 'vitest';
import { fullProviderEnrollmentPath, providerEnrollmentFormats, providerEnrollmentPath } from '../providerEnrollmentEntry.js';

const config = { pathways: { full: { enabled: true, publicKey: 'full-enrollment' }, quick: { enabled: true } } };
const schedule = { inPerson: { status: 'waitlist' }, virtual: { status: 'accepting' } };

describe('provider profile enrollment entry', () => {
  it('orders open settings before waitlists and ignores slots when intake is closed or unknown', () => {
    expect(providerEnrollmentFormats(schedule).map(option => [option.format, option.status])).toEqual([['VIRTUAL', 'accepting'], ['IN_PERSON', 'waitlist']]);
    expect(providerEnrollmentFormats({ inPerson: { status: 'unavailable', hasPublishedOpenings: true }, slots: [{ format: 'IN_PERSON' }] })).toEqual([]);
    expect(providerEnrollmentFormats(null)).toEqual([]);
  });

  it('carries a desired provider and specific care format through the full entry route', () => {
    const entry = providerEnrollmentPath({ agencySlug: 'itsco', providerId: 9, format: 'VIRTUAL', query: { officeId: '3' } });
    expect(entry).toEqual({ path: '/join/itsco/counseling', query: { officeId: '3', enrollmentSource: 'provider', providerId: '9', serviceType: 'counseling', format: 'VIRTUAL' } });
    expect(fullProviderEnrollmentPath({ config, schedule, providerId: 9, serviceType: 'counseling', format: 'VIRTUAL', query: entry.query })).toEqual({ path: '/intake/full-enrollment', query: entry.query });
  });

  it('uses full enrollment for a provider-specific waitlist without claiming a confirmed assignment', () => {
    const destination = fullProviderEnrollmentPath({ config, schedule, providerId: 9, serviceType: 'counseling', format: 'IN_PERSON' });
    expect(destination.path).toBe('/intake/full-enrollment');
    expect(destination.query).toEqual({ enrollmentSource: 'provider', providerId: '9', serviceType: 'counseling', format: 'IN_PERSON' });
  });

  it('never falls back to a brief form if full enrollment is disabled', () => {
    expect(() => fullProviderEnrollmentPath({ config: { pathways: { quick: { enabled: true } } }, schedule, providerId: 9, format: 'VIRTUAL' })).toThrow('Full enrollment is not available');
  });

  it('rejects a closed or unrecognized format even if another setting is open', () => {
    for (const format of ['IN_PERSON', 'SCHOOL', '', undefined]) {
      expect(() => fullProviderEnrollmentPath({ config, schedule: { virtual: { status: 'accepting' } }, providerId: 9, format })).toThrow('closed to new clients in this setting');
    }
  });

  it('keeps the learning public route while preserving the actual service type', () => {
    expect(providerEnrollmentPath({ agencySlug: 'nlu', providerId: 12, serviceType: 'tutoring', format: 'VIRTUAL' })).toMatchObject({ path: '/join/nlu/learning', query: { serviceType: 'tutoring', enrollmentSource: 'provider' } });
  });
});
