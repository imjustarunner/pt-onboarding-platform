// Exercises the actual reader against the local, non-AI preview on port 5183.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = 'http://127.0.0.1:5183/school-practice-guide-preview';
const output = fileURLToPath(new URL('../../deliverables/school-practice-guide-verification/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
try {
  await page.goto(base); await page.locator('.phase-grid').waitFor(); await page.evaluate(() => document.fonts.ready);
  check(await page.locator('.phase').count() === 4, 'Four phase cards with live section headings');
  check(await page.locator('.outline-link').count() === 25, 'All 25 sections navigable');
  check((await page.locator('.handbook-book').evaluate(el => getComputedStyle(el).fontFamily)).includes('Comfortaa'), 'ITSCO Comfortaa typography');
  await page.screenshot({ path: output + 'desktop.png', fullPage: true });
  for (const [index, slug] of ['school-assignment', 'client-intake', 'caseload-management', 'essential-protocols'].entries()) {
    await page.locator('.phase-heading').nth(index).click();
    await page.locator(`#school-practice-guide-${slug}`).waitFor();
    check(new URL(page.url()).hash === '#school-practice-guide-' + slug, 'Phase ' + (index + 1) + ' opens exact section');
  }
  await page.getByRole('searchbox').fill('not automatically a payable H0032');
  check(await page.locator('.outline-link').count() === 1, 'Full-text search locates treatment-plan qualification');
  await page.locator('.outline-link').click();
  check((await page.locator('.book-page').innerText()).includes('separate billable appointment is not automatically required'), 'Search result opens qualified procedure');
  await page.reload(); await page.locator('.book-page').waitFor();
  check(await page.locator('.book-page').getAttribute('id') === 'school-practice-guide-treatment-plan-acknowledgment', 'Deep link survives reload');
  await page.locator('.handbook-assistant summary').click();
  await page.getByRole('button', { name: 'What should I do when school closes?', exact: true }).click();
  await page.locator('.answer-policy-links a').waitFor();
  check((await page.locator('.answer-policy-links a').getAttribute('href')) === '#school-practice-guide-school-closures-and-provider-absence', 'Demo citation uses school guide anchor');
  await page.locator('.answer-policy-links a').click();
  check((await page.locator('.book-page').innerText()).includes('Do not label a school closure as a client no-show'), 'Citation opens the actual procedure');
  await page.screenshot({ path: output + 'citation-and-procedure.png', fullPage: true });
  await page.locator('.book-page a[href^="/workplace-handbook"]').click();
  await page.locator('#handbook-school-support-activity-hours').waitFor();
  check((await page.locator('.book-page h3').innerText()).toLowerCase().includes('school support'), 'Related policy opens the exact ITSCO handbook section');
  await page.goto(base); await page.locator('.book-page').waitFor();
  await page.locator('.book-page a[href^="/library?"]').click();
  await page.locator('#provider-guide-overview').waitFor();
  check((await page.locator('.book-page h3').innerText()).includes('ITSCO'), 'Provider guide cross-link retains ITSCO context');
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 844 }); await page.goto(base); await page.locator('.phase-grid').waitFor();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), width + 'px layout without horizontal overflow');
    await page.screenshot({ path: output + (width === 390 ? 'mobile.png' : 'tablet.png'), fullPage: true });
    await page.locator('.readiness-link').click(); await page.locator('#school-practice-guide-provider-readiness-checklist').waitFor();
    check((await page.locator('.book-page h3').innerText()).includes('readiness checklist'), width + 'px checklist navigation');
  }
  check(await page.locator('a[download]').count() === 0 && await page.getByRole('button', { name: /download|print|export/i }).count() === 0, 'No staff download or print controls');
  await page.emulateMedia({ media: 'print' });
  check(await page.locator('.handbook-print-notice').isVisible() && !await page.locator('.book-page').isVisible(), 'Print view displays the in-app notice, not guide content');
  check(errors.length === 0, 'No browser exceptions');
  await writeFile(output + 'browser-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors, scope: 'Local source preview; fixed Q&A interface example, not a live Gemini accuracy test. No database or production publication.' }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, errors }));
} finally { await browser.close(); }
