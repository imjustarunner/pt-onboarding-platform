// Build the actual plan checklist with fictional data into one portable HTML.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
const { build } = await import(pathToFileURL(path.join(path.dirname(frontendRequire.resolve('vite/package.json')), 'dist/node/index.js')).href);
const { default: vue } = await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-vue')).href);
const destination = path.resolve(process.argv[2] || path.join(root, 'artifacts/agency-note-samples'));
await fs.mkdir(destination, { recursive: true });
const output = await build({ configFile: false, root: path.join(root, 'frontend/previews/learning-session'), base: './', plugins: [vue()], logLevel: 'error',
  build: { write: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
const files = output.output;
let html = files.find(file => file.fileName === 'index.html').source;
for (const file of files) {
  if (file.type === 'chunk') html = html.replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, () => `<script type="module">${file.code.replace(/<\/script/gi, '<\\/script')}</script>`);
  if (file.fileName.endsWith('.css')) html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${file.source}</style>`);
}
const logo = await fs.readFile(path.join(root, 'backend/src/assets/schoolPrintablePacket/brand/nlu/NLULogo.png'));
html = html.replaceAll('./nlu-logo.png', `data:image/png;base64,${logo.toString('base64')}`);
const filename = 'nlu-learning-session-preview.html';
await fs.writeFile(path.join(destination, filename), html);
const puppeteer = createRequire(path.join(root, 'backend/package.json'))('puppeteer');
const browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-background-networking'], userDataDir: path.join(destination, '.interface-chromium-profile') });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => /^(data:|about:|blob:)/.test(request.url()) ? request.continue() : request.abort());
  await page.setViewport({ width: 1100, height: 960, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForSelector('.learning-checklist');
  await page.screenshot({ path: path.join(destination, 'nlu-learning-session-desktop.png'), fullPage: true });
  await page.click('input[value="developing"]');
  const revisit = await page.$eval('.preview', element => element.textContent);
  if (!revisit.includes('Next: revisit.')) throw new Error('Rating did not update the narrative.');
  await page.click('input[value="not_observed"]');
  const unobserved = await page.$eval('.preview', element => element.textContent);
  if (!unobserved.includes('progress not assessed') || unobserved.includes('6 of 8')) throw new Error('Unobserved rating kept observed results.');
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForSelector('.learning-checklist');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.screenshot({ path: path.join(destination, 'nlu-learning-session-mobile.png'), fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('The mobile form overflows the viewport.');
  if (errors.length) throw new Error(errors.join('; '));
  console.log(JSON.stringify({ file: path.join(destination, filename), checks: ['Actual Vue component', 'Rating updates narrative', 'Unobserved clears results', '390px mobile layout', 'External requests blocked'] }));
} finally { await browser.close(); await fs.rm(path.join(destination, '.interface-chromium-profile'), { recursive: true, force: true }); }
