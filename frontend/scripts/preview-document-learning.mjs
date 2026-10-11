// Local UI fixture only. No database writes, real payroll, or external AI.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { referenceSource, referenceMetadata } from '../../backend/src/services/companyReferenceContent.js';
import { trainingDefinitionsFor, requiredTrainingKeys, learnerDefinition, gradeDocumentQuiz } from '../../backend/src/services/documentTrainingContent.js';
import { handbookAnswerSources } from '../../backend/src/services/workplaceHandbookAssistant.service.js';
const port = Number(process.env.DOCUMENT_LEARNING_PREVIEW_PORT || 5184);
const origin = `http://127.0.0.1:${port}`;
const companies = [{ id: 2, slug: 'itsco' }, { id: 12, slug: 'nlu' }, { id: 22, slug: 'tisi' }];
const definitions = Object.fromEntries(companies.map(c => [c.id, Object.fromEntries(trainingDefinitionsFor(c).map(d => [d.documentKey, d]))]));
const books = Object.fromEntries(companies.map(company => [company.id, Object.fromEntries(trainingDefinitionsFor(company).map((d, index) => { const s = referenceSource(company, d.documentKey); return [d.documentKey, { metadata: referenceMetadata(s), sections: s.sections, version: { id: company.id * 100 + index, version_number: 1, is_draft: 0 } }]; }))]));
const previewLearner = { role: process.env.DOCUMENT_LEARNING_PREVIEW_ROLE || 'provider', status: 'ONBOARDING' };
const enrollments = [], attempts = new Map();
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), optimizeDeps: { entries: [], include: ['vue', 'vue-router', 'pinia', 'axios', 'dompurify'] }, plugins: [vue(), {
  name: 'local-document-learning-preview',
  configureServer(vite) {
    vite.middlewares.use('/preview-api', async (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      if (req.headers.origin && req.headers.origin !== origin) { res.statusCode = 403; return res.end('{}'); }
      let raw = ''; try {
        for await (const chunk of req) { raw += chunk; if (raw.length > 20000) throw new Error('Too long'); }
        const body = raw ? JSON.parse(raw) : {}, url = new URL(req.url, origin), path = url.pathname;
        const agencyId = Number(body.agencyId || url.searchParams.get('agencyId') || 2), company = companies.find(c => c.id === agencyId);
        if (!company) throw new Error('Unknown preview company');
        const send = value => res.end(JSON.stringify(value));
        if (path === '/public/marketing-pages/nlu') return send({ page: { slug: 'nlu', branding: {} } });
        if (path === '/public/marketing-pages/partners') return send({ partners: [] });
        if (path.startsWith('/public/')) return send({ providers: [], resources: [] });
        if (path === '/reset' && req.method === 'POST') { enrollments.length = 0; attempts.clear(); return send({ reset: true }); }
        if (path === '/document-learning') return send({ expectedSchoolWork: company.slug === 'itsco', courses: trainingDefinitionsFor(company).map(d => ({ key: d.documentKey, title: d.title, description: d.description, status: 'ready', version: books[agencyId][d.documentKey].version, questionCount: d.questions.length, readingCount: d.requiredSections.length, onboardingRequired: requiredTrainingKeys(company, previewLearner).includes(d.documentKey), enrollments: enrollments.filter(r => r.agency_id === agencyId && r.document_key === d.documentKey).toReversed() })) });
        const start = path.match(/^\/document-learning\/courses\/([a-z-]+)\/start$/);
        if (start && req.method === 'POST' && books[agencyId][start[1]]) { const key = start[1]; const previous = enrollments.find(r => r.agency_id === agencyId && r.document_key === key && (body.purpose === 'onboarding' ? r.purpose === 'onboarding' : r.requestKey === body.requestKey)); if (previous) return send({ id: previous.id }); const id = enrollments.length + 1; enrollments.push({ id, agency_id: agencyId, document_key: key, purpose: body.purpose === 'onboarding' ? 'onboarding' : 'practice', status: 'in_progress', version_id: books[agencyId][key].version.id, requestKey: body.requestKey, readSections: [] }); return send({ id }); }
        const match = path.match(/^\/document-learning\/enrollments\/(\d+)(?:\/(\w+))?$/);
        const record = match && enrollments.find(r => r.agency_id === agencyId && r.id === Number(match[1]));
        if (!record) { res.statusCode = 404; return send({ error: { message: 'Preview lesson not found.' } }); }
        const def = definitions[agencyId][record.document_key], book = books[agencyId][record.document_key], paid = record.purpose !== 'practice';
        if (req.method === 'GET') return send({ ...record, key: record.document_key, paid, onboardingTime: paid, definition: learnerDefinition(def), book, attempts: [...(attempts.get(record.id) || [])].reverse(), time: [] });
        if (match[2] === 'reading') { if (!def.requiredSections.includes(body.slug)) throw new Error('Unknown reading section'); record.readSections = [...new Set([...record.readSections, body.slug])]; return send({ readSections: record.readSections }); }
        if (match[2] === 'quiz') { if (def.requiredSections.some(s => !record.readSections.includes(s))) throw new Error('Review all core sections'); const saved = attempts.get(record.id) || []; const previous = saved.find(r => r.requestKey === body.requestKey); if (previous) return send(previous); const result = { id: saved.length + 1, requestKey: body.requestKey, ...gradeDocumentQuiz(def, body.answers) }; saved.push(result); attempts.set(record.id, saved); if (result.passed) record.status = 'completed'; return send(result); }
        if (match[2] === 'heartbeat') return send({ tracking: paid && body.active, creditedSeconds: 0, paid });
        if (match[2] === 'time') return send({ message: 'Preview only: no payroll claim created.', claimIds: [] });
        if (match[2] === 'answer') { const source = handbookAnswerSources(book).find(s => s.slug === def.questions[0].sourceSlug); return send({ status: 'answered', version: { number: 1 }, paragraphs: [{ text: 'Local interface demonstration. Use this source passage to review the procedure.', citations: [{ slug: source.slug, title: source.title, path: source.path, quote: source.passages[0].text }] }] }); }
        throw new Error('Unknown preview operation');
      } catch(e) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: e.message } })); }
    });
    vite.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, origin), path = url.pathname;
      if (path !== '/' && !/^\/(itsco|nlu|tisi)\/my-learning$/.test(path) && !/^\/p\/nlu(?:\/[a-z-]+)?$/.test(path)) return next();
      try { const html = await vite.transformIndexHtml(path, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Company guide learning preview</title></head><body><div id="app"></div><script type="module" src="/@id/__x00__document-learning-preview"></script></body></html>'); res.setHeader('Content-Type', 'text/html'); res.end(html); } catch(e) { next(e); }
    });
  },
  resolveId(id) { return ['document-learning-preview', '\0document-learning-preview'].includes(id) ? '\0document-learning-preview' : null; },
  load(id) { if (id !== '\0document-learning-preview') return; return `import { createApp, h } from 'vue'; import { createPinia } from 'pinia'; import { createRouter, createWebHistory, RouterView } from 'vue-router'; import '/src/styles/brandTypography.css'; import Preview from '/scripts/DocumentLearningPreview.vue'; import Website from '/src/views/public/NluPublicWebsite.vue'; import api from '/src/services/api'; api.defaults.baseURL='/preview-api'; const router = createRouter({history:createWebHistory(),routes:[{path:'/p/nlu/:section?',component:Website},{path:'/:organizationSlug/my-learning',component:Preview},{path:'/',component:Preview}]});createApp({render:()=>h(RouterView)}).use(createPinia()).use(router).mount('#app');`; }
}], server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
await server.listen(); console.log(`Local learning preview: ${origin}/itsco/my-learning`);
