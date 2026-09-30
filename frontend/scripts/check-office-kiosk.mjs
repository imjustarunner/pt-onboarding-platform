import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const output = new URL('../../deliverables/office-kiosk-verification/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const fixture = `import { createApp } from '/node_modules/.vite/deps/vue.js';
import { createPinia } from '/node_modules/.vite/deps/pinia.js';
import { createRouter, createWebHistory } from '/node_modules/.vite/deps/vue-router.js';
import Kiosk from '/src/views/KioskWelcomeView.vue';
const router = createRouter({ history: createWebHistory(), routes: [{ path: '/kiosk-check', component: Kiosk }] });
createApp(Kiosk, { locationId: 3 }).use(createPinia()).use(router).mount('#app');`;
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname,
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  plugins: [{ name: 'office-kiosk-fixture', configureServer(server) {
    server.middlewares.use('/kiosk-check', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/kiosk-check', `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}</style></head><body><div id="app"></div><script type="module">${fixture}</script></body></html>`));
    });
  } }]
});
const providers = [
  { id: 7, firstName: 'Jordan', lastName: 'Rivera', credential: 'LPC', agencyName: 'Inner Strength Counseling', status: 'active_now', currentRoomNumber: '201' },
  { id: 8, firstName: 'Alex', lastName: 'Morgan', credential: 'LCSW', agencyName: 'Inner Strength Counseling', status: 'active_now', currentRoomNumber: '202' },
  { id: 9, firstName: 'Sam', lastName: 'Chen', credential: 'LMFT', agencyName: 'Next Level Up', status: 'upcoming', nextSlotAt: '2026-09-29 15:00:00', currentRoomNumber: '204' },
  { id: 10, firstName: 'Taylor', lastName: 'Brooks', credential: 'LPC', agencyName: 'Inner Strength Counseling', status: 'upcoming', nextSlotAt: '2026-09-29 16:00:00', currentRoomNumber: '203' }
];
const rooms = [201, 202, 203, 204].map((number, index) => ({ id: number, roomNumber: number, name: ['Aspen', 'Willow', 'Juniper', 'Sage'][index], assignments: [
  { providerName: `${providers[index].firstName} ${providers[index].lastName}`, startAt: '2026-09-29 14:00:00', endAt: '2026-09-29 15:00:00', status: 'current' },
  { providerName: 'Casey Parker', startAt: '2026-09-29 16:00:00', endAt: '2026-09-29 18:00:00', status: 'upcoming' }
] }));
let browser;
try {
  await server.listen(); browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, timezoneId: 'Pacific/Honolulu' });
  const errors = []; const submissions = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/providers-today')) data = { providers, locationName: 'North Office', timezone: 'America/Denver' };
    if (path.endsWith('/office-directory')) data = { rooms };
    if (path.endsWith('/slots-today')) data = { slots: [14, 15, 16].map(hour => ({ eventId: hour, startAt: `2026-09-29 ${hour}:00:00`, roomNumber: '201' })) };
    if (path.endsWith('/checkin')) { submissions.push(route.request().postDataJSON()); data = { ok: true, notification: { inApp: true, email: 'not_requested' } }; }
    return route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:5188/kiosk-check');
  await page.getByRole('button', { name: /Jordan Rivera/ }).waitFor();
  await page.screenshot({ path: output + 'desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Office directory', exact: true }).click();
  await page.getByText('Aspen', { exact: true }).waitFor();
  await page.screenshot({ path: output + 'directory.png', fullPage: true });
  await page.getByRole('button', { name: /Provider check-in/ }).click();
  await page.getByRole('button', { name: /Jordan Rivera/ }).click();
  await page.getByRole('button', { name: /2:00 PM Office 201/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.screenshot({ path: output + 'confirm.png', fullPage: true });
  await page.getByRole('button', { name: 'I’m here · Check in' }).click();
  await page.getByText('You’re checked in.', { exact: true }).waitFor();
  assert.deepEqual(submissions, [{ eventId: 14, providerId: 7 }]);
  await page.screenshot({ path: output + 'success.png', fullPage: true });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  for (const [label, width, height] of [['tablet', 768, 1024], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await page.getByRole('button', { name: /Jordan Rivera/ }).waitFor();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    assert.equal(await page.locator('.lobby-header').count(), 1);
    await page.screenshot({ path: output + label + '.png', fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} overflow`);
  }
  assert.deepEqual(errors, []);
  console.log('Office kiosk browser checks passed: provider → time → confirmation → success; directory; responsive layout; device timezone independent.');
} finally { await browser?.close(); await server.close(); }
