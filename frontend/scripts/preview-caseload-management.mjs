// Local reader preview; no database, staff records, payroll or external AI.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { referenceSource, referenceMetadata } from '../../backend/src/services/companyReferenceContent.js';
const books = Object.fromEntries(['itsco', 'nlu', 'tisi'].map(slug => {
  const source = referenceSource({ slug }, 'caseload-management-sop');
  return [slug, { metadata: referenceMetadata(source), sections: source.sections, version: { id: 99, version_number: 1, is_draft: 1 } }];
}));
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), optimizeDeps: { entries: [], include: ['vue','dompurify'] }, plugins: [vue(), {
  name: 'caseload-sop-preview',
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.split('?')[0] !== '/') return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Caseload Management SOP</title></head><body><div id="app"></div><script type="module" src="/@id/__x00__caseload-sop-preview"></script></body></html>'));
  }); },
  resolveId(id) { if (['caseload-sop-preview', '\0caseload-sop-preview', 'caseload-sop-books', '\0caseload-sop-books'].includes(id)) return '\0' + id.replace(/^\0/, ''); },
  load(id) {
    if (id === '\0caseload-sop-books') return `export default ${JSON.stringify(books)};`;
    if (id === '\0caseload-sop-preview') return `import {createApp} from 'vue';import Page from '/scripts/CaseloadManagementPreview.vue';import '/src/styles/brandTypography.css';createApp(Page).mount('#app');`;
  }
}], server: { host: '127.0.0.1', port: 5195, strictPort: true } });
await server.listen(); console.log('Caseload Management SOP preview: http://127.0.0.1:5195');
