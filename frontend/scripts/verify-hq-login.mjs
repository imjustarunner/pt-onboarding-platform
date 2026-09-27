import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.HQ_PREVIEW_URL || 'http://127.0.0.1:5188';
const output = resolve('deliverables/hq-login-verification');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await context.addInitScript(() => localStorage.setItem('prefs:theme:current', 'dark'));
  const identified = [];
  const loginRequests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(4);
      let data = {};
      if (path === '/users/me') return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      if (path === '/agencies/resolve') data = { portalUrl: url.hostname === 'app.itsco.health' ? 'itsco' : null };
      else if (path === '/auth/identify') {
        identified.push(route.request().postDataJSON());
        const username = route.request().postDataJSON().username;
        data = { matched: true, normalizedUsername: username, login: username === 'google@example.invalid' ? { method: 'google', googleStartUrl: '/auth/google/start?orgSlug=itsco' } : { method: 'password' } };
      } else if (path === '/auth/login') {
        loginRequests.push(route.request().postDataJSON());
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Test sign-in rejected' } }) });
      } else if (path.includes('branding')) data = { organization_name: 'PlotTwist HQ', organization_logo_url: '/assets/ptco/logo-flat.webp', primary_color: '#6c4df6' };
      else if (path.includes('/theme') || path.includes('login-theme')) data = { agencyName: 'ITSCO', agency: { id: 2, name: 'ITSCO', slug: 'itsco', organization_type: 'agency' }, logoUrl: '/assets/itsco/logo.png', colorPalette: { primary: '#0F172A' } };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (!['plottwisthq.com', 'app.itsco.health'].includes(url.hostname)) return route.abort();
    try { return route.fulfill({ response: await route.fetch({ url: `${base}${url.pathname}${url.search}` }) }); }
    catch { return route.abort(); }
  });

  await page.goto('https://plottwisthq.com/login');
  await page.locator('.hq-login').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.hq-login img')].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await page.locator('.hq-company-link').getAttribute('href'), 'https://plottwistco.com/');
  assert.equal(await page.locator('video').count(), 0);
  const background = () => page.locator('.hq-login').evaluate(el => getComputedStyle(el).backgroundColor);
  assert.equal(await background(), 'rgb(250, 251, 252)');
  await page.screenshot({ path: `${output}/initial-light.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${output}/initial-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  assert.match(await page.locator('.error').textContent(), /Enter your work email/);
  assert.equal(identified.length, 0);
  await page.locator('#username').fill('test@example.invalid');
  await page.locator('#password').fill('not-a-real-password');
  await page.locator('.login-form').evaluate(form => form.requestSubmit());
  await page.locator('.error').filter({ hasText: 'Test sign-in rejected' }).waitFor();
  assert.equal(loginRequests.length, 1);
  assert.equal(identified.length, 1);
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await page.locator('#password').getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await page.locator('#username').fill('');
  await page.locator('#password').fill('');
  await page.goto('https://plottwisthq.com/login');
  await page.locator('.hq-cardhead').waitFor();

  for (const [name, width, height] of [['desktop', 1440, 1000], ['wide', 1920, 1080], ['tablet', 820, 1180], ['mobile', 390, 844], ['small', 320, 740]]) {
    await page.setViewportSize({ width, height });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      assert.equal(await background(), scheme === 'dark' ? 'rgb(9, 11, 15)' : 'rgb(250, 251, 252)');
      assert.equal(await page.locator('#username').evaluate(el => getComputedStyle(el).backgroundColor), scheme === 'dark' ? 'rgb(17, 19, 24)' : 'rgb(255, 255, 255)');
      await page.waitForFunction(expected => document.querySelector('meta[name="theme-color"]').content === expected, scheme === 'dark' ? '#090b0f' : '#fafbfc');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} overflow`);
      const headline = await page.locator('#hq-title').boundingBox();
      const form = await page.locator('.login-card').boundingBox();
      assert.ok(headline.y + headline.height <= form.y || headline.x + headline.width <= form.x, `${name} headline overlaps form`);
      await page.screenshot({ path: `${output}/${name}-${scheme}.png`, fullPage: true });
    }
  }
  await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
  await page.getByRole('heading', { name: 'Reset your password', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.hq-header button').click();
  await page.locator('#login-security-guidance').waitFor();
  await page.locator('#username').fill('google@example.invalid');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await page.waitForURL(/\/auth\/google\/start\?orgSlug=itsco/);
  assert.equal(loginRequests.length, 1, 'SSO must not submit password credentials');
  await page.goto('https://plottwisthq.com/itsco/login');
  await page.locator('.login-page--tenant-video').waitFor();
  assert.equal(await page.locator('.hq-login').count(), 0);
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#1D2633');
  await page.goto('https://plottwisthq.com/plottwistco/login');
  await page.locator('.login-page--tenant-video').waitFor();
  assert.equal(await page.locator('.hq-login').count(), 0);
  await page.goto('https://app.itsco.health/login');
  await page.locator('.login-page--tenant-video').waitFor();
  assert.equal(await page.locator('.hq-login').count(), 0);
  await page.goto('https://plottwisthq.com/login');
  await page.locator('.hq-login').waitFor();
  await page.evaluate(() => localStorage.setItem('currentAgency', JSON.stringify({ id: 2, slug: 'itsco', name: 'ITSCO' })));
  await page.goto('https://plottwisthq.com/');
  await page.locator('.hq-login').waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.deepEqual(errors, []);
  console.log('PASS: device themes, 5 viewport sizes, loaded assets, account identification before password submission, Google routing without password submission, password toggle, recovery, security, tenant isolation.');
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
