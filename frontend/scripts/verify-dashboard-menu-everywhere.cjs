// Local browser regression using fictional accounts and mocked API responses only.
// Start Vite on port 5186, then run: node scripts/verify-dashboard-menu-everywhere.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');

const origin = process.env.DASHBOARD_NAV_ORIGIN || 'http://127.0.0.1:5186';
const artifacts = process.env.DASHBOARD_NAV_ARTIFACTS || '/tmp/dashboard-menu-everywhere-20261103';
fs.mkdirSync(artifacts, { recursive: true });
const dashboardIcons = Object.fromEntries([
  'checklist', 'momentum_list', 'training', 'documents', 'my_account', 'my_schedule',
  'clients', 'submit', 'staff', 'notifications', 'supervision', 'clinical_note_generator'
].map(key => [`my_dashboard_${key}_icon_path`, '/assets/plotline/icon.svg']));
const agency = {
  id: 2, name: 'Example Practice', slug: 'example', portal_url: 'example',
  organization_type: 'agency', is_active: 1,
  feature_flags: { clinicalChartEnabled: true, schoolPortalsEnabled: true },
  color_palette: { primary: '#247252', secondary: '#183a37', accent: '#247252' },
  ...dashboardIcons
};
const user = {
  id: 99999, role: 'super_admin', status: 'ACTIVE_EMPLOYEE',
  first_name: 'Example', last_name: 'Employee', has_provider_access: true,
  has_supervisor_privileges: true, has_clinical_supervision: true,
  created_at: '2026-10-01T00:00:00Z',
  capabilities: { canViewTraining: true, canSignDocuments: true, canViewClients: true, canViewLibrary: true },
  agencies: [agency]
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const report = { cases: [], errors: [], artifacts };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ url: page.url(), message: error.message, stack: error.stack }));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
      const p = url.pathname;
      let data = {};
      if (p.includes('auth/me')) data = { user, agencies: [agency] };
      else if (p === `/api/users/${user.id}`) data = user;
      else if (/session-lock-config|session-activity/.test(p)) data = { session: { phase: 'active', serverNow: Date.now(), lastActivityAt: Date.now(), lockAt: Date.now() + 600000, expiresAt: Date.now() + 1200000, activityVersion: 1 } };
      else if (p.includes('onboarding-checklist')) data = { completionPercentage: 100 };
      else if (p.includes('platform-branding')) data = { organization_name: 'Example', primary_color: '#247252', ...dashboardIcons };
      else if (p.includes('preferences')) data = {};
      else if (/\/billing\/\d+\/addons$/.test(p)) data = { momentumList: true };
      else if (p === '/api/agencies' || p.includes('/agencies') && p.includes('/users/')) data = [agency];
      else if (p === `/api/agencies/${agency.id}`) data = agency;
      else if (p.includes('by-slug') || p.includes('/portal/')) data = { agency, organization: agency, colorPalette: agency.color_palette, portalUrl: agency.slug };
      else if (p === '/api/clinical-notes/work-queue') data = { items: [] };
      else if (p === '/api/office-schedule/usage-reviews') data = { items: [] };
      else if (p === '/api/me/notes-to-sign') data = { notes: [], isSupervisor: true };
      else if (p.includes('my-history-status')) data = { hasClinicalSupervision: true };
      else if (p.includes('provider-clinical-focus')) data = { groups: [], clinicalFocus: {} };
      else if (p.includes('schedule-summary')) data = { scheduleEvents: [], supervisionSessions: [], officeEvents: [], busyBlocks: [] };
      else if (p.includes('meeting-invitations')) data = { prompts: [] };
      else if (p.includes('user-nav/shortcuts')) data = { shortcuts: [] };
      else if (p === '/api/library/resources' || p === '/api/library/folders') data = [];
      else if (p.includes('/staff/directory')) data = { staff: [] };
      else if (/modules|documents|payroll|training|progress|certificates|presence|people|threads|notifications|messages|tickets|tasks|agencies|icons|departments|categories|reviews|programs|users|company-events/.test(p)) data = [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(origin + '/login');
    async function saveIdentity() {
      await page.evaluate(async ({ user, agency }) => {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('userAgencies', JSON.stringify([agency]));
        localStorage.setItem('currentAgency', JSON.stringify(agency));
        const { dashboardLearningTips } = await import('/src/tutorial/dashboardLearningTips.js');
        localStorage.setItem(`dashboard.learning.v1:${user.id}`, JSON.stringify({ firstSeen: Date.now(), understood: dashboardLearningTips.map(tip => tip.id) }));
      }, { user, agency });
    }
    const menu = page.getByRole('navigation', { name: 'My Dashboard sections' });
    const trigger = page.locator('[data-testid="desktop-dashboard-menu-trigger"]');
    async function openMenu() {
      await trigger.waitFor({ timeout: 60000 });
      await page.mouse.move(1400, 900);
      if (!await menu.count()) await trigger.click();
      await menu.waitFor();
    }
    async function checkMenu(name) {
      const startUrl = page.url();
      await openMenu();
      await menu.getByRole('button', { name: 'Messages', exact: true }).waitFor();
      await menu.getByRole('button', { name: 'My Work', exact: false }).waitFor();
      const labels = await menu.locator('.dashboard-nav-label').allTextContents();
      for (const expected of ['Overview', 'My Account', 'My Schedule', 'My Meetings', 'Note Workspace', 'Messages', 'Submit', 'Tools and Resources', 'Notifications', 'Supervision', 'My Training', 'My Clients', 'Staff']) {
        assert(labels.includes(expected), `${name}: missing ${expected}; got ${labels.join(', ')}`);
      }
      assert(page.url() === startUrl, `${name}: opening menu navigated away`);
      const images = await menu.locator('img').count();
      assert(images >= 8, `${name}: expected branded icons, got ${images}`);
      const box = await menu.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 1000, `${name}: dropdown exceeds viewport`);
      await page.screenshot({ path: `${artifacts}/${name}.png` });
      report.cases.push({ name, url: page.url(), labels, images });
      return labels;
    }

    for (const role of ['super_admin', 'provider']) {
      user.role = role;
      await saveIdentity();
      const byRoute = {};
      for (const path of role === 'super_admin' ? ['admin', 'my-schedule', 'dashboard', 'library'] : ['my-schedule', 'dashboard', 'library']) {
        await page.goto(`${origin}/${agency.slug}/${path}`);
        byRoute[path] = await checkMenu(`${role}-${path}-cold`);
        await page.keyboard.press('Escape');
        if (path === 'my-schedule') {
          await page.reload();
          await checkMenu(`${role}-my-schedule-reload`);
          await page.keyboard.press('Escape');
        }
        if (path === 'dashboard') {
          const sidebar = await page.locator('[data-card-id][data-label]').evaluateAll(elements => elements.map(el => el.dataset.label));
          assert(JSON.stringify(byRoute[path]) === JSON.stringify(sidebar), `${role}: menu order differs from dashboard sidebar`);
        }
      }
      for (const [path, labels] of Object.entries(byRoute)) {
        assert(JSON.stringify(labels) === JSON.stringify(byRoute.dashboard), `${role}: ${path} menu differs from dashboard menu`);
      }
      await openMenu();
      await menu.getByRole('button', { name: /^Tools and Resources/ }).click();
      await menu.getByRole('button', { name: 'Expand Library', exact: true }).click();
      await menu.getByRole('button', { name: 'My Files', exact: true }).click();
      await page.waitForURL(`**/${agency.slug}/library?section=mine`);
      await openMenu();
      await menu.getByRole('button', { name: 'My Account', exact: true }).click();
      await page.waitForURL(url => url.searchParams.get('tab') === 'my' && !url.searchParams.has('dashboardCard'));
      await openMenu();
      await menu.getByRole('button', { name: 'My Schedule', exact: true }).click();
      await page.waitForURL(url => (url.pathname.endsWith('/my-schedule') || url.searchParams.get('tab') === 'my_schedule') && !url.searchParams.has('dashboardCard'));
      await checkMenu(`${role}-after-navigation`);
      await page.keyboard.press('Escape');
    }

    // A separate account/tenant must get freshly gated destinations and labels.
    user.id = 88888;
    user.role = 'support';
    user.has_supervisor_privileges = false;
    user.has_clinical_supervision = false;
    user.capabilities.canViewLibrary = false;
    agency.id = 3;
    agency.slug = agency.portal_url = 'other';
    await saveIdentity();
    await page.goto(`${origin}/other/admin`);
    await openMenu();
    await menu.getByRole('button', { name: 'Messages', exact: true }).waitFor();
    await menu.getByRole('button', { name: /^Tools and Resources/ }).click();
    assert(!await menu.getByRole('button', { name: 'Library', exact: true }).count(), 'New account must not retain prior Library capability');
    assert(!await menu.getByRole('button', { name: 'Supervision', exact: true }).count(), 'New account must not retain prior supervisor capability');
    await menu.getByRole('button', { name: 'My Account', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/other/dashboard' && url.searchParams.get('tab') === 'my' && !url.searchParams.has('dashboardCard'));
    report.cases.push({ name: 'changed-account-and-tenant', url: page.url() });
    fs.writeFileSync(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
    assert(!report.errors.length, `Browser errors: ${report.errors.map(error => `${error.url}: ${error.message}`).join('; ')}`);
    console.log(JSON.stringify({ passed: report.cases.length, errors: report.errors, artifacts }, null, 2));
  } catch (error) {
    const failedPage = browser.contexts()[0]?.pages()[0];
    if (failedPage) {
      report.lastUrl = failedPage.url();
      report.lastMenuLabels = await failedPage.locator('.dashboard-nav-label').allTextContents().catch(() => []);
      await failedPage.screenshot({ path: `${artifacts}/failure.png` }).catch(() => {});
    }
    fs.writeFileSync(`${artifacts}/report.json`, JSON.stringify({ ...report, failure: error.message }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
