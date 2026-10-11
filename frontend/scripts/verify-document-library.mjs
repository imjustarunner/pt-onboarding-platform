// Checks the actual local library and handbook components. Example company only;
// no database writes and no external AI requests.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const output = fileURLToPath(new URL('../../deliverables/document-library-verification/', import.meta.url));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5181/document-library-preview', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.template-card').count(), 1);
    assert.equal(await page.locator('.outline-link').count(), 30);
    assert.match(await page.locator('.package-card').innerText(), /Included in Basic/);
    assert.match(await page.locator('.branded-cover').innerText(), /Cedar Studio/i);
    assert.equal(await page.locator('a[download]').count(), 0);
    await page.getByRole('searchbox', { name: 'Find a company' }).fill('not a company');
    assert.equal(await page.locator('.company-row').count(), 0);
    await page.getByRole('searchbox', { name: 'Find a company' }).fill('cedar');
    assert.equal(await page.locator('.company-row').count(), 1);
    await page.getByRole('searchbox', { name: 'Search handbook' }).fill('off the clock');
    assert.equal(await page.locator('.outline-link').count(), 1);
    await page.locator('.outline-link').click();
    assert.equal(await page.locator('.book-page').getAttribute('id'), 'handbook-time-records');
    assert.match(await page.locator('.book-page').innerText(), /Do not work off the clock/);
    await page.getByRole('searchbox', { name: 'Search handbook' }).fill('');
    assert.equal(await page.locator('.outline-link').count(), 30);
    await page.locator('a[href="#handbook-company-foundations"]').click();
    assert.match(await page.locator('.book-page').innerText(), /Text pending/i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}`);
    assert.deepEqual(errors, []);
    await page.evaluate(() => scrollTo(0, 0));
    if ([1440, 390].includes(width)) await page.screenshot({ path: `${output}library-${width}.png`, fullPage: true });
    await page.goto('http://127.0.0.1:5181/isi-handbook-preview', { waitUntil: 'networkidle' });
    await page.locator('.cover-art .cover-landscape').evaluate(img => img.decode());
    assert.match(await page.locator('.cover-art').innerText(), /HEAL · GROW · PERFORM · BELONG/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `ISI overflow at ${width}`);
    if ([1440, 390].includes(width)) await page.screenshot({ path: `${output}isi-cover-${width}.png` });
    results.push({ width, library: 'passed', searchAndSectionLinks: 'passed', staffDownloads: 'none', isiCover: 'passed', browserErrors: errors });
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(`${output}browser-results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n');
console.log(JSON.stringify(results));
