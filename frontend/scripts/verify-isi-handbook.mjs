// Reader verification with real local sources; no external model or personnel API.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { getHandbookSource } from '../../backend/src/services/workplaceHandbookContent.js';

const source = getHandbookSource({ slug: 'tisi' });
const output = fileURLToPath(new URL('../../deliverables/handbook-verification/isi/', import.meta.url));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [], requests = [], results = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/api\/evaluations|preview-answer/.test(r.url())) requests.push(r.url()); });
  const open = async slug => {
    await page.getByRole('searchbox', { name: 'Search handbook' }).fill('');
    await page.locator(`.outline-link[href="#handbook-${slug}"]`).click();
    assert.equal(await page.locator('.book-page').getAttribute('id'), `handbook-${slug}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, slug);
  };
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:5181/isi-handbook-preview', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.outline-link').count(), source.sections.length);
    assert.match(await page.locator('.cover-art .cover-landscape').getAttribute('src'), /mountain-banner\.webp$/);
    await page.locator('.cover-art .cover-landscape').evaluate(img => img.decode());
    await page.locator('.cover-logo').evaluate(img => img.decode());
    assert.equal(await page.locator('a[download]').count(), 0);
    if ([1440, 390].includes(width)) await page.screenshot({ path: `${output}cover-${width}.png` });
    await open('purpose-and-background-of-inner-strength-institute');
    assert.equal(await page.locator('.founder-portrait').count(), 0);
    assert.match(await page.locator('.story-body').innerText(), /Heal, Grow, Perform and Belong/);
    await open('mission');
    assert.match(await page.locator('.purpose-statement').innerText(), /compassionate, evidence-informed counseling/);
    assert.match(await page.locator('.purpose-signature').innerText(), /Inner Strength Institute/i);
    if ([1440, 390].includes(width)) await page.locator('.book-page').screenshot({ path: `${output}mission-${width}.png` });
    await open('values');
    assert.equal(await page.locator('.value-card').count(), 7);
    if ([1440, 390].includes(width)) await page.locator('.book-page').screenshot({ path: `${output}values-${width}.png` });
    await open('service-focus-assignment');
    assert.match(await page.locator('.book-page').innerText(), /counseling-only practice/);
    await open('student-training-agreement');
    assert.match(await page.locator('.book-page').innerText(), /agreement in the app before clinical placement begins/);
    await page.locator('.book-page .handbook-prose a[href="#handbook-clinical-development-supervision-rubric"]').first().click();
    assert.equal(await page.locator('.training-band').count(), 28);
    await open('student-training-program-disclosure-and-liability');
    assert.match(await page.locator('.book-page').innerText(), /liability insurance and clinical malpractice insurance/);
    for (const [query, expected] of [['malpractice','student-training-program-disclosure-and-liability'],['60 completed','supervision-procedures'],['Heal','values']]) {
      await page.getByRole('searchbox', { name: 'Search handbook' }).fill(query);
      assert.ok(await page.locator(`.outline-link[href="#handbook-${expected}"]`).count(), query);
    }
    await page.getByRole('searchbox', { name: 'Search handbook' }).fill('zzz missing search');
    assert.equal(await page.locator('.no-results').count(), 1);
    await open('appendix-i');
    assert.equal(await page.locator('.pending-section').count(), 1);
    await page.getByRole('button', { name: 'Review handbook updates', exact: true }).click();
    const links = page.locator('.policy-locations a');
    const destinations = await links.evaluateAll(els => els.map(e => e.getAttribute('href')));
    assert.ok(destinations.length > 80);
    for (let i = 0; i < destinations.length; i++) {
      await links.nth(i).click();
      assert.equal(await page.locator('.book-page').getAttribute('id'), destinations[i].slice(1));
      await page.getByRole('button', { name: 'Review handbook updates', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Read handbook', exact: true }).click();
    await open('student-training-agreement');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.book-page').getAttribute('id'), 'handbook-student-training-agreement');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.book-layout').isVisible(), false);
    await page.emulateMedia({ media: 'screen' });
    results.push({ width, sections: source.sections.length, policyLinks: destinations.length, overflow: false, sourceLinks: 'passed', staffPrint: 'disabled' });
  }
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  writeFileSync(`${output}results.json`, JSON.stringify({ results, errors, unexpectedRequests: requests }, null, 2));
  console.log(JSON.stringify({ results, errors, output }));
} finally { await browser.close(); }
