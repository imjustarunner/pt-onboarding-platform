// Real source/reader verification. Assistant response is deliberately stubbed;
// model grounding is checked separately by evaluateProviderGuideAssistant.js.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { referenceSource } from '../../backend/src/services/companyReferenceContent.js';
const output = fileURLToPath(new URL('../../deliverables/provider-guide-verification/', import.meta.url));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [], errors = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  for (const agency of ['itsco', 'nlu', 'isi']) {
    const source = referenceSource({ slug: agency === 'isi' ? 'tisi' : agency }, 'provider-guide');
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`http://127.0.0.1:5181/${agency}-provider-guide-preview`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.outline-link').count(), source.sections.length);
      assert.match(await page.locator('.cover-copy h2').innerText(), /Provider’s/);
      const font = await page.locator('.cover-copy h2').evaluate(el => getComputedStyle(el).fontFamily);
      assert.match(font, agency === 'itsco' ? /Comfortaa/ : /Montserrat/);
      assert.equal(await page.locator('a[download]').count(), 0);
      assert.equal(await page.getByRole('button', { name: /download|export|print/i }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if ([1440, 390].includes(width)) await page.screenshot({ path: `${output}${agency}-cover-${width}.png` });
      await page.locator('input[type=search]').fill('WHODAS');
      assert.equal(await page.locator('.outline-link').count(), 1);
      await page.locator('.outline-link').click();
      assert.equal(await page.locator('.book-page').getAttribute('id'), 'provider-guide-measure-whodas');
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('.book-page').getAttribute('id'), 'provider-guide-measure-whodas');
      await page.locator('.outline-link[href="#provider-guide-definition-of-services"]').click();
      if (agency === 'nlu') assert.match(await page.locator('.book-page').innerText(), /schedule three clients and proceed with two or more/);
      if (agency === 'isi') assert.match(await page.locator('.book-page').innerText(), /does not offer tutoring/);
      if ([1440, 390].includes(width)) await page.locator('.book-page').screenshot({ path: `${output}${agency}-scope-${width}.png` });
      await page.locator('.outline-link[href="#provider-guide-2-documentation-standards-universal"]').click();
      assert.ok(await page.locator('.book-page li').count() >= 9);
      await page.locator('.handbook-assistant > summary').click();
      const citation = { slug: '2-documentation-standards-universal', title: 'Documentation standards', path: 'General provider standards → Documentation', quote: 'Date of Service; Location / Place of Service; Duration or Encounter Type' };
      await page.route(`**/${agency}-provider-guide-preview-answer`, route => route.fulfill({ json: { status: 'answered', paragraphs: [{ text: 'Record the date, place and actual duration of the service.', citations: [citation] }], version: { preview: true } } }));
      await page.getByRole('button', { name: 'What must I include in a clinical note?' }).click();
      await page.locator('.answer-policy-links a').click();
      assert.equal(await page.locator('.book-page').getAttribute('id'), 'provider-guide-2-documentation-standards-universal');
      await page.locator('.book-page .handbook-prose a').click();
      await page.waitForURL(/handbook-preview#handbook-timekeeping/);
      assert.equal(await page.locator('.book-page').getAttribute('id'), 'handbook-timekeeping-compensation-and-payroll-compliance');
      await page.goto(`http://127.0.0.1:5181/${agency}-provider-guide-preview`, { waitUntil: 'networkidle' });
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('.book-layout').isVisible(), false);
      await page.emulateMedia({ media: 'screen' });
      results.push({ agency, width, sections: source.sections.length, font, overflow: false, search: 'passed', citations: 'stubbed UI passed', companyHandbookLinks: 'passed', printControls: 'absent' });
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}browser-results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ renders: results.length, errors, output }));
} finally { await browser.close(); }
