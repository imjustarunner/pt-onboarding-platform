import { describe, it, expect } from 'vitest';
import {
  enrollmentServiceTypesForCategories,
  serviceBusinessTypesForCategories,
  TENANT_GATE_BY_CATEGORY
} from '../practiceCategories.service.js';
import UserAgencyPracticeCategory, {
  PRACTICE_CATEGORY_CODES
} from '../../models/UserAgencyPracticeCategory.model.js';

describe('practiceCategories', () => {
  it('maps categories to public enrollment service types', () => {
    expect(enrollmentServiceTypesForCategories(['mental_health']).sort()).toEqual([
      'counseling',
      'evaluation'
    ]);
    expect(enrollmentServiceTypesForCategories(['tutoring'])).toEqual(['tutoring']);
    expect(enrollmentServiceTypesForCategories(['coaching', 'consulting']).sort()).toEqual([
      'coaching',
      'consulting'
    ]);
  });

  it('maps tutoring category to tutoring + learning services', () => {
    expect(serviceBusinessTypesForCategories(['tutoring']).sort()).toEqual(['learning', 'tutoring']);
    expect(serviceBusinessTypesForCategories(['mental_health'])).toEqual(['mental_health']);
  });

  it('aliases healthcare category to mental_health', () => {
    expect(UserAgencyPracticeCategory.normalizeCategory('healthcare')).toBe('mental_health');
    expect(PRACTICE_CATEGORY_CODES).not.toContain('healthcare');
  });

  it('gates each practice category on a tenant business type', () => {
    expect(TENANT_GATE_BY_CATEGORY.mental_health).toBe('mental_health');
    expect(TENANT_GATE_BY_CATEGORY.tutoring).toBe('tutoring');
    expect(TENANT_GATE_BY_CATEGORY.coaching).toBe('coaching');
    expect(TENANT_GATE_BY_CATEGORY.consulting).toBe('consulting');
  });
});
