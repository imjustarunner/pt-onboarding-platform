// Local browser checks with synthetic identities only. Start Vite with VITE_API_URL=/api.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.SCB_VERIFY_BASE || 'http://127.0.0.1:5178';
const browser = await chromium.launch({ headless: true, ...(process.env.SCB_BROWSER_EXECUTABLE ? { executablePath: process.env.SCB_BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const school = { id: 12, slug: 'ashley', portal_url: 'ashley', name: 'Ashley Elementary', organization_type: 'school', is_active: 1 };
const second = { ...school, id: 13, slug: 'lincoln', portal_url: 'lincoln', name: 'Lincoln Elementary' };
const agency = { id: 2, slug: 'itsco', name: 'ITSCO', organization_type: 'agency', is_active: 1 };
let signedIn = false;
let schoolAccessAllowed = false;
let oauthDestination = '';
// Forward synthetic future-domain pages to local Vite; never contact the public website.
await page.route('https://schoolcarebridge.org/**', async route => {
  const url = new URL(route.request().url());
  const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
  await route.fulfill({ response });
});
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const body = route.request().postDataJSON() || {};
  let data = {}, status = 200;
  if (path.endsWith('/users/me')) {
    status = signedIn ? 200 : 401;
    data = signedIn ? { id: 20, role: 'provider', email: 'agency@example.test', status: 'ACTIVE_EMPLOYEE' } : { error: { message: 'Sign in' } };
  } else if (path.endsWith('/auth/session-lock-config') || path.endsWith('/auth/session-activity')) {
    data={effectiveTimeoutMinutes:30,session:{serverNow:Date.now(),lastActivityAt:Date.now(),lockAt:Date.now()+25*60000,expiresAt:Date.now()+30*60000,phase:'active'}};
  } else if (path.endsWith('/auth/google/start')) {
    oauthDestination = route.request().url();
    await route.fulfill({ contentType: 'text/html', body: '<p>Configured Google authentication would start here.</p>' }); return;
  } else if (path.endsWith('/public/marketing-pages/schoolcarebridge')) {
    data = { page: { slug: 'schoolcarebridge', title: 'SchoolCareBridge', heroTitle: 'Connecting Schools. Supporting Students.', heroImageUrl: '/assets/mh4kidz/teamwork.webp', branding: { schoolcarebridgeWebsite: {} } } };
  } else if (path.includes('/schoolcarebridge/schools/')) {
    if (path.endsWith('/unknown')) { status = 404; data = { error: { message: 'This school portal is unavailable.' } }; }
    else { const chosen = path.endsWith('/lincoln') ? second : school; data = { school: { ...chosen, agencies: [{ id: 2, name: 'ITSCO' }, { id: 3, name: 'Next Level Up' }] } }; }
  } else if (path.includes('/schoolcarebridge/access/')) {
    if (signedIn && schoolAccessAllowed) data={school};
    else { status = signedIn ? 403 : 401; data = { error: { message: signedIn ? 'You do not have access to this school organization' : 'Session expired' } }; }
  } else if (path.endsWith('/schoolcarebridge/my-schools')) data = { schools: [school] };
  else if (path.endsWith('/auth/identify')) {
    const multi = body.username === 'multi@school.test';
    const agencyLogin = body.username === 'agency@example.test';
    const chosen = body.organizationSlug === 'lincoln' ? second : school;
    const pick = multi && ![school.slug, second.slug].includes(body.organizationSlug);
    data = { matched: true, normalizedUsername: body.username, needsOrgChoice: pick, orgOptions: pick ? [school, second] : undefined, resolvedOrg: pick ? null : agencyLogin ? agency : chosen, login: body.username === 'google@school.test' ? { method: 'google', googleStartUrl: '/auth/google/start?orgSlug=ashley' } : { method: 'password' } };
  } else if (path.endsWith('/auth/login')) {
    if (body.username === 'agency@example.test' && body.password === 'Synthetic!123') {
      signedIn = true; data = { token: 'synthetic-browser-test-token', sessionId: 'synthetic-session', user: { id: 20, role: 'provider', email: body.username, status: 'ACTIVE_EMPLOYEE' }, agencies: [agency] };
    } else { status = 401; data = { error: { message: 'Invalid credentials' } }; }
  } else if (path.endsWith('/auth/logout')) { signedIn = false; data = { ok: true }; }
  else if (path.includes('/auth/validate-reset-token/')) data = { firstName: 'Alex', tenant: { slug: 'itsco', name: 'ITSCO' }, school: path.endsWith('/school-reset') ? { slug: 'ashley', name: 'Ashley Elementary' } : null };
  else if (path.includes('/auth/reset-password/')) data = { requiresSignIn: true, message: 'Your password was saved. Please sign in.' };
  else if (path.includes('login-theme')) data = { agency: { ...school, organizationType: 'school', themeSettings: {} }, platform: {} };
  else if (path.includes('/agencies/slug/')) data = school;
  else if (path.includes('/portal/') && path.endsWith('/theme')) data = { ...school, agency:school, colorPalette:{primary:'#007cdd'}, themeSettings:{} };
  else if (path.endsWith('/affiliation')) data={active_agency_id:2,can_edit_clients:false};
  else if (path.startsWith('/api/school-portal/')) data=[];
  else if (path.endsWith('/agencies/resolve')) data = { portalUrl: null };
  else if (path.includes('/branding')) data = { organization_name: 'Plot Twist Co' };
  else if (path.includes('/agencies')) data = [agency];
  else if (path.endsWith('/auth/request-password-reset')) data = { message: 'If this account is eligible, a reset email has been sent.' };
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
});
async function visit(path) { await page.goto(base + path, { waitUntil: 'networkidle' }); }
async function identify(email) { await page.locator('#username').fill(email); await page.locator('#username').press('Tab'); }
try {
  for (const width of (process.env.SCB_VERIFY_QUICK ? [] : [1440, 390])) {
    await page.setViewportSize({ width, height: 1000 });
    for (const section of ['', 'for-schools', 'for-agencies', 'how-it-works', 'about', 'resources', 'security']) {
      await visit('/schoolcarebridge' + (section ? '/' + section : ''));
      assert.equal(await page.locator('h1').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await visit('/schoolcarebridge');
  await page.locator('#scb-nav').getByRole('link', { name: 'For Schools', exact: true }).click();
  await page.waitForURL('**/schoolcarebridge/for-schools');
  await page.goBack(); await page.waitForURL('**/schoolcarebridge');
  await page.goForward(); await page.waitForURL('**/schoolcarebridge/for-schools');
  await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.locator('h1').count(), 1);
  await visit('/schoolcarebridge/app'); await identify('staff@school.test');
  await page.waitForURL('**/schoolcarebridge/app/ashley');
  await page.locator('#password').waitFor();
  assert.ok(await page.getByText('Next Level Up', { exact: true }).isVisible());
  assert.ok(!page.url().includes('staff'));
  await page.locator('#password').fill('WrongPassword');
  await page.locator('.login-form button[type=submit]').click();
  await page.getByText('Invalid credentials', { exact: true }).waitFor();
  await page.getByText('Forgot Password?', { exact: true }).click();
  await page.locator('#forgotEmail').fill('staff@school.test');
  await page.locator('.modal form button[type=submit]').click();
  await page.getByText(/If this account is eligible/).waitFor();
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await visit('/schoolcarebridge/app'); await identify('multi@school.test');
  await page.locator('#orgChoice').selectOption('lincoln');
  await page.locator('.login-form button[type=submit]').click();
  await page.waitForURL('**/schoolcarebridge/app/lincoln'); await page.locator('#password').waitFor();
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await visit('/schoolcarebridge/app'); await identify('agency@example.test'); await page.locator('#password').waitFor();
  assert.ok(page.url().endsWith('/schoolcarebridge/app'));
  await page.locator('#password').fill('Synthetic!123'); await page.locator('.login-form button[type=submit]').click();
  await page.getByRole('heading', { name: 'Choose your school' }).waitFor();
  await page.getByRole('link', { name: /Ashley Elementary/ }).click();
  await page.getByText('You do not have access to this school organization', { exact: true }).waitFor();
  assert.equal(await page.locator('.school-portal').count(), 0);
  schoolAccessAllowed = true;
  await visit('/schoolcarebridge/app/ashley');await page.locator('.school-portal').waitFor();
  assert.ok(await page.locator('.scb-affiliates').getByText('ITSCO',{exact:true}).isVisible());
  await page.screenshot({path:'/tmp/scb-authenticated-portal.png',fullPage:true});
  await visit('/schoolcarebridge/app/ashley?mode=roster');await page.locator('.school-portal').waitFor();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.locator('#username').waitFor(); assert.equal(signedIn, false);
  signedIn = true;
  await visit('/schoolcarebridge/app/ashley'); await page.locator('.school-portal').waitFor();
  signedIn = false;
  await visit('/schoolcarebridge/app/ashley'); await page.locator('#username').waitFor();
  assert.equal(await page.locator('.school-portal').count(), 0);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await visit('/schoolcarebridge/app/unknown'); await page.getByText('This school portal is unavailable.', { exact: true }).waitFor();
  for (const [slug, token, destination] of [['itsco', 'agency-reset', '/schoolcarebridge/app'], ['ashley', 'school-reset', '/schoolcarebridge/app/ashley']]) {
    await visit(`/schoolcarebridge/app/${slug}/reset-password/${token}`);
    await page.locator('#password').fill('Synthetic!Pass123');
    await page.locator('#confirmPassword').fill('Synthetic!Pass123');
    await page.locator('.reset-submit').click();
    const login = page.getByRole('link', { name: 'Go to Login', exact: true });
    await login.waitFor(); assert.equal(await login.getAttribute('href'), destination);
  }
  await page.goto('https://schoolcarebridge.org/app', { waitUntil: 'networkidle' });
  await identify('google@school.test');
  await page.waitForURL('**/api/auth/google/start?**');
  assert.equal(new URL(oauthDestination).searchParams.get('next'), '/app/ashley');
  assert.equal(new URL(oauthDestination).origin, 'https://schoolcarebridge.org');
  assert.deepEqual(errors, []);
  console.log('Passed: responsive public pages, email routing, affiliations, incorrect password, recovery, multi-school choice, agency picker, shared authenticated portal and roster, denied/unknown school, session expiry, future-domain Google destination; no page errors.');
} catch (error) { console.error({url:page.url(),body:(await page.locator('body').innerText()).slice(0,4500),errors});await page.screenshot({path:'/tmp/scb-browser-failure.png',fullPage:true});throw error; } finally { await browser.close(); }
