import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.HQ_PREVIEW_URL || 'http://127.0.0.1:5190';
const output = resolve('deliverables/tenant-theme-verification');
await mkdir(output, { recursive: true });
const legacy = { primary: '#0F172A', secondary: '#1E40AF', accent: '#F97316' };
const tenants = [
  { id: 1, slug: 'itsco', name: 'ITSCO', custom_domain: 'app.itsco.health' },
  { id: 2, slug: 'tisi', name: 'The Inner Strength Institute' },
  { id: 3, slug: 'nlu', name: 'Next Level Up' }
].map(t => ({ ...t, portal_url: t.slug, organization_type: 'agency', is_active: true, color_palette: legacy }));
const user = { id: 991, role: 'super_admin', status: 'active', firstName: 'Test', email: 'test@example.invalid', agencies: tenants };
const security = () => ({ policy: { useLockScreen: true, effectiveTimeoutMinutes: 120 }, session: { activityVersion: Date.now(), lastActivityAt: Date.now(), serverNow: Date.now(), lockAt: Date.now() + 3600000, expiresAt: Date.now() + 7200000, phase: 'active' } });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(({ user, tenants }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userAgencies', JSON.stringify(tenants));
    localStorage.setItem('currentAgency', JSON.stringify(tenants[1]));
    sessionStorage.setItem('justLoggedIn', 'true');
    sessionStorage.setItem('justLoggedInAt', String(Date.now()));
  }, { user, tenants });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(4);
      let data = [];
      if (path === '/users/me') data = { ...user, loginBootstrap: { authMethod: 'google', sessionId: 'test-session', agencies: tenants, security: security() } };
      else if (path === '/auth/session-lock-config') data = security();
      else if (path === '/agencies') data = tenants;
      else if (path === '/agencies/resolve') data = { portalUrl: url.searchParams.get('host') === 'app.itsco.health' ? 'itsco' : null };
      else if (path === '/auth/brand-switch/handoff') data = { handoffToken: 'synthetic-one-time-token' };
      else if (path === '/auth/brand-switch/consume') data = { user, agencies: tenants, sessionId: 'test-session' };
      else if (/^\/agencies\/slug\//.test(path)) data = tenants.find(t => t.slug === path.split('/').pop()) || null;
      else if (/^\/agencies\/[123]$/.test(path)) data = tenants.find(t => t.id === Number(path.split('/').pop()));
      else if (path.includes('/theme') || path.includes('login-theme')) {
        const tenant = tenants.find(t => path.includes(t.slug)) || tenants[0];
        data = { agencyName: tenant.name, slug: tenant.slug, logoUrl: null, iconUrl: null, colorPalette: legacy, themeSettings: { useExtendedBrandingColors: true }, agency: tenant };
      } else if (path.includes('preferences')) data = {};
      else if (path.includes('branding')) data = { organization_name: 'Plot Twist Co', organization_logo_url: '/assets/ptco/logo-flat.webp', primary_color: '#B80016' };
      else if (path.includes('counts')) data = { total: 0 };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (!['app.itsco.health', 'plottwisthq.com'].includes(url.hostname)) return route.abort();
    try { return route.fulfill({ response: await route.fetch({ url: `${base}${url.pathname}${url.search}` }) }); }
    catch { return route.abort(); }
  });
  const waitBriefing = async () => {
    await page.locator('.briefing-eyebrow').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('.briefing-loading'));
  };
  const readPalette = () => page.evaluate(async () => {
    const { useBrandingStore } = await import('/src/store/branding.js');
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const b = useBrandingStore(pinia);
    const nav = document.querySelector('.navbar');
    return { name: b.displayName, primary: b.primaryColor, accent: b.accentColor,
      navPrimary: nav && getComputedStyle(nav).getPropertyValue('--primary').trim(),
      dashboardPrimary: getComputedStyle(document.querySelector('.tenant-admin-dashboard')).getPropertyValue('--ops-primary').trim() };
  });
  await page.goto('https://app.itsco.health/admin?sso=1&ssoOrg=itsco');
  await waitBriefing();
  assert.equal(await page.locator('.briefing-eyebrow').textContent(), 'ITSCO command center');
  assert.equal(await page.locator('.enter-dashboard').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(8, 102, 83)');
  assert.deepEqual(await readPalette(), { name: 'ITSCO', primary: '#086653', accent: '#46D6B5', navPrimary: '#086653', dashboardPrimary: '#086653' });
  await page.screenshot({ path: `${output}/itsco-welcome-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.superadmin-dashboard').scrollIntoViewIfNeeded();
  const footerBounds = await page.locator('.briefing-footer').boundingBox();
  const buttonBounds = await page.locator('.superadmin-dashboard').boundingBox();
  assert.ok(buttonBounds.x >= 0 && buttonBounds.x + buttonBounds.width <= 390, 'HQ action fits mobile viewport');
  assert.ok(buttonBounds.y >= footerBounds.y, 'HQ action stays inside footer');
  assert.ok(await page.locator('.briefing-modal').evaluate(el => el.scrollWidth <= el.clientWidth), 'No mobile modal overflow');
  await page.screenshot({ path: `${output}/itsco-welcome-mobile.png` });
  await page.locator('.superadmin-dashboard').click();
  await page.waitForURL('https://plottwisthq.com/admin*', { timeout: 60000 });
  await waitBriefing();
  assert.equal(await page.locator('.briefing-eyebrow').textContent(), 'Platform command center');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [slug, primary, accent] of [['nlu', '#092E58', '#008591'], ['tisi', '#12364B', '#2F6B3A'], ['itsco', '#086653', '#46D6B5']]) {
    await page.evaluate(async tenant => {
      const { openTenantWorkspace } = await import('/src/services/workspaceNavigation.js');
      await openTenantWorkspace(tenant, document.querySelector('#app').__vue_app__.config.globalProperties.$router);
    }, tenants.find(t => t.slug === slug));
    await page.waitForURL(`https://plottwisthq.com/${slug}/admin*`, { timeout: 60000 });
    await waitBriefing();
    await page.locator('.enter-dashboard').click();
    await page.locator('.briefing-overlay').waitFor({ state: 'hidden' });
    const colors = await readPalette();
    assert.equal(colors.primary, primary); assert.equal(colors.accent, accent);
    assert.equal(colors.navPrimary, primary); assert.equal(colors.dashboardPrimary, primary);
    await page.screenshot({ path: `${output}/${slug}-dashboard-light.png` });
    await page.evaluate(async () => (await import('/src/utils/darkMode.js')).applyDarkMode(true));
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.quick-actions .action-card')).getPropertyValue('--bg-card').trim() === '#1B2028');
    await page.waitForTimeout(250); // Let the existing 200ms card color transition finish.
    const contrast = await page.locator('.quick-actions .action-card').first().evaluate(el => {
      const ctx = document.createElement('canvas').getContext('2d');
      const luminance = color => {
        ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        const channels = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(n => {
          const s = n / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const style = getComputedStyle(el);
      const a = luminance(getComputedStyle(el.querySelector('h3')).color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    assert.ok(contrast >= 4.5, `${slug} dark Quick Action contrast: ${contrast}`);
    await page.screenshot({ path: `${output}/${slug}-dashboard-dark.png` });
    await page.evaluate(async () => (await import('/src/utils/darkMode.js')).applyDarkMode(false));
  }
  assert.deepEqual(errors, []);
  console.log('PASS: ITSCO host branding, NLU/TISI/ITSCO navigation and dashboard palettes, mobile briefing action, cross-host Superadmin Dashboard navigation, no runtime errors.');
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
