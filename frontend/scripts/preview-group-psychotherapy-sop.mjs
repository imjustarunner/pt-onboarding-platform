// Local reader preview; no database, staff records, payroll or external AI.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { referenceSource, referenceMetadata } from '../../backend/src/services/companyReferenceContent.js';
const books = Object.fromEntries(['itsco', 'nlu', 'tisi'].map(slug => {
  const source = referenceSource({ slug }, 'group-psychotherapy-sop');
  return [slug, { metadata: referenceMetadata(source), sections: source.sections, version: { id: 99, version_number: 1, is_draft: 1 } }];
}));
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), plugins: [vue(), {
  name: 'group-sop-preview',
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.split('?')[0] !== '/') return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Group Psychotherapy SOP</title></head><body><div id="app"></div><script type="module" src="/@id/__x00__group-sop-preview"></script></body></html>'));
  }); },
  resolveId(id) { if (['group-sop-preview', '\0group-sop-preview', 'group-sop-books', '\0group-sop-books'].includes(id)) return '\0' + id.replace(/^\0/, ''); },
  load(id) {
    if (id === '\0group-sop-books') return `export default ${JSON.stringify(books)};`;
    if (id === '\0group-sop-preview') return `import {createApp} from 'vue';import Page from '/scripts/GroupPsychotherapyPreview.vue';import '/src/styles/brandTypography.css';createApp(Page).mount('#app');`;
  }
}], server: { host: '127.0.0.1', port: 5192, strictPort: true } });
await server.listen(); console.log('Group Psychotherapy SOP preview: http://127.0.0.1:5192');
