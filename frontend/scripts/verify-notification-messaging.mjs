import { chromium } from 'playwright';
import { answerAppQuestion, ANSWER_READ_TOOLS } from '../../backend/src/services/agents/assistantAnswers.service.js';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.HQ_PREVIEW_URL || 'http://127.0.0.1:5191';
const output = resolve('deliverables/notification-messaging-verification');
await mkdir(output, { recursive: true });
const tenants = [
 { id: 1, slug: 'itsco', name: 'ITSCO', organization_type: 'agency', is_active: true },
 { id: 2, slug: 'nlu', name: 'Next Level Up', organization_type: 'agency', is_active: true },
 { id: 3, slug: 'itsco-book-club', name: 'ITSCO Book Club', organization_type: 'affiliation', club_kind: 'book_club', is_active: true }
];
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
    const notices = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: 'Notice ' + (i + 1), message: 'A recent update for your team.', type: 'test_notice', agency_id: 1, is_read: false, created_at: new Date().toISOString() }));
    const mutations = [], assistantRequests = [], sentMessages = [];
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
        if (path === '/agents/assist') {
          const body = route.request().postDataJSON();
          assistantRequests.push(body);
          data = await answerAppQuestion({
            prompt: body.prompt, history: body.history, agencyId: body.context.agencyId,
            allowedToolNames: ANSWER_READ_TOOLS, detect: async () => null, research: async () => null,
            format: () => 'Verified profile match: Alex Reader',
            execute: async call => ({ ok: true, tool: call.name, result:
              call.name === 'listAcceptingProviders' ? { providers: [{ id: 992, first_name: 'Alex', last_name: 'Reader' }] } :
              call.name === 'listTeamPresence' ? { people: [{ id: 992, name: 'Alex Reader' }] } : {} })
          });
        }
        else if (path === '/chat/threads/direct') data = { threadId: 100, agencyId: 1 };
        else if (/^\/chat\/threads\/\d+\/messages$/.test(path) && route.request().method() === 'POST') { sentMessages.push(route.request().postDataJSON()); data = {}; }
        else if (path === '/notifications/feed') {
          const status = url.searchParams.get('status');
          const rows = notices.filter(n => status === 'read' ? n.is_read : status === 'unread' ? !n.is_read : true);
          const pageNumber = Number(url.searchParams.get('page') || 1);
          data = { items: rows.slice((pageNumber - 1) * 25, pageNumber * 25), unreadCount: notices.filter(n => !n.is_read).length,
            pagination: { page: pageNumber, pageSize: 25, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / 25)) },
            facets: { categories: [{ key: 'account', label: 'Account & Security', count: rows.length }], types: [{ type: 'test_notice', label: 'Team update', count: rows.length }], statuses: {} },
            scopes: { inbox: true, managed: true, team: true } };
        }
        else if (/^\/notifications\/\d+\/state$/.test(path)) {
          const id = Number(path.split('/')[2]), payload = route.request().postDataJSON();
          mutations.push({ id, payload });
          const n = notices.find(n => n.id === id);
          if (payload.read !== undefined) n.is_read = payload.read;
          data = {};
        }
        else if (path.startsWith('/presence/agency/')) data = [{ id: 992, user_id: 992, first_name: 'Alex', last_name: 'Reader', role: 'provider', shared_agency_ids: [1, 3], shared_agency_memberships: [tenants[0], tenants[2]], availability_level: 'available' }];
        else if (path === '/chat/channels') data = { channels: [{ id: 81, thread_id: 81, agency_id: 1, name: 'ITSCO Book Club', slug: 'subscription-book-club', membership_rule: 'book_club_subscribers', visibility: 'private', is_member: true }] };
        else if (path === '/users/me') data = { ...user, loginBootstrap: { authMethod: 'google', sessionId: 'test-session', agencies: tenants, security } };
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
        else if (path.includes('preferences')) data = { theme_preference: theme, dark_mode: theme === 'dark' };
        else if (path.includes('branding')) data = { organization_name: 'Plot Twist Co', organization_logo_url: '/assets/ptco/logo-flat.webp', primary_color: '#B80016' };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      }
      if (url.hostname !== 'plottwisthq.com') return route.abort();
      if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) documents++;
      try { return route.fulfill({ response: await route.fetch({ url: `${base}${url.pathname}${url.search}` }) }); }
      catch { return route.abort(); }
    });
    await page.goto('https://plottwisthq.com/admin?panel=messages');
    await page.locator('.briefing-close').waitFor({ timeout: 60000 });
    await page.locator('.briefing-close').click();
    await page.locator('.briefing-modal').waitFor({ state: 'hidden' });
    await page.locator('.messages-workspace').waitFor();
    await page.getByLabel('Appearance', { exact: true }).selectOption(theme);
    const background = await page.locator('.mw-chat-col').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.ok(theme === 'light' ? background === 'rgb(255, 255, 255)' : background !== 'rgb(255, 255, 255)', background);
    const compose = page.locator('.compose-agency select');
    assert.ok(!(await compose.textContent()).includes('Book Club'));
    await compose.selectOption('1');
    assert.ok(!(await page.locator('.org-header').textContent()).includes('Community Standards'));
    await page.getByRole('button', { name: 'Email reminder settings', exact: true }).waitFor();
    await page.locator('.peer-info-btn').first().hover();
    assert.ok(!(await page.locator('.peer-info-pop').first().textContent()).includes('Book Club'));
    assert.ok(!(await page.locator('.peer-info-pop').first().textContent()).includes('Shown in'));
    assert.ok((await page.locator('.peer-logo img').first().getAttribute('src')).includes('itsco'));
    assert.ok(await page.locator('.peer-logo img').first().evaluate(img => img.complete && img.naturalWidth > 0), 'tenant logo must load');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: output + '/' + name + '-messages.png', fullPage: true });
    await page.getByRole('button', { name: 'Channels', exact: true }).click();
    await page.locator('.channel-row').filter({ hasText: 'ITSCO Book Club' }).waitFor();
    assert.equal(await page.locator('.briefing-modal').count(), 0);
    const themeBeforeAssistant = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.briefing-modal').count(), 0);
    const ask = async (question, expected) => {
      await page.locator('.aap-input').fill(question);
      await page.locator('.aap-send').click();
      await page.locator('.aap-msg.is-assistant').last().filter({ hasText: expected }).waitFor();
      assert.equal(assistantRequests.at(-1).context.answerOnly, true);
      assert.equal(assistantRequests.at(-1).context.agencyId, 1);
      assert.equal(await page.locator('.briefing-modal').count(), 0);
    };
    await ask('Who is accepting clients?', 'Alex Reader');
    await ask('Who is free today?', 'Chat presence does not');
    await ask('How do I submit a reimbursement?', 'Attach the receipt');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), themeBeforeAssistant);
    const answerBg = await page.locator('.aap-msg.is-assistant .aap-msg-bubble').last().evaluate(el => getComputedStyle(el).backgroundColor);
    assert.ok(theme === 'light' ? answerBg === 'rgb(255, 255, 255)' : answerBg !== 'rgb(255, 255, 255)', answerBg);
    await page.waitForTimeout(400);
    const paneHeights = await page.evaluate(() => Object.fromEntries(['.messages-workspace','.mw-list-col','.mw-assistant-host','.aap-root','.aap-drawer','.aap-head','.aap-body','.aap-foot'].map(s => [s, document.querySelector(s)?.getBoundingClientRect().height])));
    assert.ok(paneHeights['.aap-body'] >= 180, JSON.stringify(paneHeights));
    await page.screenshot({ path: output + '/' + name + '-assistant.png', fullPage: true });
    await ask('Send a message to Alex saying Hello Alex', 'Nothing is sent');
    await page.getByRole('button', { name: 'Message Alex Reader', exact: true }).click();
    await page.locator('.composer-wrap textarea').waitFor();
    await page.waitForFunction(() => document.querySelector('.composer-wrap textarea')?.value === 'Hello Alex');
    assert.equal(sentMessages.length, 0);
    await page.screenshot({ path: output + '/' + name + '-draft.png', fullPage: true });
    await page.getByRole('button', { name: 'Command Center', exact: true }).click();
    await page.locator('.briefing-close').waitFor();
    await page.locator('.briefing-close').click();
    await page.locator('.briefing-modal').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.briefing-modal').count(), 0);
    const beforeDocuments = documents;
    await page.evaluate(async () => {
      const app = document.querySelector('#app').__vue_app__;
      await app.config.globalProperties.$router.push('/notifications');
    });
    await page.locator('.notification-row').first().waitFor();
    await page.getByLabel('Select multiple', { exact: true }).check();
    await page.locator('.row-select').nth(0).check();
    await page.locator('.row-select').nth(2).check();
    await page.getByRole('button', { name: 'Mark read', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.results-summary')?.textContent.includes('2 updated'));
    assert.deepEqual(mutations.map(m => m.id).sort((a,b) => a-b), [1,3]);
    await page.getByLabel('Select multiple', { exact: true }).uncheck();
    await page.getByLabel('Snooze notifications').selectOption('snooze1');
    await page.waitForFunction(() => document.querySelector('.results-summary')?.textContent.includes('25 updated'));
    assert.equal(mutations.length, 27);
    await page.getByLabel('Notification status', { exact: true }).selectOption('read');
    await page.waitForFunction(() => document.querySelectorAll('.notification-row').length === 2);
    await page.locator('.unread-card').click();
    await page.waitForFunction(() => document.querySelectorAll('.notification-row').length === 25);
    assert.ok(page.url().includes('/notifications'));
    await page.getByLabel('Reset filters', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.results-summary')?.textContent.includes('of 30'));
    await page.getByLabel('Select multiple', { exact: true }).check();
    await page.getByLabel('Select current page', { exact: true }).check();
    await page.screenshot({ path: output + '/' + name + '-notifications.png', fullPage: true });
    assert.equal(await page.locator('.briefing-modal').count(), 0);
    assert.equal(documents, beforeDocuments);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page overflow');
    assert.deepEqual(errors, []);
    console.log(name + ': messages, subscriptions UI, manual briefing, notification selection and theme PASS');
    await context.close();
  }
} finally { await browser.close(); }
