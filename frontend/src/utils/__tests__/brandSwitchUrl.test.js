import { describe, expect, it } from 'vitest';
import { getAgencyAppHostname } from '../brandSwitchUrl.js';
import { normalizeTenantBrandKey, tenantFaviconUrl } from '../tenantBrandAssets.js';

describe('getAgencyAppHostname', () => {
  it('prefers custom_domain when set', () => {
    expect(getAgencyAppHostname({ custom_domain: 'app.example.com', slug: 'tisi' }))
      .toBe('app.example.com');
  });

  it('falls back to known dedicated hosts by slug alias', () => {
    expect(getAgencyAppHostname({ slug: 'tisi' })).toBe('app.theinnerstrengthinstitute.com');
    expect(getAgencyAppHostname({ portal_url: 'innerstrength' }))
      .toBe('app.theinnerstrengthinstitute.com');
    expect(getAgencyAppHostname({ slug: 'nlu' })).toBe('app.nextleveluplcc.com');
    expect(getAgencyAppHostname({ slug: 'itsco' })).toBe('app.itsco.health');
  });
});

describe('Inner Strength brand aliases', () => {
  it('maps tisi slug to innerstrength brand key and favicon', () => {
    expect(normalizeTenantBrandKey('tisi')).toBe('innerstrength');
    expect(tenantFaviconUrl('tisi')).toContain('InnerStrength');
    expect(tenantFaviconUrl('app.theinnerstrengthinstitute.com')).toContain('InnerStrength');
  });
});
