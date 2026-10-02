import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLAN_FEATURES } from '../../constants/productPlanCatalog.js';
import { planIncludesFeature } from '../productPlanPolicy.js';

describe('approved product plan policy', () => {
  it('matches every user-approved assignment and both deployment catalogs', () => {
    const approved = JSON.parse(readFileSync(new URL('../../../../deliverables/approved-feature-tiers.json', import.meta.url), 'utf8'));
    expect(PLAN_FEATURES.map(({ key, label, minimumTier }) => ({ key, feature: label, minimumTier }))).toEqual(approved.features);
    expect(PLAN_FEATURES).toHaveLength(52);
    expect(readFileSync(new URL('../../constants/productPlanCatalog.js', import.meta.url), 'utf8'))
      .toBe(readFileSync(new URL('../../../../frontend/src/config/productPlanCatalog.js', import.meta.url), 'utf8'));
  });
  it('uses the agency plan for shared features regardless of a staff member’s plan', () => {
    expect(planIncludesFeature({ agencyTier: 'premium_plus', individualTier: 'basic' }, 'hiringEnabled')).toBe(true);
    expect(planIncludesFeature({ agencyTier: 'basic', individualTier: 'premium_plus' }, 'hiringEnabled')).toBe(false);
    expect(planIncludesFeature({ agencyTier: 'premium', individualTier: 'basic' }, 'payrollWorkspace')).toBe(true);
    expect(planIncludesFeature({ individualTier: 'premium_plus' }, 'payrollWorkspace')).toBe(false);
  });
  it('keeps private offices individual and multiple guests in Premium Plus', () => {
    expect(planIncludesFeature({ agencyTier: 'premium_plus', individualTier: 'basic' }, 'private_office')).toBe(false);
    expect(planIncludesFeature({ agencyTier: 'basic', individualTier: 'premium' }, 'private_office')).toBe(true);
    expect(planIncludesFeature({ individualTier: 'premium' }, 'multiple_office_guests')).toBe(false);
    expect(planIncludesFeature({ individualTier: 'premium_plus' }, 'multiple_office_guests')).toBe(true);
  });
  it('keeps separate features outside every tier, including grandfathered Premium Plus', () => {
    for (const feature of PLAN_FEATURES.filter(f => f.minimumTier === 'separate')) {
      expect(planIncludesFeature({ agencyTier: 'premium_plus', individualTier: 'premium_plus' }, feature.key)).toBe(false);
    }
  });
  it('includes Documentation Hub in all three tiers without unknown-tier grants', () => {
    for (const agencyTier of ['basic', 'premium', 'premium_plus']) expect(planIncludesFeature({ agencyTier }, 'ai_note_aid')).toBe(true);
    expect(planIncludesFeature({ agencyTier: 'typo' }, 'ai_note_aid')).toBe(false);
    expect(planIncludesFeature({ agencyTier: 'premium_plus' }, 'unknown')).toBe(false);
  });
  it('keeps the legacy Focus Music alias aligned with Focus Package', () => {
    const legacy = PLAN_FEATURES.find(f => f.key === 'focusMusic');
    expect(legacy.aliasOf).toBe('focusPackage');
    expect(legacy.minimumTier).toBe(PLAN_FEATURES.find(f => f.key === legacy.aliasOf).minimumTier);
  });
});
