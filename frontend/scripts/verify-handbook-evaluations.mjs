import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { getHandbookSource } from '../../backend/src/services/workplaceHandbookContent.js';

const source = getHandbookSource({ slug: 'itsco' });
const output = fileURLToPath(new URL('../../deliverables/handbook-verification/evaluations/', import.meta.url));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [], errors = [], personnelRequests = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/api\/evaluations/.test(request.url())) personnelRequests.push(request.url()); });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:5181/handbook-preview#handbook-clinical-development-supervision-rubric', { waitUntil: 'networkidle' });
    await page.locator('.training-form').waitFor();
    assert.equal(await page.locator('.training-category').count(), 7);
    assert.equal(await page.locator('.training-band').count(), 28);
    assert.equal(await page.locator('.training-form select, .training-form textarea').evaluateAll(fields => fields.every(f => f.disabled)), true);
    assert.equal(await page.locator('.training-total strong').innerText(), '— / 100');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Intern form overflow at ${width}`);
    if ([1440, 390].includes(width)) await page.locator('.book-page').screenshot({ path: `${output}student-form-${width}.png` });
    await page.locator('.outline-link[href="#handbook-appendix-i"]').click();
    assert.equal(await page.locator('.chapter-sections button').count(), 6);
    for (const form of source.forms.employeeSelfAssessments) {
      await page.locator(`.outline-link[href="#handbook-${form.sectionSlug}"]`).click();
      const criteria = form.rubric.sections.flatMap(s => s.criteria);
      assert.equal(await page.locator('.ee-criterion').count(), criteria.length);
      assert.equal(await page.locator('.ee-rating-anchor').count(), criteria.length * 4);
      assert.equal(await page.locator('.handbook-self-assessment input, .handbook-self-assessment textarea').evaluateAll(fields => fields.every(f => f.disabled && !f.checked && (f.tagName !== 'TEXTAREA' || !f.value))), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${form.slug} overflow at ${width}`);
      assert.match(await page.locator('.handbook-self-assessment').innerText(), /My Account → Evaluations/);
      if ([1440, 390].includes(width) && form.slug === 'mental_health_counselor') {
        await page.locator('.book-page').screenshot({ path: `${output}self-assessment-${width}.png` });
        await page.locator('.book-page').scrollIntoViewIfNeeded();
        await page.locator('.book-page').evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY - 20));
        await page.screenshot({ path: `${output}self-assessment-opening-${width}.png` });
      }
      results.push({ width, form: form.slug, criteria: criteria.length, blank: true, overflow: false });
    }
    assert.equal(await page.locator('a[download]').count(), 0);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.book-layout').isVisible(), false);
    await page.emulateMedia({ media: 'screen' });
    // Searchable text is generated from the same form; a shared link opens it.
    await page.getByRole('searchbox', { name: 'Search handbook' }).fill('self-assessment');
    assert.ok(await page.locator('.outline-link').count() >= 6);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.handbook-self-assessment').count(), 1);
  }
  assert.deepEqual(personnelRequests, []);
  assert.deepEqual(errors, []);
  writeFileSync(`${output}results.json`, JSON.stringify({ results, errors, personnelRequests }, null, 2));
  console.log(JSON.stringify({ widths: 4, roleFormsChecked: results.length, internScoringGuides: 28, personnelRequests, errors, output }));
} finally { await browser.close(); }
