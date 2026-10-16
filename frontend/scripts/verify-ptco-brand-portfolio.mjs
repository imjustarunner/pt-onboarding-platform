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
    assert.equal(await page.locator('[data-brand]').count(), 16);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow at ${width}`);
    for (const card of await page.locator('[data-brand]').all()) {
      await card.scrollIntoViewIfNeeded();
      for (const img of await card.locator('img').all()) await img.evaluate(el => el.decode());
    }
    await page.locator('#brand-portfolio').scrollIntoViewIfNeeded();
    if ([1440,390].includes(width)) await page.screenshot({ path: `${output}/portfolio-${width}.png`, fullPage: true });
  }
  const websiteLinks = await page.locator('.ptco-portfolio-links>a[href^="https://"]').evaluateAll(links => links.map(a => a.href));
  assert.equal(websiteLinks.length, 15);
  assert.equal(await page.locator('[data-brand="rmmentors"] .ptco-portfolio-status').innerText(), 'Website coming soon');
  assert.ok(websiteLinks.includes('https://auricwell.com/'));
  assert.ok(websiteLinks.includes('https://fundtred.com/'));
  assert.equal(await page.locator('.ptco-portfolio a[download]').count(), 0);
  const guides = await page.locator('.ptco-portfolio a[href$=".html"]').evaluateAll(links => links.map(a => a.getAttribute('href')));
  assert.equal(guides.length, 16);
  for (const href of guides) {
    const response = await page.request.get(`${origin}${href}`);
    assert.equal(response.status(), 200, href);
    assert.match(response.headers()['content-type'], /text\/html/, href);
    assert.ok((await response.text()).includes('Website color reference'), href);
  }
  await page.getByRole('button', { name: 'Care & community 6', exact: true }).click();
  assert.equal(await page.locator('[data-brand]').count(), 6);
  assert.equal(await page.locator('[data-brand="auricwell"]').count(), 0);
  await page.getByRole('button', { name: 'All brands 16', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-brand]').count(), 16);
  const popup = page.waitForEvent('popup');
  await page.locator('[data-brand="auricwell"] a[href$=".html"]').click();
  const guide = await popup;
  await guide.waitForLoadState();
  assert.equal(new URL(guide.url()).pathname, '/assets/ptco/brand-packages/auricwell.html');
  assert.equal(await guide.locator('h1').innerText(), 'AuricWell');
  for (const img of await guide.locator('img').all()) await img.evaluate(el => el.decode());
  await guide.close();
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ widths: [1440,768,390,320], brands: 16, htmlGuides: guides.length, filters: 'passed', keyboard: 'passed', newTab: 'passed', errors }, null, 2));
  console.log('Portfolio passed: 4 viewport sizes, 16 brand cards, 16 HTML guides, filters, keyboard, and guide opening in a new tab.');
} finally { await browser.close(); }
