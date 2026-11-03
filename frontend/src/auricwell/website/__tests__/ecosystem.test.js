import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { pages, renderWebsite } from '../render.mjs';

const approvedPartners = [
  { slug: 'schoolcarebridge', logo: '/assets/schoolcarebridge/logo.png', site: 'https://schoolcarebridge.org', secondary: ['/partners', '/for-agencies'] },
  { slug: 'mh4kidz', logo: '/assets/mh4kidz/logo.png', site: 'https://mh4kidz.org', secondary: ['/about', '/contact'] },
  { slug: 'itsco', logo: '/assets/itsco/logo.png', site: 'https://www.itsco.health', secondary: ['/providers'] },
  { slug: 'nlu', logo: '/assets/nlu/logo.png', site: 'https://nextleveluplcc.com', secondary: ['/providers', '/nlu/find-counselor', '/nlu/find-tutor'] },
  { slug: 'tisi', logo: '/assets/branding/innerstrength-mark.png', site: 'https://theinnerstrengthinstitute.com', secondary: ['/contact'] },
  { slug: 'rise', logo: '/assets/rise/logo.webp', site: 'https://risereviveco.com', secondary: ['/about', '/contact'] }
];
const documentFor = (section, options = {}) => new DOMParser().parseFromString(renderWebsite(section, options), 'text/html');
const normalizedUrl = href => new URL(href, 'https://auricwell.com').href.replace(/\/$/, '');
const linksIn = element => [...element.querySelectorAll('a[href]')].map(a => normalizedUrl(a.getAttribute('href')));
const textIn = element => element.textContent.replace(/\s+/g, ' ').trim();

describe('AuricWell website navigation and confirmed ecosystem', () => {
  it('serves every public page through its legacy HQ route before the app fallback', () => {
    const nginx = readFileSync(new NodeURL('../../../../nginx.conf', import.meta.url), 'utf8');
    for (const section of Object.keys(pages)) {
      const path = `/auricwell${section ? `/${section}` : ''}`;
      const route = nginx.match(new RegExp(`location\\s*=\\s*${path}\\s*\\{([^}]*)\\}`));
      expect(route?.[1], `Missing public HQ route: ${path}`).toContain(`try_files /auricwell/site/${section || 'home'}.html =404;`);
    }
    const trailingSlash = nginx.match(/rewrite\s+\^\/auricwell\/\(([^)]+)\)\/\$\s+\/auricwell\/\$1\s+permanent;/);
    expect(trailingSlash?.[1].split('|')).toEqual(expect.arrayContaining(Object.keys(pages).filter(Boolean)));
  });

  it('keeps public scripts and styles tied to the page build through edge caches', () => {
    for (const page of ['', 'product', 'partners', 'about', 'contact']) {
      const first = documentFor(page, { assetVersion: 'release-one' });
      const next = documentFor(page, { assetVersion: 'release-two' });
      const assets = doc => [...doc.querySelectorAll('script[src],link[rel="stylesheet"]')].map(el => el.getAttribute('src') || el.getAttribute('href')).filter(url => url.startsWith('/auricwell/website'));
      expect(assets(first).length).toBeGreaterThanOrEqual(2);
      expect(assets(first).every(url => url.endsWith('?v=release-one'))).toBe(true);
      expect(assets(next).every(url => url.endsWith('?v=release-two'))).toBe(true);
      expect(assets(first).some(url => assets(next).includes(url))).toBe(false);
    }
  });
  it('publishes Partners as a public page with matching desktop and mobile navigation', () => {
    expect(pages).toHaveProperty('partners');
    const doc = documentFor('partners', { origin: 'https://auricwell.com', canonicalBase: '' });
    expect(doc.querySelector('link[rel="canonical"]').getAttribute('href')).toBe('https://auricwell.com/partners');
    expect(doc.querySelector('meta[name="robots"][content*="noindex"]')).toBeNull();
    for (const selector of ['.desktop-nav', '.mobile-menu nav']) {
      const nav = doc.querySelector(selector);
      const link = [...nav.querySelectorAll('a')].find(a => textIn(a) === 'Partners');
      expect(link?.getAttribute('href')).toBe('/partners');
      expect(link?.getAttribute('aria-current')).toBe('page');
    }
  });

  it.each(['', '/auricwell'])('makes every Features link work with website base %s', base => {
    const doc = documentFor('', { base });
    const product = documentFor('product', { base });
    for (const selector of ['.desktop-nav', '.mobile-menu nav']) {
      const nav = doc.querySelector(selector);
      const menu = [...nav.querySelectorAll('details')].find(details => /Features/i.test(details.querySelector('summary')?.textContent || ''));
      expect(menu).toBeTruthy();
      const links = [...menu.querySelectorAll('a[href]')].filter(a => new URL(a.getAttribute('href'), 'https://auricwell.com').hash);
      expect(links.length).toBeGreaterThanOrEqual(6);
      expect(textIn(links[0])).toMatch(/kiosk/i);
      expect(links[0].getAttribute('href')).toBe(`${base}/product#office`);
      const anchors = links.map(a => new URL(a.getAttribute('href'), 'https://auricwell.com'));
      expect(new Set(anchors.map(url => url.hash)).size).toBe(anchors.length);
      for (const url of anchors) {
        expect(url.pathname).toBe(`${base}/product`);
        expect(url.hash).toMatch(/^#[a-z0-9-]+$/);
        expect(product.querySelectorAll(`[id="${url.hash.slice(1)}"]`)).toHaveLength(1);
      }
    }
  });

  it('shows one office section and one kiosk example with app-managed office details', () => {
    const doc = documentFor('product');
    expect(doc.querySelectorAll('main #office')).toHaveLength(1);
    expect(doc.querySelectorAll('main #kiosk')).toHaveLength(1);
    expect(doc.querySelectorAll('main [data-actual-example="kiosk"]')).toHaveLength(1);
    const office = textIn(doc.querySelector('#office'));
    for (const subject of [/building/i, /room/i, /reserv/i, /check.in/i, /questionnaire|form/i]) expect(office).toMatch(subject);
    expect(office).toMatch(/Google Calendar.*optional/i);
  });

  it('limits partner cards to the six approved organizations, with their real public destinations', () => {
    const doc = documentFor('partners');
    const cards = [...doc.querySelectorAll('main article[id]')];
    expect(cards.map(card => card.id).sort()).toEqual(approvedPartners.map(p => p.slug).sort());
    for (const partner of approvedPartners) {
      const card = doc.getElementById(partner.slug);
      expect(doc.querySelectorAll(`[id="${partner.slug}"]`)).toHaveLength(1);
      expect(card.querySelector('img').getAttribute('src')).toBe(partner.logo);
      const links = linksIn(card);
      expect(links).toContain(normalizedUrl(partner.site));
      expect(partner.secondary.some(path => links.includes(normalizedUrl(partner.site + path)))).toBe(true);
    }
    for (const slug of ['tisi', 'rise']) {
      expect(linksIn(doc.getElementById(slug)).some(href => /\/(?:providers|find-provider|find-counselor)(?:[/?#]|$)/.test(href))).toBe(false);
    }
    expect(textIn(doc.getElementById('schoolcarebridge'))).toMatch(/product/i);
    expect(textIn(doc.getElementById('schoolcarebridge'))).toContain('MH4Kidz');
  });

  it('connects About to the management services and integrated products', () => {
    const doc = documentFor('about');
    const main = doc.querySelector('main');
    const text = textIn(main);
    expect(text).toMatch(/managed by Plot Twist Co\.?/i);
    expect(text).toContain('Plotline');
    expect(text).toContain('SchoolCareBridge');
    const links = linksIn(main);
    for (const destination of [
      'https://plottwistco.com',
      'https://plotlinepo.com',
      'https://schoolcarebridge.org'
    ]) expect(links).toContain(normalizedUrl(destination));
    for (const [label, service] of [['Billing', 'billing'], ['Credentialing', 'credentialing'], ['People Operations', 'people-operations']]) {
      const action = [...main.querySelectorAll('a')].find(a => textIn(a).startsWith(`I need ${label}`));
      expect(action).toBeTruthy();
      const url = new URL(action.getAttribute('href'), 'https://auricwell.com');
      expect(url.pathname).toBe('/contact');
      expect(url.searchParams.get('service')).toBe(service);
      expect(url.hash).toBe('#contact-form');
    }
  });
});
