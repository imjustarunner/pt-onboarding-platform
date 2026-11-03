import { chromium } from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.AURICWELL_PREVIEW_URL || 'http://127.0.0.1:5181';
const artifacts = process.env.AURICWELL_FEATURE_ARTIFACT_DIR;
if (artifacts) await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [], apiRequests = [], writes = [];
try {
  const context = await browser.newContext();
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  const page = await context.newPage();
  await page.clock.install();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/auricwell`);
    const rotation = page.locator('[data-feature-rotation]');
    const visible = rotation.locator('.feature-rotation-slide:visible');
    await rotation.getByRole('button', { name: 'Pause rotation', exact: true }).waitFor();
    assert.match(await page.locator('h1').innerText(), /Less repeat work/);
    assert(!/texting/i.test(await page.locator('.hero .lead').innerText()), 'Feature rotation must remain separate from the main introduction');
    assert.match(await visible.innerText(), /reply Y to confirm attendance/);
    await page.mouse.move(0, 0);
    await page.clock.runFor(8001);
    assert.match(await visible.innerText(), /1:1 texting with the assigned provider/);
    await rotation.getByRole('button', { name: 'Next feature', exact: true }).click();
    assert.match(await visible.innerText(), /Separate accounts/);
    await page.mouse.move(0, 0);
    await page.clock.runFor(16001);
    assert.match(await visible.innerText(), /Separate accounts/, 'Manual navigation pauses automatic rotation');
    assert.equal(await rotation.getByRole('button', { name: 'Guardian accounts', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await visible.getByRole('link').getAttribute('href'), '/auricwell/product#guardians');
    await rotation.getByRole('button', { name: 'Guardian accounts', exact: true }).press('End');
    assert.match(await visible.innerText(), /Optional AI assistance/);
    await page.keyboard.press('Home');
    assert.match(await visible.innerText(), /A reminder/);
    await rotation.getByRole('button', { name: 'Start rotation', exact: true }).click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(8001);
    assert.match(await visible.innerText(), /1:1 texting/);
    await rotation.getByRole('button', { name: 'Pause rotation', exact: true }).click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(16001);
    assert.match(await visible.innerText(), /1:1 texting/, 'The pause control stops rotation');
    for (const label of ['Appointment reminders', 'In-app texting', 'Guardian accounts', 'Documentation']) {
      await rotation.getByRole('button', { name: label, exact: true }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}, ${label}`);
    }
    await rotation.getByRole('button', { name: 'Appointment reminders', exact: true }).click();
    if (artifacts && [1440, 390].includes(width)) await rotation.screenshot({ path: `${artifacts}/rotation-home-${width}.png` });
    await visible.getByRole('link', { name: 'Explore appointment reminders' }).click();
    await page.waitForURL('**/auricwell/product#appointment-reminders');
    assert.match(await page.locator('#appointment-reminders').innerText(), /reply Y to confirm attendance/);
    assert(!/\bschool\b/i.test(await page.locator('main').innerText()), 'School scheduling is outside AuricWell');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (artifacts && width === 1440) {
      await page.locator('#appointment-reminders').screenshot({ path: `${artifacts}/appointment-reminders-1440.png` });
      await page.locator('#guardians').screenshot({ path: `${artifacts}/guardian-accounts-1440.png` });
    }
  }
  await context.close();

  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  await reducedPage.clock.install();
  await reducedPage.goto(`${base}/auricwell`);
  await reducedPage.getByRole('button', { name: 'Start rotation', exact: true }).waitFor();
  await reducedPage.clock.runFor(16001);
  assert.match(await reducedPage.locator('.feature-rotation-slide:visible').innerText(), /A reminder/);
  await reduced.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(`${base}/auricwell`);
  assert.match(await staticPage.locator('.feature-rotation-slide:visible').innerText(), /reply Y to confirm attendance/);
  assert.equal(await staticPage.locator('[data-rotation-controls]:visible').count(), 0);
  await staticContext.close();
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(apiRequests.length, 0, 'Feature presentation must not fetch clinical data');
  assert.equal(writes.length, 0, 'Feature presentation must not send messages or change appointments');
  console.log('PASS: rotating features at four widths, automatic/manual rotation, pause/resume, keyboard access, reduced motion, static fallback, reminder links, Y confirmation copy, no school scheduling, no clinical calls or writes.');
} finally {
  await browser.close();
}
