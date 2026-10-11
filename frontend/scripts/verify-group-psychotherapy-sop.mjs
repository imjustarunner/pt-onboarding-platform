import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }), errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => new URL(r.request().url()).origin === 'http://127.0.0.1:5192' ? r.continue() : r.abort());
const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
const out = new URL('../../deliverables/group-psychotherapy-sop-verification/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
try {
  await page.goto('http://127.0.0.1:5192'); await page.locator('.outline-link').first().waitFor();
  check(await page.locator('.outline-link').count() === 12, 'Twelve linked reference sections');
  await page.locator('.outline-link').filter({ hasText: 'Company approval' }).click();
  check((await page.locator('.book-page').innerText()).includes('moratorium'), 'ITSCO approval restriction visible');
  await page.locator('input[type=search]').fill('one person'); await page.locator('.outline-link').filter({ hasText: 'Attendance' }).click();
  check((await page.locator('.book-page').innerText()).includes('do not bill a group encounter'), 'Search finds single-attendee guidance');
  check(page.url().endsWith('#group-psychotherapy-sop-attendance-and-scheduling'), 'Stable section link');
  await page.locator('input[type=search]').fill(''); await page.screenshot({ path: out + 'itsco.png', fullPage: true });
  for (const [tenant, phrase] of [['nlu', 'do not authorize 90853'], ['tisi', 'counseling-only']]) {
    await page.locator('select').selectOption(tenant); await page.locator('.outline-link').filter({ hasText: 'Company approval' }).click();
    check((await page.locator('.book-page').innerText()).includes(phrase), tenant + ' service boundaries');
  }
  check(await page.locator('a[download]').count() === 0, 'No document download control');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile reader fits viewport');
  await page.screenshot({ path: out + 'mobile.png', fullPage: true }); check(errors.length === 0, 'No browser errors');
  await writeFile(out + 'results.json', JSON.stringify({ checks, errors }, null, 2)); console.log(JSON.stringify({ passed: checks.length, errors }));
} finally { await browser.close(); }
