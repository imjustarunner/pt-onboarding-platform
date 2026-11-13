import { describe, expect, it } from 'vitest';
import { injectPublicFavicon, legacyTisiPublicDestination, publicBrowserBranding } from '../publicBrowserBranding.js';
import { CONVERSA_ICON_URL } from '../../constants/conversa.js';
import { buildShareMeta, injectShareMetaIntoHtml } from '../sharePreview.js';
import { PUBLIC_SITE_DOMAINS } from '../publicDomainRouting.js';

describe('public browser branding', () => {
  it('keeps event pages and their sign-in branded as Conversa before and after app startup', () => {
    for (const host of ['auricwell.com', 'plottwisthq.com', 'app.itsco.health']) {
      for (const path of ['/conversa/events/itsco/potluck-353', '/conversa/login/itsco']) {
        expect(publicBrowserBranding(host,path)).toEqual({slug:'conversa',title:'Conversa | Events',favicon:CONVERSA_ICON_URL});
        const shell='<html><head><title>Plot Twist Co.</title><link id="app-favicon" href="/old.png"><link id="app-apple-touch-icon" href="/old.png"></head></html>';
        const html=injectPublicFavicon(injectShareMetaIntoHtml(shell,buildShareMeta({host,path})),host,path);
        expect(html).toContain('<title>Conversa | Events</title>');
        expect(html.match(/assets\/conversa\/mark.svg/g)).toHaveLength(2);
        expect(html).not.toContain('Plot Twist');expect(html).not.toContain('og:url');
      }
    }
    expect(publicBrowserBranding('app.itsco.health','/conversa/events-other')).toBeNull();
  });
  it('uses the supplied SchoolCareBridge icon for browser identity',()=>{
    for(const host of ['schoolcarebridge.org','qv.app.schoolcarebridge.org'])expect(publicBrowserBranding(host).favicon).toBe('/assets/schoolcarebridge/icon.png');
  });
  it.each(Object.entries({ 'itsco.health':'itsco', ...PUBLIC_SITE_DOMAINS }))('keeps %s branded at root, www and functional pages', (host, slug) => {
    for (const domain of [host, `www.${host}`]) {
      for (const path of ['/', '/support', `/join/${slug}`]) {
        const brand = publicBrowserBranding(domain, path);
        expect(brand.slug).toBe(slug);
        expect(brand.title).not.toBe('Portal');
        if (slug !== 'kimi') expect(brand.favicon).toMatch(/^\/assets\//);
      }
    }
  });
  it('keeps authenticated app pages outside public metadata handling', () => {
    expect(publicBrowserBranding('app.itsco.health', '/dashboard')).toBeNull();
    expect(publicBrowserBranding('qv.app.itsco.health', '/qv')).toBeNull();
    expect(publicBrowserBranding('plottwisthq.com', '/p/ptco').title).toContain('Plot Twist');
  });
  it('uses the supplied round MH4Kidz logo and sets both initial icons', () => {
    const html = '<link id="app-favicon" rel="icon" href="/old.png"><link id="app-apple-touch-icon" rel="apple-touch-icon" href="/old.png">';
    const out = injectPublicFavicon(html, 'mh4kidz.org');
    expect(out.match(/mh4kidz-circle-v1.png/g)).toHaveLength(2);
    expect(out).not.toContain('/old.png');
  });
  it('recovers legacy public TISI links without changing app, editor or preview routes', () => {
    expect(legacyTisiPublicDestination('https://app.theinnerstrengthinstitute.com/p/tisi/for-men?source=referral#help')).toBe('https://theinnerstrengthinstitute.com/for-men?source=referral#help');
    for (const path of ['/login', '/dashboard', '/p/tisi?editWebsite=1', '/p/tisi?marketingPreview=1', '/p/tisi?bs=handoff']) expect(legacyTisiPublicDestination(`https://app.theinnerstrengthinstitute.com${path}`)).toBeNull();
    expect(legacyTisiPublicDestination('https://theinnerstrengthinstitute.com/')).toBeNull();
    expect(legacyTisiPublicDestination('https://plottwisthq.com/p/tisi')).toBeNull();
  });
});
