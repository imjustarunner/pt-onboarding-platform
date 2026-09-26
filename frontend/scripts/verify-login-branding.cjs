/** Local-only browser regression: tenant logins, remembered Google SSO, and login briefing.
 * Virtual public hosts are fulfilled from local Vite; every API call is fictional.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const origin = process.env.APPEARANCE_ORIGIN || 'http://127.0.0.1:5184';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Local Vite only');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'login-branding-'));
console.log('Artifacts:', artifacts);
const assert = (condition, message) => { if (!condition) throw Error(message); };
(async () => {
 const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
 try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const tenants = [
   { id: 2, slug: 'itsco', name: 'ITSCO', primary: '#246348', logo: '/assets/itsco/logo.png' },
   { id: 377, slug: 'tisi', name: 'The Inner Strength Institute', primary: '#255E66', logo: '/assets/branding/innerstrength-favicon-v2.png' },
   { id: 3, slug: 'nlu', name: 'Next Level Up', primary: '#136c88', logo: '/assets/branding/NLUWatermark.png' }
  ].map(a => ({ ...a, organization_type: 'agency', portal_url: a.slug, color_palette: { primary: a.primary, accent: a.primary, secondary: '#1D2633' }, logo_url: a.logo }));
  const user = { id: 99999, role: 'super_admin', status: 'ACTIVE_EMPLOYEE', username: 'sample.alias', email: 'sample@example.test', firstName: 'Sample', lastName: 'Member', title: 'Director' };
  let authenticated = false, googleStart = null;
  const security = () => ({ policy: { useLockScreen: false, timeoutMinutes: 20 }, session: { phase: 'active', serverNow: Date.now(), lastActivityAt: Date.now(), lockAt: Date.now() + 600000, expiresAt: Date.now() + 1200000, activityVersion: 1 } });
  await context.route('**/*', async route => {
   const url = new URL(route.request().url()), p = url.pathname;
   if (p.startsWith('/api/')) {
    let data = {}, status = 200;
    const slug = p.match(/\/portal\/([^/]+)\//)?.[1]; const tenant = tenants.find(a => a.slug === slug) || tenants[0];
    if (p === '/api/auth/google/start') { googleStart = { orgSlug: url.searchParams.get('orgSlug'), loginHint: url.searchParams.get('loginHint') }; return route.fulfill({ contentType: 'text/html', body: '<p>Google redirect requested</p>' }); }
    if (p === '/api/users/me' || p === '/api/auth/me') {
     if (!authenticated) { status = 401; data = { error: { message: 'Not signed in' } }; }
     else data = { ...user, loginBootstrap: { authMethod: 'google', sessionId: 'sample-session', agencies: tenants, security: security() } };
    } else if (p === '/api/agencies/resolve') data = { portalUrl: url.searchParams.get('host')?.includes('itsco') ? 'itsco' : url.searchParams.get('host')?.includes('innerstrength') ? 'tisi' : '' };
    else if (p.endsWith('/login-theme')) data = { agency: { name: tenant.name, organizationType: 'agency', logoUrl: null, colorPalette: tenant.color_palette, themeSettings: {} }, platform: { organizationName: 'Plot Twist Co' } };
    else if (p.endsWith('/theme')) data = { agencyName: tenant.name, logoUrl: null, colorPalette: tenant.color_palette, themeSettings: {} };
    else if (p === '/api/platform-branding') data = { organization_name: 'Plot Twist Co', primary_color: '#B80016' };
    else if (p === '/api/agencies' || p.endsWith('/agencies')) data = tenants;
    else if (/\/agencies\/\d+$/.test(p)) data = tenants.find(a => a.id === Number(p.split('/').at(-1))) || tenants[0];
    else if (/session-lock-config|session-activity/.test(p)) data = security();
    else if (p === '/api/notifications/catalog') data = { types: [], categories: [], agencyPolicies: [] };
    else if (p === '/api/notifications/counts') data = { general: 1 };
    else if (p === '/api/notifications') data = [{ id: 1, type: 'general', title: 'Sample notification', is_read: false }];
    else if (p === '/api/tasks') data = [{ id: 2, title: 'Sample pending task', status: 'pending' }];
    else if (p === '/api/presence/privileged') data = [{ id: user.id, role: user.role, name: 'Sample Member', first_name: 'Sample', last_name: 'Member', status: 'online', availability_band: 'available' }];
    else if (p === '/api/support-tickets') data = url.searchParams.has('ticketKind') ? [] : [{ id: 3, subject: 'Sample urgent item', status: 'open' }];
    else if (p.endsWith('/preferences')) data = { theme_preference: 'light' };
    else if (/auth\/identify/.test(p)) data = { login: { method: 'password' }, resolvedOrgSlug: 'itsco' };
    else if (/schedule-summary/.test(p)) data = {};
    else if (/modules|documents|templates|training|progress|threads|messages|users|notifications|presence|programs|departments|icons/.test(p)) data = [];
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
   }
   if (url.hostname === 'app.itsco.health' || url.hostname === 'app.theinnerstrengthinstitute.com' || url.hostname === 'plottwisthq.com' || url.origin === origin) {
    const response = await route.fetch({ url: origin + p + url.search });
    return route.fulfill({ response });
   }
   return route.fulfill({ contentType: 'text/plain', body: '' });
  });
  // The exact custom-domain timeout login: no configured logo, stale platform choice.
  await page.goto('https://app.itsco.health/login');
  await page.evaluate(() => sessionStorage.setItem('__pt_platform_mode__', '1'));
  await page.goto('https://app.itsco.health/login?timeout=true');
  await page.locator('.video-auth-hero__logo').waitFor();
  await page.waitForFunction(() => document.querySelector('.video-auth-hero__subtitle')?.textContent.includes('ITSCO'));
  assert((await page.locator('.video-auth-hero__logo').getAttribute('src')).includes('/assets/itsco/logo.png'), 'ITSCO login uses another brand');
  assert(await page.locator('.login-page').evaluate(e => getComputedStyle(e).getPropertyValue('--va-primary').trim()) === '#246348', 'ITSCO controls use platform colors');
  await page.screenshot({ path: path.join(artifacts, 'itsco-login.png') });
  // Actual SSO return through LoginView and the cookie bootstrap (mocked Google session).
  authenticated = true;
  await page.evaluate(() => localStorage.setItem('prefs:theme:99999', 'light'));
  await page.goto('https://app.itsco.health/admin?sso=1&ssoOrg=itsco');
  await page.locator('.briefing-modal').waitFor({ timeout: 30000 });
  await page.locator('.briefing-card').first().waitFor();
  const remembered = await page.evaluate(() => JSON.parse(localStorage.getItem('__pt_google_sso_remember__')));
  assert(remembered?.displayName === 'Sample Member', 'Google callback did not remember identity');
  assert(await page.locator('html').getAttribute('data-theme') !== 'dark', 'Saved light preference was ignored at login');
  for (const theme of ['light', 'dark']) {
   await page.locator('select[aria-label="Appearance"]').first().selectOption(theme, { force: true });
   await page.waitForTimeout(250);
   const style = await page.locator('.briefing-modal').evaluate(e => ({ bg: getComputedStyle(e).backgroundColor, accent: getComputedStyle(e).getPropertyValue('--brief-primary').trim() }));
   assert(style.accent === '#B80016', 'Platform briefing is not platform red');
   const channels = style.bg.match(/\d+/g).slice(0, 3).map(Number);
   assert(theme === 'dark' ? Math.max(...channels) < 100 : Math.min(...channels) > 200, `Briefing ignores ${theme}`);
   assert((await page.locator('.brand-logo').getAttribute('src')).includes('/assets/ptco/'), 'Platform briefing shows tenant logo');
   await page.screenshot({ path: path.join(artifacts, `briefing-${theme}.png`) });
  }
  await page.evaluate(() => sessionStorage.setItem('justLoggedIn', 'true'));
  await page.reload(); await page.locator('.briefing-modal').waitFor();
  assert(await page.locator('html').getAttribute('data-theme') === 'dark', 'Saved dark preference was ignored after reload');
  // A second tenant on the same origin must not erase the first shortcut.
  await page.evaluate(async () => {
   const m = await import('/src/utils/loginRemember.js');
   m.setRememberedGoogleLogin({ username: 'other@example.test', orgSlug: 'nlu', displayName: 'Other Member' });
   for (const key of ['user', 'authToken', 'sessionId', 'currentAgency']) localStorage.removeItem(key);
   sessionStorage.removeItem('justLoggedIn');
  });
  authenticated = false;
  await page.goto('https://app.itsco.health/login?timeout=true');
  await page.getByRole('button', { name: 'Continue as Sample' }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'itsco-remembered-google.png') });
  await page.getByRole('button', { name: 'Continue as Sample' }).click();
  await page.waitForURL('**/auth/google/start?**');
  assert(googleStart?.orgSlug === 'itsco' && googleStart.loginHint === 'sample@example.test', 'Saved button did not go directly to Google start with correct identity');
  // Password-only memory must not turn into a Google account card.
  await page.goto('https://app.itsco.health/login');
  await page.evaluate(async () => { const m = await import('/src/utils/loginRemember.js'); m.clearRememberedGoogleLogin(); m.setRememberedLogin({ username: 'password@example.test', orgSlug: 'itsco' }); });
  await page.reload(); await page.waitForTimeout(1500);
  assert(await page.locator('input[autocomplete="username"]').inputValue() === 'password@example.test', 'Password username was not restored');
  assert(await page.locator('.remembered-account').count() === 0, 'Password user received Google shortcut');
  if (await page.locator('input[type="password"]').count()) assert(await page.locator('input[type="password"]').inputValue() === '', 'Password was persisted');
  // Peer tenant and platform identity stay distinct even when the API has no logo.
  for (const [url, mark] of [['https://app.theinnerstrengthinstitute.com/login', '/assets/branding/innerstrength'], ['https://plottwisthq.com/login', '/assets/ptco/']]) {
   await page.goto(url); await page.waitForTimeout(1800);
   const imgs = await page.locator('.video-auth-hero__logo, .platform-hero__logo').evaluateAll(xs => xs.map(x => x.getAttribute('src')));
   assert(imgs.some(src => src.includes(mark)), `Incorrect branding on ${url}`);
  }
  assert(errors.length === 0, errors.join('\n'));
  console.log(JSON.stringify({ status: 'passed', checks: ['ITSCO timeout branding', 'verified Google callback memory', 'briefing light and dark', 'per-tenant Google shortcut', 'direct Google start click', 'password username only', 'peer tenant and platform branding'], artifacts }, null, 2));
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
