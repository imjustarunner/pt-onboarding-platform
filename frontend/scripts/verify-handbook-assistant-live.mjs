// Explicit live check. Uses the local --assistant preview and configured Google
// AI provider with synthetic questions and supplied handbook text only.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { getHandbookSource } from '../../backend/src/services/workplaceHandbookContent.js';
import { handbookAnswerSources } from '../../backend/src/services/workplaceHandbookAssistant.service.js';

const output = fileURLToPath(new URL('../../deliverables/handbook-verification/assistant/', import.meta.url));
mkdirSync(output, { recursive: true });
const sources = handbookAnswerSources(getHandbookSource({ slug: 'itsco' }));
const question = 'For Integrated Services, how many included indirect minutes are assigned to 60 compensated direct minutes?';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5181/handbook-preview', { waitUntil: 'networkidle' });
  await page.locator('.handbook-assistant > summary').click();
  await page.locator('.assistant-form textarea').fill(question);
  const started = Date.now();
  const pending = page.waitForResponse(response => response.url().endsWith('/handbook-preview-answer'), { timeout: 240000 });
  await page.locator('.assistant-form button[type=submit]').click();
  const httpResponse = await pending;
  assert.equal(httpResponse.status(), 200);
  const response = await httpResponse.json();
  assert.equal(response.status, 'answered');
  assert.equal(response.version.preview, true);
  assert.match(response.paragraphs.map(p => p.text).join(' '), /12/);
  for (const paragraph of response.paragraphs) {
    assert.ok(paragraph.citations.length);
    for (const citation of paragraph.citations) {
      const source = sources.find(s => s.slug === citation.slug);
      assert.ok(source?.passages.some(p => p.text === citation.quote));
    }
  }
  await page.locator('.handbook-answer').waitFor();
  await page.locator('.answer-source summary').first().click();
  const viewports = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.locator('.handbook-assistant').screenshot({ path: `${output}live-answer-${width}.png` });
    viewports.push({ width, overflow: false });
  }
  const target = response.paragraphs[0].citations[0].slug;
  await page.locator('.answer-policy-links a').first().click();
  assert.equal(await page.locator('.book-page').getAttribute('id'), `handbook-${target}`);
  assert.equal(new URL(page.url()).hash, `#handbook-${target}`);
  assert.deepEqual(errors, []);
  writeFileSync(`${output}live-browser-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Real Google AI answer through the local unpublished handbook preview; no database or employee records.', question, response, elapsedMs: Date.now() - started, citationNavigation: target, viewports, errors }, null, 2));
  console.log('Live answer verified in the browser: original evidence, exact policy navigation, desktop and mobile layout.');
} finally { await browser.close(); }
