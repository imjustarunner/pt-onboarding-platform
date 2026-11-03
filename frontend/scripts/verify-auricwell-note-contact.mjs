import { chromium } from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.AURICWELL_PREVIEW_URL || 'http://localhost:5193';
const out = process.env.AURICWELL_REVIEW_DIR;
if (out) await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [], requests = [], submissions = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    assert(path.startsWith('/api/public/agency-support/auricwell'), 'No clinical or authentication requests');
    if (request.method() === 'POST') {
      submissions.push(request.postDataJSON());
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, ticketId: 4242, emailDelivered: true }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ categories: [{ id: 'intake_join', label: 'New practice or account setup' }], recaptchaRequired: false }) });
  });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/auricwell`);
    const workspace = page.locator('.note-showcase');
    await workspace.getByRole('button', { name: /Avery Chen/ }).waitFor();
    assert.equal(await workspace.locator('.note-example-drafts button').count(), 3);
    assert.equal(await workspace.locator('.note-example-queue article').count(), 3);
    assert.match(await workspace.locator('.note-example-ratings').innerText(), /Start[\s\S]*3[\s\S]*Previous[\s\S]*5[\s\S]*This session[\s\S]*6[\s\S]*Goal[\s\S]*8/);
    await workspace.getByRole('button', { name: /Riley Brooks/ }).click();
    assert.match(await workspace.locator('.note-example-title').innerText(), /Riley Brooks/);
    assert(!/No note selected/.test(await workspace.innerText()));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Homepage overflow at ${width}`);
    if (out && [1440, 390].includes(width)) await workspace.screenshot({ path: `${out}/note-workspace-${width}.png` });
    await page.goto(`${base}/auricwell/product`);
    assert.match(await page.locator('#documentation').innerText(), /AI is optional[\s\S]*signed recording and transcription consent in the app/);
    assert.match(await page.locator('#texting').innerText(), /assigned provider[\s\S]*SUPPORT[\s\S]*Notifyre[\s\S]*end-to-end encryption/);
    await page.getByRole('link', { name: 'Contact', exact: true }).first().click();
    await page.locator('.website-contact form').waitFor();
    assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
    assert(!/michael@|melissa@|admin@auricwell/.test(await page.locator('main').innerText()));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Contact overflow at ${width}`);
    if (out && [1440, 390].includes(width)) await page.locator('.auricwell-contact-layout').screenshot({ path: `${out}/contact-${width}.png` });
  }
  await page.getByLabel('Your name', { exact: true }).fill('Fictional Visitor');
  await page.getByLabel('Email address', { exact: true }).fill('visitor@example.test');
  await page.getByLabel('What can we help with?').selectOption('intake_join');
  await page.getByLabel('Your message', { exact: true }).fill('A fictional inquiry about setting up a new practice.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send to our support team' }).click();
  await page.getByText('Your reference is #4242.', { exact: false }).waitFor();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].email, 'visitor@example.test');
  assert(!submissions[0].to && !submissions[0].recipient);
  assert.deepEqual(errors, []);
  const result = { syntheticOnly: true, widths: [1440, 768, 390, 320], noteLayout: 'PASS', ratedGoals: 'PASS', optionalAiConsentTranscription: 'PASS', textingAndSupport: 'PASS', contactForm: 'PASS', mockSubmissions: submissions.length, actualEmailsSent: 0, errors };
  if (out) await writeFile(`${out}/browser-review.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
