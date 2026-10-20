import { describe, expect, it } from 'vitest';
import { skillBuildersDomains, skillBuildersPages, skillBuildersPageForPath, skillBuildersPath } from '../../content/skillBuildersWebsite.js';
import { itscoPublicResponse, itscoSitemap } from '../itscoPublicSeo.js';

describe('Skill Builders public website routing', () => {
  it.each(Object.keys(skillBuildersPages))('serves the %s page with its own indexable canonical metadata', key => {
    const path = skillBuildersPath(key);
    const response = itscoPublicResponse('www.itsco.health', path);
    expect(response).toMatchObject({
      status: 200, noindex: false,
      canonical: `https://www.itsco.health${path}`,
      title: skillBuildersPages[key].title,
      description: skillBuildersPages[key].description
    });
    expect(skillBuildersPageForPath(`${path}/`)).toBe(skillBuildersPages[key]);
    expect(itscoSitemap()).toContain(`<loc>https://www.itsco.health${path}</loc>`);
  });
  it('keeps the printed QR destination working through the canonical-host redirect', () => {
    expect(itscoPublicResponse('itsco.health', '/skillbuilders?source=qr')).toEqual({
      status: 301, redirect: 'https://www.itsco.health/skillbuilders?source=qr'
    });
  });
  it('rejects unknown program paths and does not apply ITSCO host redirects to the portal', () => {
    expect(skillBuildersPageForPath('/skillbuilders/missing')).toBeNull();
    expect(itscoPublicResponse('www.itsco.health', '/skillbuilders/missing').status).toBe(404);
    expect(itscoPublicResponse('app.itsco.health', '/skillbuilders')).toBeNull();
  });
  it('preserves the supplied three domains and 17-topic outline', () => {
    expect(skillBuildersDomains.map(d => d.topics.length)).toEqual([6, 5, 6]);
  });
});
