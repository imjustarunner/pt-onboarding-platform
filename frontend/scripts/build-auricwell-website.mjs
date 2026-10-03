import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pages, renderWebsite } from '../src/auricwell/website/render.mjs';
const out = fileURLToPath(new URL('../dist/auricwell/', import.meta.url));
mkdirSync(`${out}site`, {recursive:true});
for (const section of Object.keys(pages)) {
  writeFileSync(`${out}site/${section || 'home'}.html`, renderWebsite(section, {base:'/auricwell', email:'support@auricwell.com'}));
}
copyFileSync(fileURLToPath(new URL('../src/auricwell/website/website.css', import.meta.url)), `${out}website.css`);
copyFileSync(fileURLToPath(new URL('../public/auricwell/logo.png', import.meta.url)), `${out}logo.png`);
copyFileSync(fileURLToPath(new URL('../src/auricwell/website/website-demo.js', import.meta.url)), `${out}website-demo.js`);
console.log('Built five static AuricWell website pages.');
