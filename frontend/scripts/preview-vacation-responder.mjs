// Synthetic settings only; no database or email delivery.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { vacationTemplates, VACATION_SOURCES } from '../../backend/src/services/vacationResponderPolicy.js';
const origin = 'http://127.0.0.1:5194';
const fixture = { agencyName: 'ITSCO', providerName: 'Alex Morgan', personalInboxReady: true, agencyAutoRepliesEnabled: true, defaults: { templates: vacationTemplates(), supportContact: 'support@itsco.health' }, config: { enabled: false, state: 'off', plannedOutId: null, endsAt: null, timeZone: 'America/Denver', templateKey: 'provider_colorado_springs', messageTemplate: '' }, plannedOuts: [{ id: 4, status: 'approved', allDay: true, start: '2026-12-21', end: '2026-12-29' }], canManageDefaults: true, sources: VACATION_SOURCES, sourcesReviewedAt: '2026-10-10' };
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), optimizeDeps: { entries: [], include: ['vue','pinia','axios'] }, plugins: [vue(), {
  name: 'vacation-preview',
  configureServer(vite) {
    vite.middlewares.use('/preview-api', async (req,res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.origin && req.headers.origin !== origin) { res.statusCode = 403; return res.end('{}'); }
      let raw = ''; for await (const chunk of req) raw += chunk;
      if (req.method === 'PUT') {
        const body = JSON.parse(raw || '{}');
        if (req.url.endsWith('/defaults')) { fixture.defaults = { templates: body.templates, supportContact: body.supportContact }; }
        else fixture.config = { ...fixture.config, ...body, state: body.enabled ? 'waiting' : 'off' };
      }
      res.end(JSON.stringify(fixture));
    });
    vite.middlewares.use(async (req,res,next) => {
      if (req.url !== '/') return next();
      res.setHeader('Content-Type','text/html');
      res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vacation responder preview</title></head><body><div id="app"></div><script type="module" src="/@id/__x00__vacation-preview"></script></body></html>'));
    });
  },
  resolveId(id) { return ['vacation-preview','\0vacation-preview'].includes(id) ? '\0vacation-preview' : null; },
  load(id) {
    if (id !== '\0vacation-preview') return;
    return `import {createApp,h} from 'vue'; import {createPinia} from 'pinia'; import Component from '/src/components/communications/VacationResponderSettings.vue'; import api from '/src/services/api'; api.defaults.baseURL='/preview-api'; document.body.style.cssText='background:#edf2ec;font-family:Arial,sans-serif;margin:0;padding:24px;';createApp({render:()=>h('main',{style:'max-width:1000px;margin:auto'},[h('p','Local preview · Synthetic account · No email is sent'),h(Component,{agencyId:2})])}).use(createPinia()).mount('#app');`;
  }
}], server: { host: '127.0.0.1', port: 5194, strictPort: true, hmr: false } });
await server.listen(); console.log(origin);
