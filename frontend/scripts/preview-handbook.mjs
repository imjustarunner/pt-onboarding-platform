// Local preview of the supplied content using the actual handbook reader.
// No database, employee records or publication. --assistant explicitly enables
// real model requests using the labeled unpublished source and local AI config.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { answerFromHandbook } from '../../backend/src/services/workplaceHandbookAssistant.service.js';
import { companyHandbookSource, documentTemplateCatalog } from '../../backend/src/services/workplaceDocumentTemplates.js';
import { getHandbookSource, handbookMetadata } from '../../backend/src/services/workplaceHandbookContent.js';
import { referenceSource, referenceMetadata } from '../../backend/src/services/companyReferenceContent.js';

const previews = ['itsco', 'nlu', 'isi'].map(slug => {
  const source = getHandbookSource({ slug: slug === 'isi' ? 'tisi' : slug });
  const path = slug === 'itsco' ? '/handbook-preview' : `/${slug}-handbook-preview`;
  return { source, path, virtualId: '\0virtual:' + path.slice(1), handbook: { sections: source.sections, metadata: handbookMetadata(source) } };
});
const companySource = companyHandbookSource({ id: 31, name: 'Cedar Studio', color_palette: { primary: '#223a50', secondary: '#526e62' } }, { id: 1, agency_id: 31, document_key: 'workplace-handbook', template_version: '1.0.0' });
for (const slug of ['itsco', 'nlu', 'isi']) {
  const source = referenceSource({ slug: slug === 'isi' ? 'tisi' : slug }, 'provider-guide');
  const path = `/${slug}-provider-guide-preview`;
  previews.push({ source, path, virtualId: '\0virtual:' + path.slice(1), handbook: { sections: source.sections, metadata: referenceMetadata(source) } });
}
previews.push({ source: companySource, path: '/document-library-preview', virtualId: '\0virtual:document-library-preview', library: true, handbook: { sections: companySource.sections, metadata: handbookMetadata(companySource) } });
const assistantEnabled = process.argv.includes('--assistant');
const assistantVisible = assistantEnabled || process.argv.includes('--assistant-ui');
if (assistantEnabled) createRequire(new URL('../../backend/package.json', import.meta.url))('dotenv').config({ path: fileURLToPath(new URL('../../backend/.env', import.meta.url)) });
let answering = false;
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../', import.meta.url)),
  optimizeDeps: { entries: [], include: ['vue', 'dompurify'] },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  plugins: [vue(), {
    name: 'handbook-local-preview',
    configureServer(previewServer) {
for (const { source, path, handbook } of previews) {
previewServer.middlewares.use(path + '-answer', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if ((!assistantEnabled || source.template) || req.method !== 'POST' || req.headers.origin !== 'http://127.0.0.1:5181') { res.statusCode = 403; res.end(JSON.stringify({ error: { message: 'Local assistant preview is not enabled for this request.' } })); return; }
  if (answering) { res.statusCode = 429; res.end(JSON.stringify({ error: { message: 'Please wait for the current answer.' } })); return; }
  try {
    answering = true;
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 12000) throw Object.assign(new Error('Question is too long.'), { status: 400 }); }
    const { question, history } = JSON.parse(body);
    const answer = await answerFromHandbook({ handbook, question, history, preview: true });
    res.end(JSON.stringify(answer));
  } catch (error) { res.statusCode = error.status || 503; res.end(JSON.stringify({ error: { message: error.status === 400 ? error.message : 'The preview answer is temporarily unavailable.' } })); }
  finally { answering = false; }
});
previewServer.middlewares.use(path, async (req, res, next) => {
  try {
    const html = await previewServer.transformIndexHtml(path, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${source.organization} · ${source.documentKey === 'provider-guide' ? 'Provider’s Guide' : 'Workplace Handbook'}</title><style>*{box-sizing:border-box}body{margin:0;background:#e9ede5;font-family:Arial,Helvetica,sans-serif}main{max-width:1250px;margin:36px auto;padding:0 24px}header.preview-label{max-width:1202px;margin:24px auto 0;padding:0 24px;color:#56704e;font-size:12px;letter-spacing:.06em}@media(max-width:600px){main{padding:0 12px;margin:16px auto}header.preview-label{padding:0 16px}}</style></head><body><header class="preview-label">${source.organization} / PEOPLE OPERATIONS / ${source.documentKey === 'provider-guide' ? 'PROVIDER’S GUIDE' : 'WORKPLACE HANDBOOK'}</header><main id="app"></main><script type="module" src="/@id/__x00__virtual:${path.slice(1)}"></script></body></html>`);
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  } catch (error) { next(error); }
});
}
    },
    resolveId(id) { return previews.find(p => id === p.virtualId || id === p.virtualId.slice(1))?.virtualId; },
    load(id) {
      const preview = previews.find(p => p.virtualId === id);
      if (!preview) return;
      const { handbook, source, path } = preview;
      if (preview.library) return `import { createApp, h } from 'vue'; import '/src/styles/brandTypography.css'; import Preview from '/scripts/DocumentLibraryPreview.vue'; createApp({ render: () => h(Preview, { catalog: ${JSON.stringify(documentTemplateCatalog()).replace(/</g, '\\u003c')}, handbook: ${JSON.stringify(handbook).replace(/</g, '\\u003c')} }) }).mount('#app');`;
      return `import { createApp, h } from 'vue'; import '/src/styles/brandTypography.css'; import Preview from '/scripts/HandbookPreview.vue'; const handbook = ${JSON.stringify(handbook).replace(/</g, '\\u003c')}; const updates = ${JSON.stringify(source.reviewUpdates || []).replace(/</g, '\\u003c')}; createApp({ render: () => h(Preview, { handbook, updates, assistantEnabled: ${assistantVisible}, assistantLive: ${assistantEnabled}, answerEndpoint: ${JSON.stringify(path + '-answer')} }) }).mount('#app');`;
    }
  }],
  server: { host: '127.0.0.1', port: 5181, strictPort: true, hmr: false }
});

await server.listen();
for (const { source, path } of previews) console.log(`${source.organization} preview: http://127.0.0.1:5181${path}`);
