// Local reader preview; no database, staff records, payroll or external AI.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { referenceSource, referenceMetadata } from '../../backend/src/services/companyReferenceContent.js';
const books = Object.fromEntries(['itsco', 'nlu', 'tisi'].map(slug => {
  const source = referenceSource({ slug }, 'clinical-note-aid-guide');
  return [slug, { metadata: referenceMetadata(source), sections: source.sections, version: { id: 99, version_number: 1, is_draft: 1 } }];
}));
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), optimizeDeps: { entries: [], include: ['vue','dompurify'] }, plugins: [vue(), {
  name: 'clinical-note-aid-preview',
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.split('?')[0] !== '/') return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clinical Note Aid Guide</title></head><body><div id="app"></div><script type="module" src="/@id/__x00__clinical-note-aid-preview"></script></body></html>'));
  }); },
  resolveId(id) { if (['clinical-note-aid-preview', '\0clinical-note-aid-preview', 'clinical-note-aid-books', '\0clinical-note-aid-books'].includes(id)) return '\0' + id.replace(/^\0/, ''); },
  load(id) {
    if (id === '\0clinical-note-aid-books') return `export default ${JSON.stringify(books)};`;
    if (id === '\0clinical-note-aid-preview') return `import {createApp} from 'vue';import Page from '/scripts/ClinicalNoteAidPreview.vue';import '/src/styles/brandTypography.css';createApp(Page).mount('#app');`;
  }
}], server: { host: '127.0.0.1', port: 5196, strictPort: true } });
await server.listen(); console.log('Clinical Note Aid Guide preview: http://127.0.0.1:5196');
