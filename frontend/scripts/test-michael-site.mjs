import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pages, renderSite} from '../src/michael/site.mjs';
import {offers, services} from '../src/michael/content.mjs';

const origin = process.env.MICHAEL_TEST_ORIGIN || 'http://127.0.0.1:5197';
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true});
try {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({width, height: 900});
    for (const section of Object.keys(pages)) {
      const response = await page.goto(`${origin}/michael${section ? '/' + section : ''}`);
      assert.equal(response.status(), 200, section);
      assert.equal(await page.locator('h1').count(), 1, section);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `https://plottwisthq.com/michael${section ? '/' + section : ''}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${section} overflows at ${width}px`);
      assert.equal(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true, `broken image: ${section}`);
    }
  }
  assert.equal(services.length, 5);
  assert.equal(offers.length, 6);
  assert.match(renderSite(), /Creator & orchestrator/);
  assert.match(renderSite(), /Scale my practice/);
  assert.equal(renderSite('not-a-page'), null);
  await page.goto(`${origin}/michael`);
  await page.getByRole('button', {name: /Menu/}).click();
  assert.equal(await page.getByRole('button', {name: /Menu/}).getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', {name: /Menu/}).getAttribute('aria-expanded'), 'false');
  await page.goto(`${origin}/michael/packages`);
  assert.equal(await page.locator('[data-offer]').count(), 6);
  assert.equal(await page.locator('.product-link').getAttribute('href'), 'https://plottwistco.com');

  // No submissions leave this browser. Exercise success, rejection and retry.
  let posts = 0, submitted;
  await page.route('**/api/public/agency-support/michael', route => route.fulfill({json: {recaptchaRequired: false}}));
  await page.route('**/api/public/agency-support/michael/tickets', route => {
    posts++; submitted = route.request().postDataJSON();
    return route.fulfill(posts === 1 ? {status: 400, json: {error: {message: 'Please review your inquiry.'}}} : {json: {ok: true, ticketId: 12345}});
  });
  await page.goto(`${origin}/michael/contact?package=scale`);
  assert.equal(await page.locator('[name="interest"]').inputValue(), 'scale');
  await page.getByLabel('Your name').fill('Website QA');
  await page.getByLabel('Email', {exact: true}).fill('qa@example.com');
  await page.locator('[name="message"]').fill('I want to plan the next stage of my group practice.');
  await page.locator('[name="consent"]').check();
  await page.getByRole('button', {name: /Send my inquiry/}).click();
  await page.getByText('Please review your inquiry.', {exact: true}).waitFor();
  assert.match(await page.locator('[name="message"]').inputValue(), /group practice/);
  await page.getByRole('button', {name: /Send my inquiry/}).click();
  await page.getByRole('heading', {name: 'Your inquiry is in.'}).waitFor();
  assert.equal(posts, 2);
  assert.equal(submitted.phiAcknowledged, true);
  assert.match(submitted.message, /Practice Scaling Sprint/);

  await page.goto(`${origin}/michael/pay`);
  const script = await page.locator('script[type="module"]').getAttribute('src');
  const validation = await page.evaluate(async source => {
    const {invitationPath} = await import(source);
    const token = 'a'.repeat(64);
    return {
      good: invitationPath(`https://plottwisthq.com/michael/packet/${token}`),
      bad: ['https://evil.example/michael/packet/', 'https://plottwisthq.com/kimi/packet/', 'http://plottwisthq.com/michael/packet/', 'https://someone@plottwisthq.com/michael/packet/'].map(prefix => invitationPath(prefix + token)),
      query: invitationPath(`https://plottwisthq.com/michael/packet/${token}?redirect=https://evil.example`)
    };
  }, script);
  assert.equal(validation.good, '/michael/packet/' + 'a'.repeat(64));
  assert.deepEqual(validation.bad, [null, null, null, null]);
  assert.equal(validation.query, null);
  assert.deepEqual(failures, []);
  console.log(`PASS: ${Object.keys(pages).length} pages × 4 viewport sizes; navigation, assets, package matching, inquiry failure/retry/success, and payment link safety.`);
} finally { await browser.close(); }
