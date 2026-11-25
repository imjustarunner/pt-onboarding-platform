// Local visual review with fictional data. No application authentication or live
// API is used; invitations and all non-preview mutations are unavailable.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
const port = Number(process.env.PREHIRE_SETUP_PREVIEW_PORT || 5199);
const root = fileURLToPath(new URL('../', import.meta.url));
const pdf = await PDFDocument.create(), page = pdf.addPage(), font = await pdf.embedFont(StandardFonts.Helvetica);
page.drawText('Example fingerprinting instructions', { x: 50, y: 760, size: 20, font });
page.drawText('Fictional document for local layout review. No signature or assignment is created.', { x: 50, y: 710, size: 10, font });
const pdfBytes = Buffer.from(await pdf.save());
const job = { id: 7, title: 'Mental Health Provider - Denver', city: 'Denver', state: 'CO', roleType: 'Provider', educationLevel: 'Master’s degree', scheduleText: 'School and office appointments; 2–3 days each week.', descriptionText: 'Support children, adolescents and families through individual and group counseling. Work with the clinical team to plan care, document services and coordinate school-based support.', prehireConfig: { prehirePackageId: 8, documents: [{ id: 'identogo', title: 'Identogo', kind: 'company_document', bodyHtml: '<p>Example fingerprinting instructions.</p>', instructions: 'Review the fingerprinting instructions before scheduling.' }] } };
const settings = { default_prehire_package_id: 8, portal_workflow: { supervisorClause: 'Approved example supervisory duties.', supervisorTemplateId: 12, resources: [] } };
let draft = null, revision = 0;
const server = await createServer({ root, configFile: false, cacheDir: '/private/tmp/pt-prehire-setup-vite', optimizeDeps: { entries: [], include: ['vue', 'vue-router', 'pinia', 'axios', 'dompurify'] }, plugins: [vue(), {
  name: 'fictional-prehire-setup',
  configureServer(vite) {
    vite.middlewares.use('/setup-preview-api', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1'); const path = url.pathname;
        if (path === '/hiring/packet-preview/document') { res.setHeader('Content-Type', 'application/pdf'); res.end(pdfBytes); return; }
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 200000) throw new Error('Preview request too large.'); }
        const body = raw ? JSON.parse(raw) : {};
        let data = [];
        if (path.endsWith('/prehire-draft')) {
          if (req.method === 'PUT') { draft = body.draft; revision++; } data = { draft, revision };
        } else if (req.method !== 'GET' && !path.endsWith('/preview')) { res.statusCode = 403; data = { error: { message: 'Sending invitations is unavailable in this fictional preview.' } }; }
        else if (path === '/hiring/candidates/2') data = { user: { first_name: 'Elena', last_name: 'Cruz', email: 'elena@example.test', phone_number: '555-0101', status: 'PROSPECTIVE' }, profile: { credential: 'LPC', license_number: 'EXAMPLE-123', stage_label: 'Ready for pre-hire', source: 'Careers website', fluent_languages_json: ['English', 'Spanish'], best_time_to_contact: 'Weekday afternoons', cover_letter_text: 'I enjoy helping students and families build stronger connections. My experience includes school counseling and community mental health.' }, jobDescription: job, applications: [{ submissionId: 1, jobTitle: job.title, submittedAt: '2026-11-20T18:00:00Z', coverLetterPreview: 'School counseling and community mental health experience.' }] };
        else if (path === '/hiring/settings') data = { settings };
        else if (path === '/users') data = [{ id: 9, first_name: 'Jordan', last_name: 'Example', has_supervisor_privileges: 1, role: 'provider', status: 'ACTIVE', is_active: 1 }];
        else if (path.includes('wizard-context')) data = { tokens: { COMPANY_NAME: 'Example Practice', COMPANY_ADDRESS: '100 Example Road, Denver, CO', JOB_TITLE: job.title }, agency: { name: 'Example Practice', address: '100 Example Road, Denver, CO' }, configs: [{ id: 3, name: 'Provider agreement' }], suggested: { configId: 3, officeLocationId: 1, compensationCategory: 3 }, offices: [{ id: 1, name: 'Denver office', city: 'Denver', state: 'CO', address: '100 Example Road, Denver, CO' }], compensationLevels: [1, 2, 3, 4, 5].map(level => ({ category: 3, level, direct_rate: 40 + level * 2, indirect_rate: 22, ffs_rate: 40 + level * 2 })) };
        else if (path === '/onboarding-packages') data = [{ id: 8, name: 'Staff pre-hire documents', package_type: 'pre_hire', is_active: true }];
        else if (path === '/onboarding-packages/8') data = { id: 8, name: 'Staff pre-hire documents', documents: [{ document_template_id: 20, document_name: 'Hiring: Authorization for Background Check' }, { document_template_id: 12, document_name: 'Additional release' }] };
        else if (path === '/document-templates') data = [{ id: 12, name: 'Additional release', document_action_type: 'signature', is_active: 1 }];
        else if (path.endsWith('/preview')) data = { html: `<html><body style="font:18px/1.8 system-ui;padding:48px"><p>Example Practice / Employment agreement</p><h1>Elena Cruz</h1><p>${job.title}</p><p>Category ${body.compensationCategory}, Level ${body.compensationLevel}</p><p>This is a fictional agreement for layout review.</p></body></html>`, unresolvedTokens: [] };
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
      } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: error.message } })); }
    });
    vite.middlewares.use('/api', (_req, res) => { res.statusCode = 403; res.end('Live API unavailable.'); });
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/example/admin/hiring/2/start-prehire')) return next();
      const html = await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pre-hire setup · Fictional preview</title></head><body style="margin:0"><div id="app"></div><script type="module" src="/@id/__x00__prehire-setup-preview"></script></body></html>');
      res.setHeader('Content-Type', 'text/html'); res.end(html);
    });
  },
  resolveId(id) { if (['prehire-setup-preview', '\0prehire-setup-preview'].includes(id)) return '\0prehire-setup-preview'; },
  load(id) { if (id === '\0prehire-setup-preview') return `import {createApp,h} from 'vue';import {createPinia} from 'pinia';import {createRouter,createWebHistory,RouterView} from 'vue-router';import View from '/src/views/admin/StartPreHireView.vue';import api from '/src/services/api';api.defaults.baseURL='/setup-preview-api';const router=createRouter({history:createWebHistory(),routes:[{path:'/:organizationSlug/admin/hiring/:userId/start-prehire',component:View}]});createApp({render:()=>h(RouterView)}).use(createPinia()).use(router).mount('#app');`; }
}], server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
await server.listen();
console.log(`Fictional pre-hire setup: http://127.0.0.1:${port}/example/admin/hiring/2/start-prehire?agencyId=2`);
