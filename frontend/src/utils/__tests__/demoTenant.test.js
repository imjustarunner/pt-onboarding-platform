import { describe, expect, it } from 'vitest';
import {
  isLikelyDemoTenant,
  pickFirstNonDemoTenant,
  pickOrgSlug,
  resolvePreferredAgencySlug
} from '../demoTenant.js';

describe('demoTenant', () => {
  it('detects demo ITSCO style tenants', () => {
    expect(isLikelyDemoTenant({ name: 'Demo ITSCO', slug: 'demo-itsco' })).toBe(true);
    expect(isLikelyDemoTenant({ name: 'ITSCO', slug: 'itsco' })).toBe(false);
  });

  it('prefers production tenant over demo when both exist', () => {
    const demo = { id: 1, name: 'Demo ITSCO', slug: 'demo-itsco', organization_type: 'agency' };
    const prod = { id: 2, name: 'ITSCO', slug: 'itsco', organization_type: 'agency' };
    expect(pickOrgSlug(pickFirstNonDemoTenant([demo, prod]))).toBe('itsco');
  });

  it('honors explicit route slug', () => {
    const demo = { id: 1, name: 'Demo ITSCO', slug: 'demo-itsco', organization_type: 'agency' };
    const prod = { id: 2, name: 'ITSCO', slug: 'itsco', organization_type: 'agency' };
    expect(resolvePreferredAgencySlug(demo, [demo, prod], 'demo-itsco')).toBe('demo-itsco');
  });

  it('falls back to demo when it is the only tenant', () => {
    const demo = { id: 1, name: 'Demo ITSCO', slug: 'demo-itsco', organization_type: 'agency' };
    expect(resolvePreferredAgencySlug(demo, [demo], '')).toBe('demo-itsco');
  });
});
