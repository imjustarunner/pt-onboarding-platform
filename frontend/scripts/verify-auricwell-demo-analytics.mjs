// Browser-only smoke test. Every API request is intercepted; no real analytics or clinical data is written.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '../../node_modules/playwright/index.mjs';

const base = (process.env.AURICWELL_DEMO_ANALYTICS_BASE || process.env.AURICWELL_DEMO_BASE || 'http://127.0.0.1:5194').replace(/\/$/, '');
const origin = new URL(base).origin;
const endpoint = '/api/public/marketing-pages/auricwell/analytics/events';
const secrets = ['AW_ANALYTICS_PRIVATE_SEARCH_20261103', 'AW_ANALYTICS_PRIVATE_NOTE_20261103', 'AW_ANALYTICS_PRIVATE_QUERY_20261103'];
const fakeNames = ['Emerson Cole', 'Morgan Rivera', 'Avery Lane', 'Tessa Brooks', 'Milo Chen', 'Rowan Ellis'];
const summary = { base, status: 'RUNNING', demo: {}, website: {}, exclusions: {} };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function until(predicate, message) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { assert(Date.now() < deadline, message); await new Promise(resolve => setTimeout(resolve, 50)); }
}
async function settleObservedLayout(page) {
  // Let the collector's 150ms mutation scan register a newly opened drawer first.
  // Native layout/IntersectionObserver delivery is not synchronous with page.clock.
  await page.clock.runFor(500);
  await new Promise(resolve => setTimeout(resolve, 150));
  const painted = page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.clock.runFor(100);
  await painted;
  await new Promise(resolve => setTimeout(resolve, 100));
}
async function setupContext(privacy) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Denver', serviceWorkers: 'block' });
  if (privacy) await context.addInitScript(({ dnt, gpc }) => {
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, get: () => dnt ? '1' : '0' });
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, get: () => gpc });
  }, privacy);
  const batches = [], blocked = [], errors = [];
  await context.route('**/api/**', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && url.pathname === endpoint && !url.search && !url.hash && request.method() === 'POST') {
      batches.push(request.postDataJSON());
      return route.fulfill({ status: 204 });
    }
    blocked.push({ path: url.pathname, method: request.method() });
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  assert(page.clock?.install && page.clock?.runFor, 'This smoke test requires Playwright page.clock.install/runFor; upgrade the shared Playwright before running it.');
  // Install before app code so performance.now(), heartbeat timers and idle timers share one clock.
  await page.clock.install();
  const events = () => batches.flatMap(batch => batch.events || []);
  return { context, page, batches, blocked, errors, events };
}
function checkPayloads(batches, { demoOnly = false } = {}) {
  for (const batch of batches) {
    assert.match(batch.visitorId, /^[a-f0-9-]{36}$/i);
    for (const event of batch.events) {
      assert.match(event.pagePath, demoOnly ? /^\/p\/auricwell\/demo\/(overview|appointments|clients|documentation|billing|providers|reports)$/ : /^\/p\/auricwell(?:\/(product|security|about|contact)|\/demo\/(overview|appointments|clients|documentation|billing|providers|reports))?$/);
      assert.match(event.targetKey, /^page(?:\/[a-z0-9_.:-]+)*$/);
      for (const field of Object.keys(event)) assert(['eventId', 'pagePath', 'kind', 'targetKey', 'label', 'device', 'language', 'source', 'durationMs'].includes(field), `Unexpected event field: ${field}`);
      if (event.kind.endsWith('_time')) assert(Number.isSafeInteger(event.durationMs) && event.durationMs > 0 && event.durationMs <= 60000);
      if (event.pagePath.includes('/demo/')) {
        const text = JSON.stringify(event);
        for (const token of [...secrets, ...fakeNames]) assert(!text.includes(token), `Private/demo content reached analytics: ${token}`);
        assert(!/[?&#]|(?:^|[/:])99012[1-8](?:$|[/?])/.test(event.pagePath + event.targetKey), 'Route queries and record IDs must not enter analytics keys');
      }
    }
  }
}

try {
  const run = await setupContext();
  try {
    await run.page.goto(`${base}/auricwell/demo?qa=${secrets[2]}#/meadowbrook/clients?client=990121&noteId=990141`);
    await run.page.locator('.client-table tbody tr').first().waitFor();
    await run.page.bringToFront();
    // Real pointer interaction and focus keep this stable in a headless browser.
    await run.page.getByRole('heading', { name: 'Clients', exact: true }).click();
    const search = run.page.getByLabel('Find a client');
    await search.fill(secrets[0]); await search.press('Tab');
    await search.fill(''); await search.press('Tab');
    await run.page.getByRole('button', { name: 'Quick look for Emerson Cole', exact: true }).click();
    await run.page.locator('[data-analytics-area="client-quick-look"]').waitFor({ state: 'visible' });
    await settleObservedLayout(run.page);
    // Probe unknown labels directly; the emitted label must come from the fixed generic action catalog.
    await run.page.evaluate(token => {
      const button = document.createElement('button');
      button.textContent = token; button.setAttribute('aria-label', token);
      button.dataset.analyticsId = token; button.dataset.analyticsLabel = token;
      (document.querySelector('.aw-demo dialog[open]') || document.querySelector('.aw-demo')).append(button); button.click(); button.remove();
    }, secrets[1]);
    await run.page.clock.runFor(16001);
    await until(() => run.events().some(event => event.kind === 'page_time') && run.events().some(event => event.kind === 'section_time'), 'Expected visible active page and section time after the 15-second heartbeat');
    assert(run.events().some(event => event.kind === 'page_view' && event.pagePath === '/p/auricwell/demo/clients'));
    assert(run.events().some(event => event.targetKey === 'page/action/client-quick-look-open'));
    assert(run.events().some(event => event.kind === 'search' && event.targetKey === 'page/action/client-search'));
    assert(run.events().some(event => event.targetKey === 'page/action/demo-control' && event.label === 'Explore a demo control'));
    assert(run.events().some(event => event.kind === 'section_time' && event.targetKey === 'page/client-quick-look'),
      `Quick-look duration missing; its recorded event kinds were ${JSON.stringify(run.events().filter(event => event.targetKey === 'page/client-quick-look').map(event => event.kind))}`);
    await run.page.keyboard.press('Escape');
    await run.page.getByRole('navigation', { name: 'Practice navigation' }).getByRole('link', { name: 'Providers', exact: true }).click();
    await run.page.locator('.staff-card').first().waitFor();
    await run.page.clock.runFor(3100);
    await until(() => run.events().some(event => event.kind === 'page_view' && event.pagePath === '/p/auricwell/demo/providers'), 'Expected canonical provider navigation view');
    assert(run.events().some(event => event.targetKey === 'page/action/nav-providers'));
    checkPayloads(run.batches, { demoOnly: true });
    assert.deepEqual(run.blocked, [], 'The public demo must make zero clinical/auth API requests');
    summary.demo = { events: run.events().length, pages: [...new Set(run.events().map(event => event.pagePath))], timedEvents: run.events().filter(event => event.kind.endsWith('_time')).length, clinicalRequests: 0 };
    const websiteStart = run.batches.length;
    for (const section of ['home', 'product', 'security', 'about', 'contact']) {
      const expected = `/p/auricwell${section === 'home' ? '' : '/' + section}`;
      await run.page.goto(`${base}/auricwell/${section === 'home' ? '' : section}`);
      await run.page.getByRole('heading', { level: 1 }).first().waitFor();
      await run.page.clock.runFor(3100);
      await until(() => run.events().some(event => event.kind === 'page_view' && event.pagePath === expected), `Missing website page view: ${expected}`);
      summary.website[section] = 'PASS';
    }
    checkPayloads(run.batches.slice(websiteStart));
    // Contact's existing configuration GET is deliberately aborted; no inquiry is submitted.
    assert(run.blocked.every(request => request.method === 'GET' && request.path === '/api/public/agency-support/auricwell'), 'Unexpected API call from a marketing page');
    assert.deepEqual(run.errors, []);
  } finally { await run.context.close(); }

  for (const [name, privacy] of [['DNT', { dnt: true, gpc: false }], ['GPC', { dnt: false, gpc: true }]]) {
    const run = await setupContext(privacy);
    try {
      await run.page.goto(`${base}/auricwell/demo#/meadowbrook/clients`);
      await run.page.locator('.client-table tbody tr').first().waitFor();
      await run.page.getByRole('button', { name: 'Quick look for Emerson Cole', exact: true }).click();
      await run.page.clock.runFor(16001);
      await run.page.goto(`${base}/auricwell/security`);
      await run.page.getByRole('heading', { level: 1 }).first().waitFor();
      await run.page.clock.runFor(3100);
      const sentinel = new URL('/__auricwell_analytics_storage_check', origin).href;
      await run.context.route(sentinel, route => route.fulfill({ contentType: 'text/html', body: '<p>Storage check</p>' }));
      await run.page.goto(sentinel);
      assert.equal(await run.page.evaluate(() => localStorage.getItem('publicWebsiteVisitor')), null, `${name} must not create a persistent analytics identifier`);
      assert.deepEqual(run.batches, [], `${name} must suppress all analytics requests`);
      assert.deepEqual(run.blocked, []); assert.deepEqual(run.errors, []);
      summary.exclusions[name] = 'PASS';
    } finally { await run.context.close(); }
  }
  summary.status = 'PASS';
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  summary.status = 'FAIL'; summary.error = error.message;
  console.error(JSON.stringify(summary, null, 2));
  throw error;
} finally {
  if (process.env.AURICWELL_ANALYTICS_REPORT) {
    mkdirSync(dirname(process.env.AURICWELL_ANALYTICS_REPORT), { recursive: true });
    writeFileSync(process.env.AURICWELL_ANALYTICS_REPORT, JSON.stringify(summary, null, 2) + '\n');
  }
  await browser.close();
}
