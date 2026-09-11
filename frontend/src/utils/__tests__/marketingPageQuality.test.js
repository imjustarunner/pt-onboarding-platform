import { describe, it, expect } from 'vitest';
import { safeMarketingHref, landingDestination, marketingPageIssues } from '../marketingPageQuality';
import { defaultTisiLandingConfig, resolveTisiLandingConfig, adminFormToTisiLandingBranding, tisiLandingToAdminForm } from '../../constants/tisiMarketingLanding';

describe('marketing content integrity', () => {
  it('never invents endorsements or social destinations', () => {
    const c = defaultTisiLandingConfig();
    expect(c.testimonials).toEqual([]); expect(c.socialLinks).toEqual([]);
    expect(c.ctaHref).toBe('/join/tisi');
  });
  it('preserves intentionally emptied lists and contact fields through save and reload', () => {
    const draft = { ...defaultTisiLandingConfig(), services: [], testimonials: [], socialLinks: [], contactEmail: '', heroScript: '' };
    const branding = { ...adminFormToTisiLandingBranding(draft), primaryNav: [], legalFooterLinks: [] };
    const result = resolveTisiLandingConfig({ branding });
    expect(result.services).toEqual([]); expect(result.primaryNav).toEqual([]); expect(result.legalFooterLinks).toEqual([]);
    expect(result.contactEmail).toBe(''); expect(result.heroScript).toBe('');
  });
  it('persists approval and focal positions without generating a rating', () => {
    const config = { ...defaultTisiLandingConfig(), heroMobilePosition: '72% 30%', testimonials: [{ text: 'A real approved quote', attribution: 'Client', verified: true }] };
    const result = resolveTisiLandingConfig({ branding: adminFormToTisiLandingBranding(tisiLandingToAdminForm(config)) });
    expect(result.heroMobilePosition).toBe('72% 30%'); expect(result.testimonials[0].verified).toBe(true);
    expect(result.testimonials[0].rating).toBeUndefined();
  });
  it('uses edited hero fields rather than stale branding', () => {
    expect(resolveTisiLandingConfig({ pageMeta: { heroTitle: 'Edited heading' }, branding: { landing: { heroTitle: 'Old heading' } } }).heroTitle).toBe('Edited heading');
  });
  it('repairs the seeded placeholder CTA but preserves custom intake links', () => {
    expect(resolveTisiLandingConfig({ branding: { ctaHref: '/p/tisi/get-started' } }).ctaHref).toBe('/join/tisi');
    expect(resolveTisiLandingConfig({ branding: { ctaHref: '/intake/custom' } }).ctaHref).toBe('/intake/custom');
  });
});
describe('destination checks', () => {
  it.each(['javascript:alert(1)', 'data:text/html,test', '//evil.example', '/\\evil.example', '#', '/bad\npath'])('rejects unsafe or empty navigation %s', href => expect(safeMarketingHref(href)).toBe(''));
  it.each(['/join/tisi', 'https://example.com/start', 'mailto:office@example.com', 'tel:+15551234567'])('accepts supported destination %s', href => expect(safeMarketingHref(href)).toBe(href));
  it('uses real page sections and rejects missing or placeholder content', () => {
    const context = { slug: 'tisi', contentPages: [{ slug: 'about', body: '## Coming soon' }, { slug: 'men', body: 'Published content.' }] };
    expect(landingDestination('/p/tisi/services', context)).toBe('#services');
    expect(landingDestination('/p/tisi/about', context)).toBe('');
    expect(landingDestination('/p/tisi/men', context)).toBe('/p/tisi/men');
    expect(landingDestination('#missing', context)).toBe('');
  });
  it('reports fake social links and unconfirmed quotes', () => {
    const c = { ...defaultTisiLandingConfig(), socialLinks: [{ label: 'Instagram', href: '/p/tisi/resources' }], testimonials: [{ text: 'Unconfirmed' }] };
    const issues = marketingPageIssues(c);
    expect(issues.some(i => i.field === 'Instagram')).toBe(true);
    expect(issues.some(i => i.field === 'Testimonials')).toBe(true);
  });
});
