import { describe, expect, it } from 'vitest';
import { resolveTenantPalette, TENANT_PALETTES } from '../tenantPalette';

const legacy = { primary: '#0F172A', secondary: '#1E40AF', accent: '#F97316' };
describe('shared tenant palette', () => {
  it.each(Object.keys(TENANT_PALETTES))('uses the %s identity for legacy or not-yet-loaded colors', slug => {
    expect(resolveTenantPalette(slug, legacy)).toEqual(TENANT_PALETTES[slug]);
    expect(resolveTenantPalette(slug)).toEqual(TENANT_PALETTES[slug]);
  });
  it('preserves custom colors, including a secondary-only customization', () => {
    for (const key of ['primary', 'secondary', 'accent']) {
      const custom = { ...legacy, [key]: '#345678' };
      expect(resolveTenantPalette('itsco', custom)).toEqual(custom);
    }
  });
  it('retains fonts and extended settings and recognizes tenant aliases', () => {
    expect(resolveTenantPalette('app.nextleveluplcc.com', { ...legacy, fontFamily: 'Example', divider: '#cccccc' }))
      .toEqual({ ...TENANT_PALETTES.nlu, fontFamily: 'Example', divider: '#cccccc' });
  });
  it('does not impose a known brand on an unknown tenant or HQ', () => {
    expect(resolveTenantPalette('new-tenant', legacy)).toEqual(legacy);
    expect(resolveTenantPalette('', legacy)).toEqual(legacy);
  });
});
