import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearChosenOrganization,
  readChosenOrganizationId,
  rememberChosenOrganization,
  resolveWorkingOrganization
} from '../workingOrganization.js';

const itscollc = {
  id: 450,
  name: 'ITSCOLLC',
  slug: 'auricwell-qa-demo',
  organization_type: 'agency',
  feature_flags: {}
};
const schoolBridge = {
  id: 456,
  name: 'SchoolCareBridge QA Company',
  slug: 'scb-qa-company',
  organization_type: 'agency',
  feature_flags: { schoolCareBridgeOnly: true }
};
const production = { id: 3, name: 'ITSCO', slug: 'itsco', organization_type: 'agency' };

describe('working organization', () => {
  beforeEach(() => {
    clearChosenOrganization();
  });

  it('keeps an explicit ITSCOLLC choice ahead of SchoolCareBridge and the URL', () => {
    const resolved = resolveWorkingOrganization({
      memberships: [schoolBridge, itscollc],
      chosenOrganizationId: 450,
      currentOrganization: schoolBridge,
      routeSlug: 'scb-qa-company',
      role: 'provider'
    });
    expect(resolved.id).toBe(450);
  });

  it('uses a matching URL only when nobody has chosen', () => {
    const resolved = resolveWorkingOrganization({
      memberships: [schoolBridge, itscollc],
      routeSlug: 'auricwell-qa-demo',
      role: 'support'
    });
    expect(resolved.id).toBe(450);
  });

  it('does not let a host slug that is not a membership replace the current organization', () => {
    const resolved = resolveWorkingOrganization({
      memberships: [schoolBridge, itscollc],
      currentOrganization: itscollc,
      routeSlug: 'itsco',
      role: 'provider'
    });
    expect(resolved.id).toBe(450);
  });

  it('prefers the full QA agency over SchoolCareBridge on a first visit', () => {
    const resolved = resolveWorkingOrganization({
      memberships: [schoolBridge, itscollc],
      role: 'provider'
    });
    expect(resolved.id).toBe(450);
  });

  it('still prefers a production agency over a QA agency when neither was chosen', () => {
    const resolved = resolveWorkingOrganization({
      memberships: [itscollc, production],
      role: 'admin'
    });
    expect(resolved.slug).toBe('itsco');
  });

  it('stores the choice per person', () => {
    rememberChosenOrganization(20, 450);
    expect(readChosenOrganizationId(20)).toBe(450);
    expect(readChosenOrganizationId(21)).toBeNull();
    clearChosenOrganization();
    expect(readChosenOrganizationId(20)).toBeNull();
  });
});
