// Read-only full-platform smoke check using the ordinary demo provider sign-in UI.
// Screenshots are captured only after sign-in; credentials and browser state stay private.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const account = JSON.parse(fs.readFileSync(`${root}secrets/auricwell-qa/provider.json`, 'utf8'));
assert.equal(account.agencyId, 450);
assert.equal(account.agencySlug, 'auricwell-qa-demo');
const origin = 'https://app.itsco.health';
const prefix = `/${account.agencySlug}`;
const directory = `${root}deliverables/itsco-style-qa`;
const sessionPath = `${root}secrets/auricwell-qa/full-platform-inspection-session.json`;
const resume = process.argv.includes('--resume');
const frontendDir = process.argv.find(value => value.startsWith('--frontend-dir='))?.slice('--frontend-dir='.length);
const frontendOrigin = process.argv.find(value => value.startsWith('--frontend-origin='))?.slice('--frontend-origin='.length);
assert(!(frontendDir && frontendOrigin), 'Choose one frontend source');
const sanitize = value => String(value).replaceAll(account.password, '[REDACTED]');
fs.mkdirSync(directory, { recursive: true });
const report = { at: new Date().toISOString(), primaryInterface: 'full_platform', agencyId: 450, role: 'provider', checks: [], errors: [], failedRequests: [] };
if (frontendDir) report.frontendSource = 'isolated local production build; live QA APIs';
if (frontendOrigin) report.frontendSource = frontendOrigin;
if (resume) report.authentication = 'reused private demo session; fresh sign-in not tested in this run';
const browser = await chromium.launch({ headless: true, ...(fs.existsSync('/Applications/Google Chrome.app') ? { channel: 'chrome' } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...(resume ? { storageState: sessionPath } : {}) });
  const page = await context.newPage();
  if (frontendOrigin) {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.continue();
      const response = await route.fetch({ url: `${frontendOrigin}${url.pathname}${url.search}` });
      return route.fulfill({ response });
    });
  }
  if (frontendDir) {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.continue();
      const relative = route.request().isNavigationRequest() ? 'index.html' : url.pathname.slice(1);
      const target = path.resolve(frontendDir, relative);
      if (!target.startsWith(`${path.resolve(frontendDir)}/`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return route.continue();
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      return route.fulfill({ path: target, contentType: types[path.extname(target)] || 'application/octet-stream' });
    });
  }
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 400) report.failedRequests.push({ path: url.pathname, status: response.status() });
  });
  if (!resume) {
  await page.goto(`${origin}${prefix}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('#username').fill(account.username);
  await page.locator('#username').press('Enter');
  await page.locator('#password').waitFor({ timeout: 30000 });
  await page.locator('#password').fill(account.password);
  const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const login = await loginResponse;
  assert.equal(login.status(), 200, 'Normal provider sign-in failed; do not retry automatically');
  const signed = await login.json();
  assert.equal(signed.user.role, 'provider');
  assert.equal(Number(signed.user.id), 1433);
  report.loginPayload = { hasToken: !!signed.token, hasUser: !!signed.user, hasSessionId: !!signed.sessionId };
  try {
    await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 20000 });
  } catch {
    report.loginNavigationError = 'Login returned 200 but did not leave the sign-in route within 20 seconds.';
    report.loginScreenText = sanitize(await page.locator('body').innerText());
  }
  fs.writeFileSync(sessionPath, JSON.stringify(await context.storageState()), { mode: 0o600 });
  fs.chmodSync(sessionPath, 0o600);
  }
  const membershipResponse = await context.request.get(`${origin}/api/users/me/agencies`);
  assert.equal(membershipResponse.status(), 200);
  const memberships = await membershipResponse.json();
  assert.deepEqual(memberships.map(agency => Number(agency.id)), [450], 'Unexpected agency membership');
  const self = await context.request.get(`${origin}/api/users/me`);
  assert.equal(self.status(), 200);
  const identity = await self.json();
  assert.equal(Number(identity.id), 1433);
  assert.equal(identity.role, 'provider');
  report.membershipIds = [450];
  report.featureFlags = memberships[0].feature_flags;
  const cases = [
    { name: 'provider-dashboard', path: '/dashboard', text: 'My Account' },
    { name: 'provider-account', path: '/dashboard?tab=my&my=account', text: 'Account Info' },
    { name: 'provider-payroll', path: '/dashboard?tab=my&my=payroll', text: 'My Payroll' },
    { name: 'provider-settings', path: '/dashboard?tab=my&my=preferences', text: 'My Settings' },
    { name: 'provider-training', path: '/on-demand-training', text: 'Training' },
    { name: 'provider-schedule', path: '/my-schedule', text: 'Schedule' }
  ];
  for (const item of cases) {
    const result = { name: item.name, requestedPath: `${prefix}${item.path}` };
    const failedBefore = report.failedRequests.length;
    try {
      await page.goto(`${origin}${prefix}${item.path}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.getByText(item.text, { exact: false }).first().waitFor({ timeout: 20000 });
      assert.equal(new URL(page.url()).pathname.startsWith(`${prefix}/`), true, 'Lost QA agency route');
      const body = await page.locator('body').innerText();
      assert.equal(/Superadmin preview|Access restricted|Access Denied/.test(body), false);
      result.status = 'RENDERED';
      result.path = new URL(page.url()).pathname;
      result.visibleText = body.slice(0, 14000);
      result.failedRequests = report.failedRequests.slice(failedBefore);
      if (result.failedRequests.some(request => request.status >= 500 || [401, 403, 423].includes(request.status))) result.status = 'NEEDS_ATTENTION';
      await page.screenshot({ path: `${directory}/${item.name}.png`, fullPage: true });
      if (item.name === 'provider-dashboard') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: `${directory}/provider-dashboard-mobile.png`, fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    } catch (error) {
      result.status = 'FAIL';
      result.error = sanitize(error.message);
      if (!new URL(page.url()).pathname.endsWith('/login')) await page.screenshot({ path: `${directory}/${item.name}-failure.png`, fullPage: true });
    }
    report.checks.push(result);
    console.log(JSON.stringify({ name: result.name, status: result.status, error: result.error }));
    if (item.name === 'provider-dashboard' && result.status === 'FAIL') break;
  }
  report.status = !report.loginNavigationError && report.checks.length === cases.length && report.checks.every(check => check.status === 'RENDERED') && report.errors.length === 0 ? 'SMOKE_PASSED' : 'NEEDS_ATTENTION';
  report.limitations = ['Page rendering is not workflow completion or feature parity.', 'No training attempt, enrollment, booking, notification send, or payroll mutation was performed.'];
} catch (error) {
  report.status = 'BLOCKED';
  report.error = sanitize(error.message);
} finally {
  await browser.close();
  fs.writeFileSync(`${directory}/full-platform-verification.json`, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, error: report.error, errors: report.errors, failedRequests: report.failedRequests }));
if (report.status !== 'SMOKE_PASSED') process.exitCode = 1;
