// Run after npm run build. Validate the actual crawler HTML and packaged images.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { fundthredPages } from '../src/content/fundthredWebsite.js';
import { pages as auricwellPages } from '../src/auricwell/website/render.mjs';

const dist = new URL('../dist/', import.meta.url);
const checks = [
  ...Object.keys(fundthredPages).map(key => ['fundthred.com', `_public-sites/fundthred/${key}.html`]),
  ...Object.keys(auricwellPages).map(key => ['auricwell.com', `_public-sites/auricwell-domain/${key || 'home'}.html`]),
  ['kiosk.auricwell.com', '_public-sites/office-null/home.html'],
];
for (const [host, path] of checks) {
  const dom = new JSDOM(readFileSync(new URL(path, dist), 'utf8'));
  const doc = dom.window.document;
  const meta = key => doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content;
  assert(meta('og:title') && meta('og:description') && meta('og:site_name'), `${host}: missing preview copy`);
  assert.equal(doc.querySelectorAll('meta[property="og:image"]').length, 1);
  const image = new URL(meta('og:image'));
  assert.equal(image.origin, `https://${host}`);
  assert.equal(meta('twitter:image'), image.href);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(new URL(meta('og:url')).host, host);
  const png = readFileSync(new URL(image.pathname.slice(1), dist));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert(png.length < 500_000, 'Keep preview downloads small');
  dom.window.close();
}
const nginx = readFileSync(new URL('itsco-public.nginx.conf', dist), 'utf8');
assert.match(nginx, /server_name www\.auricwell\.com;[\s\S]*?return 302 https:\/\/auricwell\.com\$request_uri/);
console.log(`Verified ${checks.length} built product pages: branded metadata, same-domain PNGs, dimensions, download size, and www redirect.`);
