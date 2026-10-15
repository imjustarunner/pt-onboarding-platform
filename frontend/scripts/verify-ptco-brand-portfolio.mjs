import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const origin = process.env.PTCO_TEST_ORIGIN || 'http://127.0.0.1:5193';
const path = process.env.PTCO_TEST_PATH || '/p/ptco/services/website';
const output = process.env.PTCO_TEST_OUTPUT || '/private/tmp/ptco-brand-portfolio-qa';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: { slug: 'ptco', branding: {}, providerDirectories: [] } }) }));
try {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    await page.locator('[data-brand="plottwistco"]').waitFor();
    assert.equal(await page.locator('[data-brand]').count(), 19);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow at ${width}`);
    for (const card of await page.locator('[data-brand]').all()) {
      await card.scrollIntoViewIfNeeded();
      for (const img of await card.locator('img').all()) await img.evaluate(el => el.decode());
    }
    await page.locator('#brand-portfolio').scrollIntoViewIfNeeded();
    if ([1440,390].includes(width)) await page.screenshot({ path: `${output}/portfolio-${width}.png`, fullPage: true });
  }
  const websiteLinks = await page.locator('.ptco-portfolio-links>a[target="_blank"]').evaluateAll(links => links.map(a => a.href));
  assert.equal(websiteLinks.length, 18);
  assert.equal(await page.locator('[data-brand="rmmentors"] .ptco-portfolio-status').innerText(), 'Website coming soon');
  assert.ok(websiteLinks.includes('https://auricwell.com/'));
  assert.ok(websiteLinks.includes('https://fundtred.com/'));
  const downloads = await page.locator('.ptco-portfolio a[download]').evaluateAll(links => links.map(a => a.getAttribute('href')));
  for (const href of downloads) {
    const response = await page.request.get(`${origin}${href}`);
    assert.equal(response.status(), 200, href);
    assert.equal((await response.body()).subarray(0, 2).toString(), 'PK', href);
  }
  await page.getByRole('button', { name: 'Care & community 7', exact: true }).click();
  assert.equal(await page.locator('[data-brand]').count(), 7);
  assert.equal(await page.locator('[data-brand="auricwell"]').count(), 0);
  await page.getByRole('button', { name: 'All brands 19', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-brand]').count(), 19);
  const download = page.waitForEvent('download');
  await page.locator('[data-brand="auricwell"] a[download]').click();
  const file = await download;
  assert.equal(file.suggestedFilename(), 'auricwell-brand-package.zip');
  await file.saveAs(`${output}/auricwell-brand-package.zip`);
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ widths: [1440,768,390,320], brands: 19, downloads: downloads.length, filters: 'passed', keyboard: 'passed', errors }, null, 2));
  console.log('Portfolio passed: 4 viewport sizes, 19 brand cards, 19 ZIP downloads, filters, keyboard, and browser download.');
} finally { await browser.close(); }
