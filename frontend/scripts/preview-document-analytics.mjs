// Synthetic browser fixture only; never connects to the application database.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { referenceSource, referenceMetadata } from '../../backend/src/services/companyReferenceContent.js';
const origin = 'http://127.0.0.1:5191';
const records = [], sources = Object.fromEntries([['itsco', 2], ['nlu', 12]].map(([slug, id]) => { const source = referenceSource({ slug }, 'service-documentation-standards'); return [id, { metadata: referenceMetadata(source), sections: source.sections, version: { id: id * 100, version_number: 1, is_draft: 0 } }]; }));
function report(agencyId, params) {
  const title = agencyId === 2 ? 'Service Documentation Standards' : 'NLU · Service Documentation Standards';
  const question = 'How should I document a caregiver-only visit?';
  return { agencyId, summary: { readers: 12, opens: 31, activeSeconds: 4380, clicks: 17, questions: 8, helpful: 9, notHelpful: 2 }, collectionStartedAt: '2026-10-10T08:00:00Z', documentKey: params.get('documentKey'),
    documents: [{ documentKey: 'service-documentation-standards', title, coverage: 'Native document activity', readers: 12, opens: 31, activeSeconds: 4380, clicks: 17, questions: 8, helpful: 9, notHelpful: 2 }],
    people: [{ userId: 81, name: 'Avery Chen · Sample', opens: 3, activeSeconds: 450, questions: 2, lastSeen: '2026-10-10T16:00:00Z' }, { userId: 82, name: 'Jordan Lee · Sample', opens: 2, activeSeconds: 255, questions: 1, lastSeen: '2026-10-10T15:00:00Z' }],
    sections: [{ documentKey: 'service-documentation-standards', title: 'Every service note · The essential record', visits: 19, activeSeconds: 1590, helpful: 9, notHelpful: 2 }],
    links: [{ label: 'Provider’s Guide', target: 'document:provider-guide', clicks: 9, readers: 7 }],
    questions: [{ id: 1, userId: 81, name: 'Avery Chen · Sample', document: title, versionId: agencyId * 100, question, status: 'answered', surface: 'onboarding', askedAt: '2026-10-10T16:00:00Z' }, { id: 2, name: 'Jordan Lee · Sample', document: title, question: 'Where can I find the correction process?', status: 'answered', surface: 'library', askedAt: '2026-10-10T15:00:00Z' }],
    surfaces: [{ surface: 'library', opens: 18, readers: 9, activeSeconds: 2000, questions: 5 }, { surface: 'onboarding', opens: 13, readers: 5, activeSeconds: 2380, questions: 3 }],
    activity: [{ id: 11, name: 'Avery Chen · Sample', document: title, versionId: agencyId * 100, type: 'link', surface: 'onboarding', section: 'purpose-and-use', label: 'Provider’s Guide', target: 'document:provider-guide', at: '2026-10-10T16:00:00Z' }], hasMore: {}, limitations: ['Synthetic preview activity, not staff usage.', 'Active time is estimated and does not prove comprehension or paid work.', 'External sites expose only opening clicks, not their internal activity.'] };
}
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), plugins: [vue(), {
  name: 'document-analytics-preview',
  configureServer(vite) {
    vite.middlewares.use('/preview-api', async (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      try {
        const url = new URL(req.url, origin); let raw = ''; for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : {}, agencyId = Number(body.agencyId || url.searchParams.get('agencyId') || 2);
        const send = value => res.end(JSON.stringify(value));
        if (url.pathname === '/preview/book') return send(sources[agencyId]);
        if (url.pathname === '/document-analytics/report') return send(report(agencyId, url.searchParams));
        if (url.pathname === '/document-analytics/sessions') { records.push({ endpoint: 'session', ...body }); return send({ sessionId: body.sessionId, coverage: 'native' }); }
        if (url.pathname === '/document-analytics/events') { records.push({ endpoint: 'event', ...body }); return send({ recorded: true }); }
        if (url.pathname === '/preview/events') return send(records);
        if (url.pathname === '/preview/answer') { records.push({ endpoint: 'question', ...body }); return send({ status: 'answered', paragraphs: [{ text: 'State that the client was absent and attribute the caregiver’s report.', citations: [{ slug: 'mental-status-and-assessment', title: 'Current mental status, diagnosis and assessment', quote: 'If the client was absent, state that the client was not directly assessed and identify the collateral source and limitation.' }] }] }); }
        res.statusCode = 404; return send({ error: { message: 'Preview route not found.' } });
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: e.message } })); }
    });
    vite.middlewares.use(async (req, res, next) => {
      if (req.url.split('?')[0] !== '/') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Library statistics preview</title></head><body><div id="app"></div><script type="module" src="/@id/__x00__analytics-preview"></script></body></html>'));
    });
  },
  resolveId(id) { if (['analytics-preview', '\0analytics-preview'].includes(id)) return '\0analytics-preview'; },
  load(id) { if (id === '\0analytics-preview') return `import {createApp,h} from 'vue';import {createPinia} from 'pinia';import {createRouter,createWebHistory,RouterView} from 'vue-router';import Page from '/scripts/DocumentAnalyticsPreview.vue';import '/src/styles/brandTypography.css';import api from '/src/services/api';api.defaults.baseURL='/preview-api';const router=createRouter({history:createWebHistory(),routes:[{path:'/',component:Page}]});createApp({render:()=>h(RouterView)}).use(createPinia()).use(router).mount('#app');`; }
}], server: { host: '127.0.0.1', port: 5191, strictPort: true, hmr: false } });
await server.listen(); console.log(`Library statistics preview: ${origin}`);
