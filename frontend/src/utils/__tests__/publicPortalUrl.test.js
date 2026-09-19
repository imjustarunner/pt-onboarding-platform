import { describe, expect, it } from 'vitest';
import { portalLoginUrlForPublicSite } from '../publicPortalUrl.js';

describe('portalLoginUrlForPublicSite', () => {
  it('sends marketing visitors to dedicated app hosts', () => {
    expect(portalLoginUrlForPublicSite('nlu')).toBe('https://app.nextleveluplcc.com/login');
    expect(portalLoginUrlForPublicSite('itsco')).toBe('https://app.itsco.health/login');
    expect(portalLoginUrlForPublicSite('tisi')).toBe('https://app.theinnerstrengthinstitute.com/login');
    expect(portalLoginUrlForPublicSite('ptco')).toBe('https://app.plottwistco.com/login');
    expect(portalLoginUrlForPublicSite('mh4kidz')).toBe('https://app.mh4kidz.org/login');
    expect(portalLoginUrlForPublicSite('rise')).toBe('https://app.risereviveco.com/login');
    expect(portalLoginUrlForPublicSite('range')).toBe('https://app.mentalrange.org/login');
  });

  it('falls back to path login when no dedicated host exists', () => {
    expect(portalLoginUrlForPublicSite('kimi')).toBe('/kimi/login');
  });
});
