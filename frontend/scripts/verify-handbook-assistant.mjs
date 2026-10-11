// Browser interaction tests only. All answer requests are fulfilled locally with
// a simulated response; this never calls an external model.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { getHandbookSource, handbookMetadata } from '../../backend/src/services/workplaceHandbookContent.js';
import { handbookAnswerSources } from '../../backend/src/services/workplaceHandbookAssistant.service.js';

const tenant = process.argv.includes('--agency=isi') ? 'isi' : process.argv.includes('--agency=nlu') ? 'nlu' : 'itsco';
const previewPath = tenant === 'itsco' ? '/handbook-preview' : `/${tenant}-handbook-preview`;
const source = getHandbookSource({ slug: tenant === 'isi' ? 'tisi' : tenant });
const policy = handbookAnswerSources({ sections: source.sections }).find(s => s.slug === 'compensation-integrated-service-compensation');
const normalized = policy.text.replace(/\s+/g, ' ');
const start = Math.max(0, normalized.indexOf('20%') - 90);
const fixture = { status: 'answered', version: { id: null, number: null, preview: true }, paragraphs: [{ text: 'For a 60-minute direct clinical service, the included indirect allowance is 12 minutes (20%).', citations: [{ slug: policy.slug, title: policy.title, path: policy.path, quote: normalized.slice(start, start + 360) }] }] };
const output = fileURLToPath(new URL(`../../deliverables/handbook-verification/${tenant === 'itsco' ? '' : tenant + '/'}assistant/`, import.meta.url));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [], results = [], payloads = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.route(`**${previewPath}-answer`, async route => {
    const body = route.request().postDataJSON(); payloads.push(body);
    if (body.question === 'Simulate an unavailable service') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    if (body.question === 'Which role matters?') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'clarification', paragraphs: [], clarification: 'Which role or workload tier applies to you?', version: fixture.version }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture) });
  });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:5181'+previewPath, { waitUntil: 'networkidle' });
    await page.locator('.handbook-assistant > summary').click();
    const textarea = page.locator('.assistant-form textarea');
    await textarea.fill('How many indirect minutes are included?');
    await page.locator('.assistant-form button[type=submit]').click();
    await page.locator('.handbook-answer').waitFor();
    assert.match(await page.locator('.handbook-answer').innerText(), /12 minutes/);
    await page.locator('.answer-source summary').click();
    assert.equal(await page.locator('.answer-source blockquote').innerText(), fixture.paragraphs[0].citations[0].quote);
    await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'Simulated response · interface test · no external AI call'; p.style.cssText = 'font-size:12px;color:#795724;background:#f8efcb;padding:10px'; document.querySelector('.assistant-content').prepend(p); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.locator('.handbook-assistant').screenshot({ path: `${output}question-panel-${width}.png` });
    await page.locator('.answer-policy-links a').click();
    assert.equal(await page.locator('.book-page').getAttribute('id'), `handbook-${policy.slug}`);
    assert.equal(new URL(page.url()).hash, `#handbook-${policy.slug}`);
    await textarea.fill('Which role matters?');
    await page.locator('.assistant-form button[type=submit]').click();
    await page.locator('.clarifying-question').waitFor();
    assert.deepEqual(payloads.at(-1).history, ['How many indirect minutes are included?']);
    await textarea.fill('Simulate an unavailable service');
    await page.locator('.assistant-form button[type=submit]').click();
    await page.locator('.answer-error').waitFor();
    assert.match(await page.locator('.answer-error').innerText(), /temporarily unavailable/);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.handbook-assistant').isVisible(), false);
    await page.emulateMedia({ media: 'screen' });
    await page.locator('.conversation-actions button').click();
    assert.equal(await page.locator('.assistant-turn').count(), 0);
    results.push({ width, citations: 'opens exact section', quotes: 'shown', followUps: 'previous questions only', failure: 'no fabricated answer', print: 'hidden', overflow: false });
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}browser-verification.json`, JSON.stringify({ scope: 'Simulated browser responses only; external AI calls were not made.', results, errors }, null, 2));
  console.log('Q&A interactions passed at 1440, 768, 390 and 320px using simulated responses. No external AI calls.');
} finally { await browser.close(); }
