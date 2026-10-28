// Native date controls need a browser check: jsdom cannot catch invisible inputs.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

const fixture = `
import { createApp, h, reactive } from 'vue';
import AppointmentEditorShell from '/src/components/schedule/AppointmentEditorShell.vue';
const state = reactive({ date: '2026-10-29', disabled: false });
window.dateCheck = state;
createApp({ setup: () => () => h(AppointmentEditorShell, {
  title: 'Edit meeting — Check In', dateYmd: state.date,
  startTime: '13:00', endTime: '14:30', timezoneLabel: 'Mountain Time (MT)',
  tenantLabel: 'Test agency', providerName: 'Test host', disabled: state.disabled,
  showType: false, showStatus: false, showLocation: false, showRoom: false,
  'onUpdate:dateYmd': value => state.date = value
}) }).mount('#app');
`;

const server = await createServer({
  configFile: false,
  root: new URL('..', import.meta.url).pathname,
  plugins: [vue(), {
    name: 'appointment-date-fixture',
    resolveId(id) { if (id === '/appointment-date-check.js') return '\0appointment-date-check'; },
    load(id) { if (id === '\0appointment-date-check') return fixture; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/appointment-date-check') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/appointment-date-check', `
          <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
          <style>body{margin:16px;font-family:Arial}#app{max-width:900px}</style></head>
          <body><div id="app"></div><script type="module" src="/appointment-date-check.js"></script></body></html>
        `));
      });
    }
  }],
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  optimizeDeps: { entries: [], include: ['vue'] }
});

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome', timeout: 20000 });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.goto(`${server.resolvedUrls.local[0]}appointment-date-check`);
    const date = page.locator('input[aria-label="Appointment date"]');
    await date.waitFor();
    const visible = await date.evaluate(input => ({
      opacity: getComputedStyle(input).opacity,
      inViewport: input.getBoundingClientRect().right <= window.innerWidth
    }));
    assert.equal(visible.opacity, '1', 'The editable date must be visible');
    assert.equal(visible.inViewport, true);

    await date.evaluate(input => {
      const showPicker = input.showPicker.bind(input);
      window.pickerOpened = 0;
      input.showPicker = () => { showPicker(); window.pickerOpened++; };
    });
    await date.click({ position: { x: 30, y: 15 } });
    assert.equal(await page.evaluate(() => window.pickerOpened), 1, 'Clicking the date text opens its picker');
    await page.keyboard.press('Escape');
    await date.fill('2026-11-02');
    await date.press('Tab');
    assert.equal(await page.evaluate(() => window.dateCheck.date), '2026-11-02');
    assert.deepEqual(await page.locator('input[type="time"]').evaluateAll(inputs => inputs.map(input => input.value)), ['13:00', '14:30']);

    for (const mode of ['missing', 'restricted']) {
      await date.evaluate((input, mode) => {
        input.showPicker = mode === 'missing' ? undefined : () => { throw new DOMException('Picker unavailable', 'NotAllowedError'); };
      }, mode);
      await date.click({ position: { x: 30, y: 15 } });
      await date.fill(mode === 'missing' ? '2026-11-03' : '2026-11-04');
      await date.press('Tab');
      assert.equal(await page.evaluate(() => window.dateCheck.date), mode === 'missing' ? '2026-11-03' : '2026-11-04');
    }
    await page.evaluate(() => { window.dateCheck.disabled = true; });
    assert.equal(await date.isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log(`Appointment date passed at ${viewport.width}px: visible, picker opens, edits propagate, fallback works, disabled respected.`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
