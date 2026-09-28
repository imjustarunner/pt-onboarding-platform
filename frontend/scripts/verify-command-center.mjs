import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.HQ_PREVIEW_URL || 'http://127.0.0.1:5190';
const output = resolve('deliverables/command-center-verification');
await mkdir(output, { recursive: true });
const tenants = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, slug: `tenant-${i + 1}`, name: `Organization ${i + 1}`, organization_type: 'agency', is_active: true }));
const user = { id: 991, role: 'super_admin', status: 'active', firstName: 'Test', email: 'test@example.invalid', agencies: tenants };
const start = Date.now() + 3600000;
const meeting = { id: 81, kind: 'TEAM_MEETING', title: 'Weekly planning meeting', description: 'Review staffing and upcoming priorities.', startAt: new Date(start).toISOString(), endAt: new Date(start + 3600000).toISOString(), appJoinUrl: '/join/test-meeting' };
const tasks = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, title: `Assigned task ${i + 1}`, status: 'pending', due_date: '2020-01-01', description: `Task ${i + 1} instructions`, created_at: new Date(Date.now() - i * 60000).toISOString() }));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const [name, width, height, theme] of [['desktop', 1440, 1000, 'light'], ['desktop-dark', 1440, 1000, 'dark'], ['mobile', 390, 844, 'light'], ['mobile-dark', 390, 844, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
    await context.addInitScript(({ user, tenants }) => {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userAgencies', JSON.stringify(tenants));
      localStorage.setItem('pt.tenantLastVisited:991', JSON.stringify({ 23: 200, 14: 100 }));
      sessionStorage.setItem('justLoggedIn', 'true');
      sessionStorage.setItem('justLoggedInAt', String(Date.now()));
    }, { user, tenants });
    const page = await context.newPage();
    const errors = [];
    let briefingLoads = 0, documents = 0;
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        const path = url.pathname.slice(4);
        const security = { policy: { useLockScreen: true, effectiveTimeoutMinutes: 120 }, session: { activityVersion: Date.now(), lastActivityAt: Date.now(), serverNow: Date.now(), lockAt: Date.now() + 3600000, expiresAt: Date.now() + 7200000, phase: 'active' } };
        let data = [];
        if (path === '/users/me') data = { ...user, loginBootstrap: { authMethod: 'google', sessionId: 'test-session', agencies: tenants, security } };
        else if (path === '/auth/session-lock-config') data = security;
        else if (path === '/agencies') { briefingLoads++; data = tenants; }
        else if (path === '/agencies/resolve') data = { portalUrl: null };
        else if (path === '/notifications/counts') data = { _total: 4 };
        else if (path === '/notifications') data = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, title: `Notification ${i + 1}`, message: `Notification ${i + 1} full message`, created_at: new Date().toISOString() }));
        else if (path === '/tasks') data = tasks;
        else if (/^\/tasks\/\d+$/.test(path)) data = tasks.find(t => t.id === Number(path.split('/').pop()));
        else if (path === '/support-tickets') data = url.searchParams.get('ticketKind') === 'escalation' ? [] : [{ id: 91, subject: 'Account access request', priority: 'high', description: 'Review the access request.' }];
        else if (path === '/support-tickets/91/messages') data = { ticket: { id: 91, description: 'Review the access request.' }, messages: [{ id: 1, author_first_name: 'Alex', body: 'Please check my permissions.' }] };
        else if (path.endsWith('/schedule-summary')) data = { scheduleEvents: [meeting], supervisionSessions: [] };
        else if (path === '/team-meetings/81/workspace') data = { participants: [{ userId: 991, name: 'Test Admin', isHost: true }, { userId: 992, name: 'Alex' }], workspace: { focusTitle: 'Planning', goals: [{ id: 'goal', text: 'Review staffing plan' }], actionItems: [{ id: 'action', text: 'Confirm coverage', done: false }] } };
        else if (path.includes('preferences')) data = {};
        else if (path.includes('branding')) data = { organization_name: 'Plot Twist Co', organization_logo_url: '/assets/ptco/logo-flat.webp', primary_color: '#B80016' };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      }
      if (url.hostname !== 'plottwisthq.com') return route.abort();
      if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) documents++;
      try { return route.fulfill({ response: await route.fetch({ url: `${base}${url.pathname}${url.search}` }) }); }
      catch { return route.abort(); }
    });
    await page.goto('https://plottwisthq.com/admin');
    await page.locator('.urgent-card').waitFor({ timeout: 60000 });
    await page.locator('.meeting-details').waitFor();
    if (theme === 'dark') await page.evaluate(async () => (await import('/src/utils/darkMode.js')).applyDarkMode(true));
    const initialUrl = page.url();
    const loadCount = briefingLoads;
    const initialDocuments = documents;
    assert.equal(await page.locator('.tenant-launcher').count(), 24);
    assert.equal(await page.locator('.tenant-launcher').first().getAttribute('title'), 'Organization 23');
    assert.ok(await page.locator('.tenant-launchers').evaluate(el => el.scrollWidth > el.clientWidth));
    await page.locator('[aria-label="Scroll tenants right"]').click();
    await page.waitForFunction(() => document.querySelector('.tenant-launchers').scrollLeft > 10);
    await page.locator('.tenant-launcher').last().focus();
    await page.locator('.tenant-launcher').last().scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.tenant-launcher').last().isVisible());
    assert.ok(await page.locator('.briefing-modal').evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.screenshot({ path: `${output}/${name}-tenants.png` });
    await page.locator('.tenant-launcher').first().scrollIntoViewIfNeeded();
    await page.locator('.briefing-modal').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${output}/${name}-overview.png` });

    await page.locator('.meeting-details').click();
    await page.getByText('Review staffing plan', { exact: true }).waitFor();
    assert.equal(page.url(), initialUrl);
    assert.equal(await page.locator('.detail-join').getAttribute('target'), '_blank');
    await page.screenshot({ path: `${output}/${name}-meeting.png` });
    await page.locator('.browser-back').click();
    await page.locator('.briefing-card--slate .briefing-item').first().click();
    await page.getByText('Notification 1 full message', { exact: true }).waitFor();
    await page.locator('.browser-back').click();
    await page.locator('.briefing-card--orange .briefing-item').click();
    await page.getByText('Please check my permissions.', { exact: true }).waitFor();
    await page.locator('.browser-back').click();
    await page.locator('.urgent-card').click();
    assert.equal(await page.locator('.browser-item').count(), 20);
    await page.locator('.browser-more').click();
    assert.equal(await page.locator('.browser-item').count(), 26);
    await page.locator('.browser-item').filter({ hasText: 'Assigned task 25' }).click();
    await page.getByText('Task 25 instructions', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/${name}-task.png` });
    await page.locator('.browser-back').click();
    assert.equal(await page.locator('.browser-item').count(), 26);
    await page.locator('.browser-back').click();
    assert.equal(page.url(), initialUrl);
    assert.equal(briefingLoads, loadCount);
    assert.equal(documents, initialDocuments, 'In-place browsing never reloads the document');
    await page.locator('.briefing-card--green .card-link').first().click();
    await page.locator('.browser-full').click();
    await page.waitForURL('https://plottwisthq.com/tasks');
    await page.locator('.briefing-modal').waitFor({ state: 'hidden' });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.briefing-modal').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`PASS: desktop/mobile light/dark, 24 scrollable MRU tenants, inline meeting/notification/ticket/task details, urgent pagination, Back, and full-page dismissal. Screenshots: ${output}`);
} finally { await browser.close(); }
