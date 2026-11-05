// Real Vue components with synthetic provider data; no live login or patient data.
// Run: node scripts/test-provider-startup.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../frontend/', import.meta.url));
const output = fileURLToPath(new URL('../deliverables/login-performance-2026-11-04/provider/', import.meta.url));
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Arial,sans-serif;color:#172b3a;background:#f6f8fa}*{box-sizing:border-box}.qa-shell{padding:20px;max-width:1440px;margin:auto}.qa-brand{display:flex;align-items:center;gap:16px;margin-bottom:20px}.qa-brand img{width:52px;height:52px;object-fit:contain}.qa-icons{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.qa-icons a{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;color:inherit;text-decoration:none;background:white}.qa-icons img{width:24px;height:24px;object-fit:contain}button{font:inherit}</style>
</head><body><div id="fixture"></div><script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import {createPinia,setActivePinia} from 'pinia';
import {createRouter,createMemoryHistory} from 'vue-router';
import Overview from '/src/components/dashboard/DashboardOverviewHome.vue';
import {useAuthStore} from '/src/store/auth.js';
import {useAgencyStore} from '/src/store/agency.js';
import {useBrandingStore} from '/src/store/branding.js';
const pinia=createPinia();setActivePinia(pinia);
const auth=useAuthStore(),agencies=useAgencyStore(),branding=useBrandingStore();
const signedIn=ref(false);const keys=['my_schedule','clients','communications'];
branding.portalHostPortalUrl='itsco';
await branding.fetchAgencyTheme('itsco');
const agency={id:2,slug:'itsco',name:'ITSCO',organization_type:'agency',color_palette:{primary:'#245a3f',secondary:'#34495e',accent:'#245a3f'},my_dashboard_my_schedule_icon_id:91,my_dashboard_clients_icon_id:92,my_dashboard_communications_icon_id:93};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboard',component:{template:'<div />'}}]});await router.push('/dashboard');
const start=async()=>{await branding.prepareDashboardIcons();auth.setAuth(null,{id:7,role:'provider',firstName:'Test',status:'ACTIVE_EMPLOYEE'});agencies.currentAgency=agency;agencies.agencies=[agency];agencies.userAgencies=[agency];signedIn.value=true;};
createApp({setup(){return()=>h('main',{class:'qa-shell'},[
 h('header',{class:'qa-brand'},[h('img',{src:'/assets/itsco/logo.png',alt:'ITSCO'}),h('strong','Provider workspace — synthetic data')]),
 signedIn.value?h('div',[
  h('nav',{class:'qa-icons','aria-label':'Provider shortcuts'},keys.map((key,i)=>h('a',{href:'#',onClick:e=>e.preventDefault()},[h('img',{src:branding.getDashboardCardIconUrl(key),alt:''}),['My schedule','Clients','Communications'][i]]))),
  h(Overview,{agencyId:2,showSchedule:true,showPayroll:true,showNotes:true,showClaims:true,showMySupervision:true,enabled:true})
 ]):h('button',{id:'open-workspace',onClick:start},'Open provider workspace')
]);}}).use(pinia).use(router).mount('#fixture');
window.fixture={ready:true};
</script></body></html>`;

const server = await createServer({ root, configFile: `${root}/vite.config.js`, cacheDir: process.env.PROVIDER_QA_CACHE_DIR,
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'provider-startup-fixture', configureServer(s) {
    s.middlewares.use((req, res, next) => {
      if (req.url !== '/__provider_startup_test__') return next();
      res.setHeader('Content-Type', 'text/html');
      s.transformIndexHtml(req.url, html).then(result => res.end(result)).catch(next);
    });
  } }]
});
let browser;
let passed = false;
const results = [];
try {
  await fs.mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], calls = [];
    let releasePay = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const apiAt = url.pathname.indexOf('/api/');
      if (apiAt < 0) return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
      const path = url.pathname.slice(apiAt + 4); calls.push(path);
      let data = [];
      if (path.includes('/theme')) data = { agencyName: 'ITSCO', colorPalette: { primary: '#245a3f' }, dashboardIcons: {
        fields: { my_dashboard_my_schedule_icon_id: 91, my_dashboard_clients_icon_id: 92, my_dashboard_communications_icon_id: 93 }, pathsById: { 91: '/assets/conversa/icons/message-types/scheduled.svg', 92: '/assets/conversa/icons/message-types/internal-message.svg', 93: '/assets/conversa/icons/message-types/channel.svg' }
      } };
      else if (path.endsWith('/schedule-summary')) {
        const start = new Date(); start.setHours(14, 0, 0, 0);
        data = { scheduleEvents: [{ id: 1, title: 'Provider planning session', startAt: start.toISOString(), endAt: new Date(+start + 3600000).toISOString() }] };
        await new Promise(resolve => setTimeout(resolve, 150));
      } else if (path === '/payroll/me/dashboard-summary' && !releasePay) {
        // Leave only payroll unresolved. Its real Axios timeout must produce a local retry.
        return;
      } else if (path === '/payroll/me/dashboard-summary') data = { lastPaycheck: null };
      else if (path === '/notifications/counts') data = { 2: 0 };
      else if (path.includes('preferences')) data = {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }).catch(() => {});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__provider_startup_test__`);
    await page.waitForFunction(() => window.fixture?.ready);
    // Open immediately, as fast SSO can. Use the real bounded artwork handoff.
    const started = Date.now();
    await page.locator('#open-workspace').click();
    await page.getByText('Provider planning session', { exact: true }).waitFor();
    const scheduleReadyMs = Date.now() - started;
    const readyIcons = await page.locator('.qa-icons img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0));
    assert(readyIcons, `${name}: dashboard artwork was not ready`);
    assert.equal(await page.locator('[data-tour="dash-overview-pay"]').getByText('Loading pay period…').count(), 1);
    assert(!calls.some(path => /^\/icons\//.test(path)), 'Per-icon API waterfall returned');
    assert(!calls.includes('/payroll/me/pto-balances'), 'Optional balances loaded during startup');
    const scheduleBox = await page.locator('.ov-mid-schedule').boundingBox();
    const workBox = await page.locator('.overview-work').boundingBox();
    assert(scheduleBox.y <= workBox.y, 'Default schedule follows optional work');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert(!overflow, `${name}: horizontal overflow`);
    await page.screenshot({ path: `${output}/${name}-schedule-ready.png`, fullPage: true });
    const pay = page.locator('[data-tour="dash-overview-pay"]');
    await pay.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 15000 });
    assert.equal(await page.getByText('Provider planning session', { exact: true }).count(), 1);
    const callsBeforeRetry = calls.length;
    releasePay = true;
    await pay.getByRole('button', { name: 'Try again' }).click();
    await pay.getByRole('button', { name: 'Open Payroll' }).waitFor();
    assert(!calls.slice(callsBeforeRetry).some(path => path.endsWith('/schedule-summary')), 'Retry restarted the schedule');
    assert.equal(await page.getByText('Well below average', { exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/${name}-recovered.png`, fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ viewport: name, scheduleReadyMs, iconsReadyAtDashboard: readyIcons, perIconApiRequests: 0, payrollTimeoutRetryPassed: true, horizontalOverflow: overflow });
    await context.close();
  }
  await fs.writeFile(`${output}/browser-results.json`, JSON.stringify({ scope: 'Synthetic provider component checks; not production login timings', results }, null, 2));
  console.log(JSON.stringify(results));
  passed = true;
} finally {
  // The app's dev plugins can retain timers/sockets after their watcher closes.
  // Bound cleanup of this dedicated test process, preserving a failed exit code.
  const shutdown = setTimeout(() => process.exit(passed ? 0 : 1), 5000);
  await browser?.close();
  await server.close();
  clearTimeout(shutdown);
}
