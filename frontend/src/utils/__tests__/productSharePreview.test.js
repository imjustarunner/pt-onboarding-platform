import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderWebsite, pages } from '../../auricwell/website/render.mjs';
import { officeHtml, officeSiteForHost } from '../officeSite.js';
import { buildShareMeta, injectShareMetaIntoHtml } from '../sharePreview.js';
import { renderSite, pages as michaelPages } from '../../michael/site.mjs';

const publicDir = resolve('public');
function preview(html, origin) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const meta = key => document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content;
  const image = new URL(meta('og:image'));
  expect(image.origin).toBe(origin);
  expect(meta('twitter:image')).toBe(image.href);
  expect(meta('twitter:card')).toBe('summary_large_image');
  expect(meta('og:url')).toMatch(new RegExp(`^${origin.replaceAll('.', '\\.')}(?:/|$)`));
  expect(meta('og:site_name')).toBeTruthy();
  expect(document.querySelectorAll('meta[property="og:image"]')).toHaveLength(1);
  const file = resolve(publicDir, image.pathname.slice(1));
  expect(existsSync(file), `Crawler image must exist: ${image.pathname}`).toBe(true);
  const png = readFileSync(file);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  expect(png.length).toBeLessThan(500_000);
  expect(meta('og:image:width')).toBe('1200');
  expect(meta('og:image:height')).toBe('630');
}

describe('product links are readable by crawlers without JavaScript', () => {
  it.each([
    ['mentalrange.org', '/', 'Mental Range Collective'],
    ['www.mentalrange.org', '/network', 'Mental Range Collective'],
    ['plottwisthq.com', '/p/range/about', 'Mental Range Collective'],
    ['schoolcarebridge.org', '/', 'SchoolCareBridge'],
    ['www.schoolcarebridge.org', '/for-schools', 'SchoolCareBridge'],
    ['mh4kidz.org', '/schoolcarebridge', 'SchoolCareBridge'],
    ['plottwisthq.com', '/schoolcarebridge', 'SchoolCareBridge'],
    ['michaelvmendez.com', '/', 'Michael V. Mendez']
  ])('uses a complete landscape card for %s%s', (host, path, name) => {
    const html = injectShareMetaIntoHtml(readFileSync(resolve('index.html'), 'utf8'), buildShareMeta({ host, path }));
    preview(html, `https://${host}`);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('meta[property="og:site_name"]').content).toBe(name);
    expect(doc.querySelector('meta[property="og:description"]').content.length).toBeGreaterThan(60);
    expect(doc.querySelector('meta[property="og:image:alt"]').content).toContain(name);
    expect(doc.querySelector('meta[property="og:image:type"]').content).toBe('image/png');
  });
  it.each(Object.keys(michaelPages))('uses Michael’s landscape card on the dedicated website: %s', section => {
    const html = renderSite(section, { siteOrigin: 'https://michaelvmendez.com', canonicalBase: '' });
    preview(html, 'https://michaelvmendez.com');
    expect(html).toContain(`rel="canonical" href="https://michaelvmendez.com${section ? '/' + section : ''}"`);
    expect(html).not.toContain('property="og:image" content="https://plottwisthq.com/assets/michael/logo-navy.png"');
  });
  it('retains a landscape card for the shared Michael website URL', () => {
    preview(renderSite(''), 'https://plottwisthq.com');
  });
  it.each(Object.keys(pages))('keeps AuricWell image paths intact on the dedicated domain: %s', section => {
    const html = renderWebsite(section, { origin: 'https://auricwell.com', canonicalBase: '' });
    preview(html, 'https://auricwell.com');
    expect(html).not.toContain('https://auricwell.com/mark.png');
    expect(html).toContain(`rel="canonical" href="https://auricwell.com${section ? '/' + section : ''}"`);
  });
  it('retains valid shared-domain metadata', () => {
    preview(renderWebsite('', { base: '/auricwell' }), 'https://plottwisthq.com');
  });
  it('adds complete kiosk metadata even when the shell has no preview tags', () => {
    preview(officeHtml('<html><head><title>App</title></head></html>', officeSiteForHost('kiosk.auricwell.com')), 'https://kiosk.auricwell.com');
  });
  it('replaces generic shell metadata with kiosk branding exactly once', () => {
    const shell = readFileSync(resolve('index.html'), 'utf8');
    const html = officeHtml(shell, officeSiteForHost('kiosk.auricwell.com'));
    preview(html, 'https://kiosk.auricwell.com');
    expect(html).not.toContain('/api/public/share-preview/image');
    expect((html.match(/property="og:type"/g) || [])).toHaveLength(1);
  });
});
