// Separate local preview entry. Shared workflows receive an in-memory fixture
// transport and can never fall through to a real client API.
function memoryStorage() { const values = new Map(); return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(String(key)) ?? null, setItem: (key, value) => values.set(String(key), String(value)), removeItem: key => values.delete(String(key)), clear: () => values.clear() }; }
Object.defineProperty(window, 'localStorage', { value: memoryStorage() });
Object.defineProperty(window, 'sessionStorage', { value: memoryStorage() });
window.fetch = async () => { throw new Error('Sample preview: network requests are disabled.'); };
if (window.XMLHttpRequest) window.XMLHttpRequest.prototype.open = () => { throw new Error('Sample preview: network requests are disabled.'); };
if (navigator.sendBeacon) navigator.sendBeacon = () => false;
const { createApp, h } = await import('vue');
const { createPinia, setActivePinia } = await import('pinia');
const { createRouter, createWebHashHistory } = await import('vue-router');
const { default: api } = await import('../services/api');
const { useAgencyStore } = await import('../store/agency');
const { useAuthStore } = await import('../store/auth');
const { default: Workbench } = await import('../components/admin/AuricWellTransitionWorkbench.vue');
const { PDFDocument } = await import('pdf-lib');

const practice = { id: 7001, slug: 'transition-sample', name: 'Meadowbrook Therapy · Sample', feature_flags: { medicalBillingEnabled: true, schoolPortalsEnabled: true } };
const provider = { id: 7101, first_name: 'Jordan', last_name: 'Reed', role: 'provider' };
const clients = [{ id: 7201, agency_id: 7001, full_name: 'Taylor Example', initials: 'TAYEXA', date_of_birth: null, provider_id: 7101, organization_id: 7301, organization_name: 'Sample Elementary', client_type: 'school', status: 'ACTIVE' }, { id: 7202, agency_id: 7001, full_name: 'Morgan Sample', initials: 'MORSAM', date_of_birth: '1990-04-15', provider_id: 7101, organization_id: 7401, organization_name: 'Meadowbrook Clinic', client_type: 'clinical', status: 'ACTIVE' }];
const contacts = {}, insurance = {}, documents = {}, files = new Map(), appointments = [], links = new Map();
let transition = null, nextId = 8000;
const clone = value => structuredClone(value);
const payload = config => typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
const parsedDemographics = text => {
  const fields = { 'legal name': 'fullName', 'full name': 'fullName', 'date of birth': 'dateOfBirth', dob: 'dateOfBirth', phone: 'contactPhone', email: 'email', street: 'addressStreet', address: 'addressStreet', city: 'addressCity', state: 'addressState', zip: 'addressZip', grade: 'grade' };
  return Object.fromEntries(String(text).split('\n').map(line => { const index = line.indexOf(':'); return [fields[line.slice(0, index).trim().toLowerCase()], line.slice(index + 1).trim()]; }).filter(([key]) => key));
};
const findClient = id => { const client = clients.find(row => row.id === Number(id)); if (!client) throw new Error('This sample chart is unavailable.'); return client; };
const schoolBase = '/school-appointment-transition/7301/providers/7101';
function schoolContext(params = {}) {
  const startDate = params.startDate || '2026-11-16', endDate = params.endDate || '2026-11-23';
  return { agencyId: 7001, schoolId: 7301, providerId: 7101, canManage: true, canMove: true, timeZone: 'America/Denver', today: '2026-11-10', startDate, endDate, transition, slots: [{ id: 7601, client_id: 7201, weekday: 'Monday', start_time: '09:00:00', end_time: '09:50:00', initials: 'TAYEXA', linked_count: links.size }], candidates: appointments.map(appointment => ({ id: appointment.id, client_id: appointment.clientId, start_at: `${appointment.date} ${appointment.startTime}:00`, end_at: `${appointment.date} ${appointment.endTime}:00`, linked_slot_id: links.get(appointment.id), status: 'scheduled' })), appointments: appointments.filter(appointment => links.has(appointment.id)).map(appointment => ({ id: appointment.id, slotId: links.get(appointment.id), clientId: appointment.clientId, clientLabel: findClient(appointment.clientId).full_name, startAt: `${appointment.date}T${appointment.startTime}:00-07:00`, endAt: `${appointment.date}T${appointment.endTime}:00-07:00`, status: 'scheduled', canMove: true, fingerprint: 'sample-version' })) };
}
const adapter = async config => {
  const url = String(config.url).replace(/^\/api/, ''), method = String(config.method || 'get').toLowerCase(), body = payload(config);
  let data, headers = {};
  try {
    if (method === 'get' && url === '/provider-scheduling/providers') data = [provider];
    else if (method === 'get' && url.includes('/affiliated-organizations')) data = [{ id: 7301, name: 'Sample Elementary', organization_type: 'school' }, { id: 7401, name: 'Meadowbrook Clinic', organization_type: 'clinical' }];
    else if (method === 'get' && url === '/clients') data = clients.filter(client => !config.params?.search || client.full_name.toLowerCase().includes(String(config.params.search).toLowerCase()));
    else if (method === 'post' && url === '/clients') { const client = { ...body, id: nextId++, status: 'ACTIVE' }; clients.push(client); data = { client }; }
    else if (method === 'get' && /^\/clients\/\d+$/.test(url)) data = clone(findClient(url.split('/')[2]));
    else if (method === 'post' && /demographics\/(?:parse|preview)$/.test(url)) data = { parsed: parsedDemographics(body.text) };
    else if (method === 'post' && /demographics\/import$/.test(url)) { const client = findClient(url.split('/')[2]), map = { fullName: 'full_name', dateOfBirth: 'date_of_birth', contactPhone: 'contact_phone', addressStreet: 'address_street', addressCity: 'address_city', addressState: 'address_state', addressZip: 'address_zip', email: 'email', grade: 'grade' }; for (const [key, value] of Object.entries(body.demographics)) if (map[key] && value) client[map[key]] = value; data = { client }; }
    else if (method === 'put' && /\/clients\/\d+\/provider$/.test(url)) { findClient(url.split('/')[2]).provider_id = body.provider_id; data = { ok: true }; }
    else if (method === 'post' && /provider-assignments$/.test(url)) data = { ok: true };
    else if (/\/clients\/\d+\/contacts$/.test(url)) { const id = url.split('/')[2]; contacts[id] ||= []; if (method === 'get') data = { items: contacts[id] }; else { const contact = { id: nextId++, fullName: body.fullName, email: body.email, phone: body.phone }; const affiliation = { id: nextId++, contact, relationshipType: body.relationshipType }; contacts[id].push(affiliation); data = { affiliation }; } }
    else if (/\/clients\/\d+\/(?:account-support\/)?insurance$/.test(url)) { const id = url.match(/clients\/(\d+)/)[1]; if (method === 'get') data = { insurance: insurance[id] || { patient: {}, primary: {}, secondary: null }, demographics: { firstName: findClient(id).full_name.split(' ')[0], lastName: findClient(id).full_name.split(' ').at(-1), dateOfBirth: findClient(id).date_of_birth || '' } }; else { insurance[id] = body; data = { insurance: body }; } }
    else if (method === 'post' && /intake-note\/import$/.test(url)) data = { draft: { id: nextId++, status: 'draft', sections: [{ key: 'Presenting Problem', body: body.text }], historicalImport: body.historicalImport } };
    else if (method === 'post' && url === '/medical-billing/treatment-plans/parse') data = { parsed: { presentingProblem: 'Synthetic history for review', goals: [] } };
    else if (method === 'post' && url === '/medical-billing/treatment-plans') data = { plan: { id: nextId++, status: 'draft', effectiveDate: body.effectiveDate } };
    else if (method === 'get' && /^\/phi-documents\/clients\/\d+$/.test(url)) data = documents[url.split('/')[3]] || [];
    else if (method === 'post' && /\/phi-documents\/clients\/\d+\/upload$/.test(url)) { const id = url.split('/')[3], file = body.get('file'); const document = { id: nextId++, client_id: Number(id), document_title: body.get('documentTitle'), document_type: body.get('documentType'), original_name: file.name }; (documents[id] ||= []).push(document); files.set(document.id, file); data = { document }; }
    else if (method === 'get' && /^\/phi-documents\/\d+\/view$/.test(url)) { data = files.get(Number(url.split('/')[2])); headers = { 'content-type': 'application/pdf' }; if (!data) throw new Error('The sample archive is unavailable.'); }
    else if (method === 'post' && /\/clients\/\d+\/notes$/.test(url)) data = { id: nextId++, message: body.message };
    else if (url === '/auricwell-agenda-import/options') data = { timeZone: 'America/Denver', clients: clients.map(client => ({ id: client.id, label: client.full_name })), services: [{ id: 7501, name: 'Individual therapy', serviceCode: '90834' }], locations: [{ id: 7502, name: 'Sample Elementary', placeOfService: '03' }, { id: 7503, name: 'Meadowbrook Clinic', placeOfService: '11' }] };
    else if (url === '/auricwell-agenda-import/preview') {
      const rows = body.rows || String(body.text).split('\n').filter(Boolean).map((line, index) => { const cells = line.split(/[|\t]/).map(cell => cell.trim()), weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], date = new Date(`${body.weekStart}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + Math.max(0, weekdays.indexOf(cells[0]))); return { rowId: `sample-${index + 1}`, clientInput: cells[3], clientId: clients.find(client => client.full_name === cells[3])?.id || null, date: date.toISOString().slice(0, 10), startTime: cells[1], endTime: cells[2], ...body.defaults, include: true }; });
      const normalized = rows.map(row => ({ ...row, errors: row.clientId ? [] : ['Choose a sample client.'], warnings: [], existingAppointmentIds: [], occurrenceCount: Number(row.occurrenceCount) || 1 }));
      data = { rows: normalized, previewToken: normalized.some(row => row.errors.length) ? null : 'sample-reviewed', summary: { newAppointments: normalized.length, existingAppointments: 0, blockedRows: normalized.filter(row => row.errors.length).length } };
    }
    else if (url === '/auricwell-agenda-import/commit') { for (const row of body.rows) appointments.push({ ...row, id: nextId++ }); data = { complete: true, createdCount: body.rows.length, existingCount: 0, savedAppointmentIds: appointments.map(row => row.id) }; }
    else if (url === '/school-appointment-transition/schools') data = { schools: [{ id: 7301, name: 'Sample Elementary' }] };
    else if (url === schoolBase && method === 'get') data = schoolContext(config.params);
    else if (url === schoolBase && method === 'put') { transition = { effectiveDate: body.effectiveDate, revision: (transition?.revision || 0) + 1 }; data = { transition }; }
    else if (url === `${schoolBase}/links`) { body.appointmentIds.forEach(id => links.set(Number(id), Number(body.slotId))); data = { ok: true }; }
    else if (url.startsWith(`${schoolBase}/appointments/`) && method === 'put') { const appointment = appointments.find(row => row.id === Number(url.split('/').at(-1))); if (!appointment) throw new Error('Sample appointment not found.'); Object.assign(appointment, { date: body.date, startTime: body.startTime, endTime: body.endTime }); data = { ok: true }; }
    else throw new Error(`This action is outside the sample preview: ${method.toUpperCase()} ${url}`);
    return { data, status: 200, statusText: 'OK', headers, config };
  } catch (error) { error.response = { status: 409, data: { error: { message: error.message } }, config }; throw error; }
};
api.defaults.adapter = adapter;
api.interceptors.request.use(config => { config.adapter = adapter; config.withCredentials = false; config.skipAuthRedirect = true; config.skipGlobalLoading = true; return config; });
const pinia = createPinia(); setActivePinia(pinia);
useAgencyStore().currentAgency = practice;
useAuthStore().user = { id: 7999, role: 'super_admin', first_name: 'Sample', last_name: 'Operator', billingAgencyIds: [7001], capabilities: { canViewLibrary: true } };
const sample = `Legal Name: Taylor Example\nDate of Birth: 2014-03-08\nPhone: 555-010-0200\nAddress: 100 Sample Lane\nCity: Denver\nState: CO\nZIP: 80000\nAdditional Contacts\nName: Pat Example\nRelationship: Parent\nPhone: 555-010-0300\nEmail: pat@example.test`;
async function downloadSamplePdf() { const doc = await PDFDocument.create(); for (let i = 1; i <= 5; i++) doc.addPage().drawText(`FICTIONAL SAMPLE MEDICAL HISTORY - PAGE ${i}\nTaylor Example - no real clinical information`); const url = URL.createObjectURL(new Blob([await doc.save()], { type: 'application/pdf' })); const link = document.createElement('a'); link.href = url; link.download = 'fictional-history.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
const app = createApp({ render: () => h('main', { class: 'preview-shell' }, [h('aside', { class: 'preview-banner' }, [h('strong', 'Sample preview · Fictional clients only'), h('p', 'Changes stay in this browser tab. No real clients, messages, claims or appointments are touched. Reload to reset.'), h('details', [h('summary', 'Sample paste and PDF to try'), h('p', 'Choose Jordan Reed, then Taylor Example. Paste the sample demographics below and review changes to the existing school chart.'), h('pre', sample), h('p', 'Insurance sample: Primary Insurance: Sample Health\nMember ID: SAMPLE123\nSubscriber Name: Pat Example\nRelationship to Subscriber: Child'), h('p', 'Agenda sample: Monday | 09:00 | 09:50 | Taylor Example'), h('button', { onClick: downloadSamplePdf }, 'Download fictional history PDF')])]), h(Workbench, { scopedAgencyId: 7001 })]) });
app.use(pinia); app.use(createRouter({ history: createWebHashHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<span />' } }] })); app.mount('#aw-transition-preview');
function neutralizePreviewLinks() { for (const link of document.querySelectorAll('#aw-transition-preview a[href]')) if (!link.getAttribute('href').startsWith('blob:')) { link.removeAttribute('href'); link.setAttribute('role', 'button'); link.setAttribute('tabindex', '0'); link.dataset.previewOnly = 'true'; } }
new MutationObserver(neutralizePreviewLinks).observe(document.getElementById('aw-transition-preview'), { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
neutralizePreviewLinks();
document.addEventListener('click', event => { if (event.target.closest('[data-preview-only]')) { event.preventDefault(); alert('Sample preview: use the transition panels here. Other workspaces open from the authenticated app.'); } });
window.__awTransitionPreview = { snapshot: () => clone({ clients, contacts, insurance, documents, appointments, transition, links: [...links] }) };
const style = document.createElement('style'); style.textContent = `body{margin:0;background:#f4f7fa;color:#17334a;font-family:system-ui,sans-serif;font-size:15px}.preview-shell{max-width:1440px;margin:auto;padding:24px}.preview-banner{border:1px solid #b8cbe0;background:#e8f2ff;padding:18px;border-radius:12px;margin-bottom:24px}.preview-banner p{margin:8px 0;white-space:pre-line}.preview-banner pre{white-space:pre-wrap;user-select:all;background:white;padding:14px}.btn{display:inline-block;padding:10px 14px;border:1px solid #1555b0;border-radius:7px;background:white;color:#1555b0;text-decoration:none;font:inherit;cursor:pointer}.btn-primary{background:#1555b0;color:white}.btn:disabled{opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #2489d7;outline-offset:2px}`; document.head.appendChild(style);
