// Local DEMO QA harness. Uses real Vue components with a synthetic in-memory API.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = fileURLToPath(new URL('./immutable-note-qa/api.js', import.meta.url));
const agency = { currentAgency: { id: 990002, name: 'DEMO QA Agency', organization_type: 'agency', feature_flags: { noteAidEnabled: true, clinicalNoteGeneratorEnabled: true } }, currentAgencyId: 990002, selectedAgencyId: 990002, userAgencies: [{ id: 990002, name: 'DEMO QA Agency', feature_flags: { noteAidEnabled: true, medicalBillingEnabled: true } }], agencies: [{ id: 990002, name: 'DEMO QA Agency' }] };
const server = await createServer({ configFile: false, root, cacheDir: root + '.cache/immutable-note-qa', optimizeDeps: { entries: [] }, plugins: [{
  name: 'synthetic-note-qa-api', enforce: 'pre',
  resolveId(source) { if (/\/services\/api(?:\.js)?$/.test(source)) return fixture; if (/\/store\/auth(?:\.js)?$/.test(source)) return '\0qa-auth'; if (/\/store\/agency(?:\.js)?$/.test(source)) return '\0qa-agency'; if (source === 'immutable-note-qa-entry') return '\0qa-entry'; },
  load(id) { if (id === '\0qa-auth') return `export const useAuthStore=()=>({user:{id:990008,role:'provider',first_name:'DEMO QA',last_name:'Supervisor'},isAuthenticated:true});`; if (id === '\0qa-agency') return `export const useAgencyStore=()=>(${JSON.stringify(agency)});`; if (id === '\0qa-entry') return `import {createApp} from 'vue';import {createPinia} from 'pinia';import {createRouter,createMemoryHistory} from 'vue-router';import Page from '/scripts/immutable-note-qa/Preview.vue';const router=createRouter({history:createMemoryHistory(),routes:[{path:'/note-aid',component:{template:'<div/>'}}]});await router.push('/note-aid');createApp(Page).use(createPinia()).use(router).mount('#app');`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.url.split('?')[0] !== '/') return next(); res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>DEMO QA immutable note versions</title></head><body><div id="app"></div><script type="module" src="/@id/__x00__qa-entry"></script></body></html>')); }); }
}, vue()], server: { host: '127.0.0.1', port: Number(process.env.NOTE_QA_PORT || 5198), strictPort: true } });
await server.listen(); console.log('DEMO QA immutable notes: http://127.0.0.1:' + server.config.server.port);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
