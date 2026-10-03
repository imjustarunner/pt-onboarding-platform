import {mkdirSync, writeFileSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderSite, pages} from '../src/michael/site.mjs';

export function buildMichaelSite() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const out = `${root}dist/michael`;
  mkdirSync(`${out}/site`, {recursive: true});
  for (const section of Object.keys(pages)) writeFileSync(`${out}/site/${section || 'home'}.html`, renderSite(section));
  for (const file of ['browser.js', 'site.css']) copyFileSync(`${root}src/michael/${file}`, `${out}/${file}`);
  const urls = Object.keys(pages).filter(s => s !== 'pay').map(s => `<url><loc>https://plottwisthq.com/michael${s ? '/' + s : ''}</loc></url>`).join('');
  writeFileSync(`${out}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
}
