import { describe, it, expect } from 'vitest';
import AgencyBusinessType from '../../models/AgencyBusinessType.model.js';
import {
  isFeatureAllowedForBusinessTypes,
  isPublicServiceTypeAllowed,
  publicServiceTypesForBusinessTypes,
  roleSurfacesForBusinessTypes,
  defaultsForOrganizationType,
  buildCapabilitiesPayload,
  featureKeysForBusinessTypes
} from '../businessTypeCapabilities.service.js';

describe('businessTypeCapabilities', () => {
  it('defaults agency to mental_health only', () => {
    expect(defaultsForOrganizationType('agency')).toEqual(['mental_health']);
    expect(defaultsForOrganizationType('life_coach')).toEqual(['coaching']);
    expect(defaultsForOrganizationType('consultant')).toEqual(['consulting']);
  });

  it('aliases healthcare → mental_health', () => {
    expect(AgencyBusinessType.normalizeType('healthcare')).toBe('mental_health');
    expect(AgencyBusinessType.normalizeType('mental_health')).toBe('mental_health');
    const types = [{ businessType: 'healthcare', isEnabled: true }];
    expect(publicServiceTypesForBusinessTypes(types).sort()).toEqual(['counseling', 'evaluation']);
    expect(featureKeysForBusinessTypes(types)).toContain('inSchoolSubmissionsEnabled');
    expect(featureKeysForBusinessTypes(types)).toContain('medicalBillingEnabled');
  });

  it('counseling-only types do not allow tutoring public finder', () => {
    const types = [
      { businessType: 'mental_health', isEnabled: true },
      { businessType: 'healthcare', isEnabled: true }
    ];
    expect(publicServiceTypesForBusinessTypes(types).sort()).toEqual(['counseling', 'evaluation']);
    expect(isPublicServiceTypeAllowed('tutoring', types)).toBe(false);
    expect(isPublicServiceTypeAllowed('counseling', types)).toBe(true);
  });

  it('learning types do not open medical billing features', () => {
    const types = [{ businessType: 'learning', isEnabled: true }, { businessType: 'tutoring', isEnabled: true }];
    expect(isFeatureAllowedForBusinessTypes('medicalBillingEnabled', types)).toBe(false);
    expect(isFeatureAllowedForBusinessTypes('standardsLearningEnabled', types)).toBe(true);
    expect(isFeatureAllowedForBusinessTypes('payrollEnabled', types)).toBe(true); // unscoped
  });

  it('role surfaces exclude tutoring enrollment for counseling-only', () => {
    const types = [{ businessType: 'mental_health', isEnabled: true }];
    const surfaces = roleSurfacesForBusinessTypes(types);
    expect(surfaces).toContain('counseling_enrollment');
    expect(surfaces).not.toContain('tutoring_enrollment');
  });

  it('buildCapabilitiesPayload summarizes packs and omits healthcare from catalog', () => {
    const caps = buildCapabilitiesPayload([{ businessType: 'coaching', isEnabled: true }]);
    expect(caps.enabledBusinessTypes).toEqual(['coaching']);
    expect(caps.allowedPublicServiceTypes).toEqual(['coaching']);
    expect(caps.allowedRoleSurfaces).toContain('coaching_enrollment');
    expect(caps.catalog).not.toContain('healthcare');
    expect(caps.catalog).toContain('mental_health');
  });
});
