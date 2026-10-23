// Run from frontend: node scripts/check-messages-layout.mjs
// Real messaging components and production CSS, synthetic account, no live API calls.
import { createServer } from 'vite';
import { parse, compileStyle } from '@vue/compiler-sfc';
import { chromium } from 'playwright';
import { readFileSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const layoutCss = ['DashboardView.vue', 'admin/CommunicationsCenterView.vue'].map(file => {
  const { descriptor } = parse(readFileSync(new URL('../src/views/' + file, import.meta.url), 'utf8'));
  return descriptor.styles.map(style => compileStyle({ source: style.content, id: 'data-v-layout', scoped: true }).code).join('\n');
}).join('\n');
const app = `
import { createApp, ref, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Chats from '/src/views/admin/PlatformChatsView.vue';
import Hub from '/src/components/messages/MessagesHubShell.vue';
import { useAuthStore } from '/src/store/auth.js';
import { useAgencyStore } from '/src/store/agency.js';
import '/src/style.css';
import '/src/styles/conversa.css';
const pinia = createPinia();
useAuthStore(pinia).user = { id: 5, role: 'provider' };
useAgencyStore(pinia).currentAgency = { id: 2, name: 'Layout test' };
useAgencyStore(pinia).userAgencies = [{ id: 2 }];
const router = createRouter({ history: createMemoryHistory(), routes: [{path: '/', component: {render:()=>null}}] });
const mode = ref('dashboard');
window.messagesLayout = { mode };
const box = (cls, children, style) => h('div', { class: cls, 'data-v-layout': '', style }, children);
createApp({ setup: () => () => {
  if (mode.value === 'drawer') return box('', [h(Hub, {layout:'drawer'})], 'height:calc(100dvh - 24px);display:flex');
  if (mode.value === 'standalone') return h(Chats);
  if (mode.value === 'communications') return box('cc-messages-host', [h(Hub)]);
  return box('dashboard-detail', [box('', ['Dashboard header'], 'height:320px'),
    box('card-content card-content--messages-hub', [box('my-panel dashboard-embedded-view', [h(Chats)])])]);
}}).use(pinia).use(router).mount('#app');`;

const server = await createServer({
  configFile: new URL('../vite.config.js', import.meta.url).pathname,
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  cacheDir: new URL('../.vite-messages-layout', import.meta.url).pathname,
  resolve: { dedupe: ['vue', 'pinia', 'vue-router'] },
  optimizeDeps: { include: ['vue', 'pinia', 'vue-router'] },
  plugins: [{ name: 'messages-layout-fixture', enforce: 'pre',
    configureServer(server) {
      server.middlewares.use('/messages-check', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/messages-check', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + layoutCss + '</style></head><body><div id="app" class="conversa-app"></div><script type="module">' + app + '</script></body></html>'));
      });
    }
  }]
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
  const items = Array.from({length:80}, (_,i)=>({id:i+1, conversationId:i+1, channel:'email', kind:'email', displayName:'Test sender '+i, subject:'Layout test '+i, preview:'Synthetic message', sortAt:'2026-10-23'}));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = /\/messages\/hub\/(inbox|unread)$/.test(path) ? {items}
      : /\/communications\/conversations\/\d+$/.test(path) ? {conversation:{id:1,channel:'email',subject:'Layout test'},messages:[{id:1,body_text:'Synthetic long email. '.repeat(1000),from_email:'test@example.org'}]} : {};
    return route.fulfill({json});
  });
  await page.goto('http://127.0.0.1:5188/messages-check');
  await page.locator('.msg-hub-body').waitFor({timeout:10000});
  for (const viewport of [{width:1440,height:650}, {width:1440,height:1000}, {width:1904,height:1400}, {width:390,height:700}, {width:700,height:500}]) {
    await page.setViewportSize(viewport);
    for (const mode of ['dashboard', 'standalone', 'communications', 'drawer']) {
      await page.evaluate(mode => { window.messagesLayout.mode.value = mode; }, mode);
      await page.locator('.msg-hub-body').waitFor({timeout:10000});
      const size = await page.locator('.msg-hub-body').evaluate(el => {
        const r = el.getBoundingClientRect();
        const hub = el.closest('.msg-hub').getBoundingClientRect();
        const host = el.closest('.chats-view, .cc-messages-host')?.getBoundingClientRect();
        return {height:r.height, bottom:r.bottom, hubBottom:hub.bottom, hostBottom:host?.bottom, hubHeight:hub.height};
      });
      console.log(JSON.stringify({viewport, mode, ...size}));
      if (mode === 'drawer') assert.ok(size.hubHeight <= viewport.height, 'Drawer must stay within viewport');
      else {
        assert.ok(size.height >= 360, mode + ' leaves too little space for the inbox: ' + size.height);
        assert.ok(size.height < Math.max(1200, viewport.height), 'Long inbox must not stretch the page');
      }
      const list = page.locator('.msg-hub-list');
      await page.locator('.msg-hub-row').first().waitFor({timeout:5000});
      assert.ok(await list.evaluate(el => el.scrollHeight > el.clientHeight && el.clientHeight > 0), 'Inbox should scroll within its pane');
      assert.ok(size.bottom <= size.hubBottom + 1, 'Inbox extends outside hub');
      if (size.hostBottom) assert.ok(size.bottom <= size.hostBottom + 1, 'Inbox is clipped by page host');
      await page.locator('.msg-hub-body').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('.msg-hub-body').isVisible());
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(() => { window.messagesLayout.mode.value = 'dashboard'; });
  await page.reload();
  await page.locator('.msg-hub-body').waitFor({timeout:10000});
  assert.ok(await page.locator('.msg-hub-body').evaluate(el => el.clientHeight >= 360));
  await page.locator('.msg-hub-row').first().click();
  await page.getByRole('button', {name:'Full screen', exact:true}).click();
  assert.ok(await page.locator('.reader-fullscreen').evaluate(el => el.getBoundingClientRect().height <= window.innerHeight));
  await page.keyboard.press('Escape');
  await page.locator('.reader-fullscreen').waitFor({state:'detached'});
  assert.ok(await page.locator('.msg-hub-body').evaluate(el => el.clientHeight >= 360));
  assert.deepEqual(errors, []);
  console.log('PASS: dashboard, standalone, communications, drawer, five viewport sizes, 80-message scrolling, reopening, and full screen');
} finally {
  await browser?.close();
  await server.close();
  rmSync(new URL('../.vite-messages-layout', import.meta.url), {recursive:true, force:true});
}
