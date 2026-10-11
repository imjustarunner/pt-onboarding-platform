// Local source preview. No database, real publication or external AI calls.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { referenceSource, referenceMetadata } from '../../backend/src/services/companyReferenceContent.js';
import { getHandbookSource, handbookMetadata } from '../../backend/src/services/workplaceHandbookContent.js';
import { handbookAnswerSources } from '../../backend/src/services/workplaceHandbookAssistant.service.js';

const source = referenceSource({ slug: 'itsco' }, 'school-practice-guide');
const school = { sections: source.sections, metadata: referenceMetadata(source) };
const provider = referenceSource({ slug: 'itsco' }, 'provider-guide');
const handbook = getHandbookSource({ slug: 'itsco' });
const books = {
  school,
  provider: { sections: provider.sections, metadata: referenceMetadata(provider) },
  handbook: { sections: handbook.sections, metadata: handbookMetadata(handbook) }
};
const server = await createServer({
  configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
  optimizeDeps: { entries: [], include: ['vue', 'dompurify'] },
  plugins: [vue(), {
    name: 'local-school-guide-preview',
    configureServer(vite) {
      vite.middlewares.use('/school-preview-answer', async (req, res) => {
        res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'POST' || req.headers.origin !== 'http://127.0.0.1:5183') { res.statusCode = 403; res.end('{}'); return; }
        let body = '';
        try {
          for await (const chunk of req) { body += chunk; if (body.length > 12000) throw new Error('Too long'); }
          const question = String(JSON.parse(body).question || '');
          const slug = /billable|billing|check-in/i.test(question) ? 'treatment-plan-acknowledgment' : /clos|weather/i.test(question) ? 'school-closures-and-provider-absence' : /new student/i.test(question) ? 'provider-readiness-checklist' : null;
          const section = handbookAnswerSources(school).find(s => s.slug === slug);
          const passage = section?.passages?.[0];
          res.end(JSON.stringify({ status: passage ? 'answered' : 'not_found', message: passage ? null : 'This local interface demo supports the three sample questions. Live AI is not enabled.', version: { preview: true }, paragraphs: passage ? [{ text: 'Interface demonstration only — open this source section to review the procedure.', citations: [{ slug, title: section.title, path: section.path, quote: passage.text }] }] : [] }));
        } catch { res.statusCode = 400; res.end('{}'); }
      });
      vite.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1:5183');
        const key = ['/', '/school-practice-guide-preview'].includes(url.pathname) ? 'school' : url.pathname === '/handbook-preview' ? 'handbook' : url.pathname === '/library' && url.searchParams.get('companyDocument') === 'provider-guide' ? 'provider' : null;
        if (!key) return next();
        try {
          const html = await vite.transformIndexHtml(url.pathname, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ITSCO · School Practice Guide preview</title><style>*{box-sizing:border-box}body{margin:0;background:#e9ede5}main{max-width:1360px;margin:28px auto;padding:0 24px}.preview-label{max-width:1360px;margin:24px auto 0;padding:0 24px;font:12px/1.8 Arial,sans-serif;color:#4b6554}@media(max-width:600px){main{padding:0 12px;margin:16px auto}}</style></head><body><p class="preview-label">ITSCO / COMPANY DOCUMENT LIBRARY / LOCAL PREVIEW · NOT PUBLISHED</p><main id="app"></main><script type="module" src="/@id/__x00__school-preview:${key}"></script></body></html>`);
          res.setHeader('Content-Type', 'text/html'); res.end(html);
        } catch (e) { next(e); }
      });
    },
    resolveId(id) { return id.startsWith('school-preview:') ? '\0' + id : id.startsWith('\0school-preview:') ? id : null; },
    load(id) {
      if (!id.startsWith('\0school-preview:')) return;
      const key = id.split(':')[1]; if (!books[key]) return;
      return `import { createApp, h } from 'vue'; import '/src/styles/brandTypography.css'; import Preview from '/scripts/HandbookPreview.vue'; createApp({ render: () => h(Preview, { handbook: ${JSON.stringify(books[key]).replace(/</g, '\\u003c')}, updates: [], assistantEnabled: ${key === 'school'}, assistantLive: false, answerEndpoint: '/school-preview-answer' }) }).mount('#app');`;
    }
  }],
  server: { host: '127.0.0.1', port: 5183, strictPort: true, hmr: false }
});
await server.listen();
console.log('ITSCO School Practice Guide: http://127.0.0.1:5183/school-practice-guide-preview');
