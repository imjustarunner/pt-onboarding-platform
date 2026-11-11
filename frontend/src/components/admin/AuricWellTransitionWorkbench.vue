<template>
  <section class="aw-workbench" aria-labelledby="aw-transition-title">
    <header class="aw-heading"><div><p class="aw-eyebrow">AuricWell · {{ agency?.name || 'Select a practice' }}</p><h2 id="aw-transition-title">EHR Transition</h2><p>Choose a provider, move clients into the same shared charts, preserve their records, then bring over the week’s appointments.</p></div><a v-if="agency" class="btn btn-secondary" :href="providerDirectoryHref">Import providers</a></header>
    <p v-if="!canManage" role="status">Select a practice you administer to begin.</p>
    <template v-else>
      <fieldset class="aw-context" :disabled="busy">
        <label>Provider <select v-model="providerId"><option value="">Choose provider…</option><option v-for="provider in providers" :key="provider.id" :value="String(provider.id)">{{ [provider.first_name, provider.last_name].filter(Boolean).join(' ') || provider.email }} · #{{ provider.id }}</option></select></label>
        <label>Previous EHR <input v-model="sourceEhr" maxlength="100" /></label>
        <button type="button" class="btn btn-secondary" @click="loadContext">Refresh providers and caseload</button>
      </fieldset>
      <p v-if="loading" role="status">Loading practice records…</p>
      <p v-if="error" class="aw-error" role="alert">{{ error }}</p>
      <template v-if="providerId">
        <nav class="aw-tabs" aria-label="Transition work">
          <button v-for="tab in tabs" :key="tab.id" type="button" :disabled="busy" :aria-current="activeTab === tab.id ? 'step' : undefined" @click="activeTab = tab.id">{{ tab.label }}</button>
        </nav>
        <div v-if="activeTab === 'clients'" class="aw-client-layout">
          <aside class="aw-caseload">
            <h3>{{ providerLabel }}’s caseload</h3><p>{{ caseload.length }} visible client(s)</p>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="beginClient">Add or find a client</button>
            <ul><li v-for="client in caseload" :key="client.id"><button type="button" :disabled="busy" :aria-current="Number(currentClient?.id) === Number(client.id) ? 'true' : undefined" @click="selectExisting(client)"><strong>{{ client.full_name || client.initials || `Chart #${client.id}` }}</strong><small>#{{ client.id }} · {{ client.organization_name || client.school_name || client.client_type || 'Client' }}</small><small v-if="progress[client.id]">{{ progress[client.id] }}</small></button></li></ul>
            <p v-if="!caseload.length && !loading">Use “Add or find a client” to link an existing school chart or create a new client.</p>
          </aside>
          <div class="aw-client-main">
            <section v-if="!currentClient" class="aw-identity">
              <h3>Find the client before creating a chart</h3>
              <p>School clients may already be here with incomplete details. Select their existing chart to improve it and keep school enrollment, guardians and history together.</p>
              <label>Paste demographics to find the client <textarea v-model="identityPaste" rows="5" :disabled="busy" placeholder="Legal Name: …&#10;Date of Birth: …&#10;Phone: …" /></label>
              <button type="button" class="btn btn-secondary" :disabled="busy || !identityPaste.trim()" @click="readIdentity">Read demographics and find matches</button>
              <fieldset class="aw-context" :disabled="busy"><label>Full name <input v-model="identity.fullName" @input="searchComplete = false" /></label><label>Date of birth <input v-model="identity.dateOfBirth" type="date" @input="searchComplete = false" /></label><button type="button" class="btn btn-secondary" :disabled="!identity.fullName.trim()" @click="searchClients">Search existing charts</button></fieldset>
              <div v-if="searchComplete" class="aw-candidates">
                <h4>Existing chart results</h4>
                <p v-if="!candidates.length">No charts found for this search. Review the spelling and school records before choosing to create a client.</p>
                <ul><li v-for="client in candidates" :key="client.id"><div><strong>{{ client.full_name || client.initials }}</strong><span>Chart #{{ client.id }} · DOB {{ dob(client.date_of_birth) || 'missing' }} · {{ client.organization_name || client.school_name || client.organization_id }}{{ isArchived(client) ? ' · Archived' : '' }}</span></div><button type="button" class="btn btn-secondary" :disabled="busy || isArchived(client)" @click="selectExisting(client)">Use this existing chart</button></li></ul>
                <label class="aw-check"><input v-model="confirmedNew" type="checkbox" :disabled="busy || hasUnresolvedMatch" />I reviewed the existing chart results and this is a new client.</label>
                <p v-if="hasUnresolvedMatch" class="aw-error">A chart with this name and matching or missing DOB needs review. Use the existing chart or complete identity review in Client Management.</p>
                <fieldset class="aw-context" :disabled="busy"><label>Client organization <select v-model="newOrganizationId"><option value="">Choose school / clinical organization…</option><option v-for="org in organizations" :key="org.id" :value="String(org.id)">{{ org.name }} ({{ org.organization_type }})</option></select></label><button type="button" class="btn btn-primary" :disabled="!canCreate" @click="createClient">Create this new client and assign provider</button></fieldset>
              </div>
            </section>
            <section v-else class="aw-selected-client">
              <header><div><h3>{{ currentClient.full_name || currentClient.initials }} <small>Chart #{{ currentClient.id }}</small></h3><p>Updates stay on this chart. Original school and guardian relationships are retained.</p></div><a class="btn btn-secondary" :href="chartHref" target="_blank" rel="noopener">Open full chart</a></header>
              <nav class="aw-tabs" aria-label="Client import steps"><button type="button" :disabled="busy" :aria-current="clientTab === 'chart' ? 'step' : undefined" @click="clientTab = 'chart'">Paste chart information</button><button type="button" :disabled="busy" :aria-current="clientTab === 'archive' ? 'step' : undefined" @click="clientTab = 'archive'">Medical history PDF</button></nav>
              <AuricWellClientImportPanel v-show="clientTab === 'chart'" :key="`chart-${currentClient.id}`" :agency-id="agency.id" :client-id="currentClient.id" :client-label="currentClient.full_name || currentClient.initials" :source-ehr="sourceEhr" :initial-demographics="identityPaste" @busy="childBusy.chart = $event" @saved="chartSaved" />
              <AuricWellMedicalArchive v-show="clientTab === 'archive'" :key="`archive-${currentClient.id}`" :agency-id="agency.id" :client-id="currentClient.id" :client-label="currentClient.full_name || currentClient.initials" @busy="childBusy.archive = $event" @saved="archiveSaved" />
              <p class="aw-muted">Saved records stay in the chart. Progress labels in this visit are reminders and reset when this page reloads.</p>
              <button type="button" class="btn btn-secondary" :disabled="busy" @click="beginClient">Continue to another client</button>
            </section>
          </div>
        </div>
        <AuricWellAgendaImport v-if="activeTab === 'agenda'" :key="`agenda-${agency.id}-${providerId}`" :agency-id="agency.id" :provider-id="Number(providerId)" :provider-label="providerLabel" @busy="childBusy.agenda = $event" @saved="agendaSaved" />
        <AuricWellSchoolTransition v-if="activeTab === 'school'" :key="`school-${agency.id}-${providerId}`" :agency-id="agency.id" :provider-id="Number(providerId)" @busy="childBusy.school = $event" />
        <p v-if="notice" class="aw-success" role="status">{{ notice }}</p>
      </template>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { deriveInitialsFromName } from '../../utils/noteAidWorkQueue.js';
import { assignTransitionClient, sameTransitionClientName, transitionClientRows } from '../../utils/auricwellTransitionClient.js';
import AuricWellClientImportPanel from './AuricWellClientImportPanel.vue';
import AuricWellMedicalArchive from './AuricWellMedicalArchive.vue';
import AuricWellAgendaImport from './AuricWellAgendaImport.vue';
import AuricWellSchoolTransition from './AuricWellSchoolTransition.vue';
const props = defineProps({ scopedAgencyId: { type: [Number, String], default: null } });
const agencyStore = useAgencyStore(), authStore = useAuthStore();
const agency = computed(() => { const current = agencyStore.currentAgency; return current && (!props.scopedAgencyId || Number(current.id) === Number(props.scopedAgencyId)) ? current : null; });
const canManage = computed(() => !!agency.value?.id && ['admin', 'super_admin'].includes(String(authStore.user?.role || '').toLowerCase()));
const providers = ref([]), organizations = ref([]), providerId = ref(''), caseload = ref([]), currentClient = ref(null), sourceEhr = ref('TherapyNotes'), activeTab = ref('clients'), clientTab = ref('chart'), loading = ref(false), writing = ref(false), error = ref(''), notice = ref(''), identityPaste = ref(''), candidates = ref([]), searchComplete = ref(false), confirmedNew = ref(false), newOrganizationId = ref('');
const identity = reactive({ fullName: '', dateOfBirth: '', phone: '' }), progress = reactive({});
const childBusy = reactive({ chart: false, archive: false, agenda: false, school: false });
const busy = computed(() => loading.value || writing.value || Object.values(childBusy).some(Boolean));
defineExpose({ beforeNavigate: () => { if (!busy.value) return true; error.value = 'Wait for the current transition step to finish before leaving.'; return false; } });
onBeforeUnmount(() => { generation++; });
const tabs = [{ id: 'clients', label: '1. Clients and chart records' }, { id: 'agenda', label: '2. Weekly agenda' }, { id: 'school', label: '3. School appointment connection' }];
const providerLabel = computed(() => { const provider = providers.value.find(p => Number(p.id) === Number(providerId.value)); return provider ? [provider.first_name, provider.last_name].filter(Boolean).join(' ') : 'Provider'; });
const prefix = computed(() => agency.value?.slug || agency.value?.portal_url ? `/${encodeURIComponent(agency.value.slug || agency.value.portal_url)}` : '');
const providerDirectoryHref = computed(() => `${prefix.value}/admin/providers?agencyId=${agency.value?.id}`);
const chartHref = computed(() => `${prefix.value}/admin/clients?clientId=${currentClient.value?.id}&agencyId=${agency.value?.id}`);
const dob = value => String(value || '').slice(0, 10);
const isArchived = client => String(client.status || '').toUpperCase() === 'ARCHIVED';
const hasUnresolvedMatch = computed(() => candidates.value.some(client => sameTransitionClientName(client, identity.fullName) && (!dob(client.date_of_birth) || dob(client.date_of_birth) === identity.dateOfBirth)));
const canCreate = computed(() => confirmedNew.value && searchComplete.value && !hasUnresolvedMatch.value && !!newOrganizationId.value && !!identity.fullName.trim() && /^\d{4}-\d{2}-\d{2}$/.test(identity.dateOfBirth));
let generation = 0;
function guard(id) { if (id !== generation) throw new Error('The selected practice or provider changed. Review the current selection before continuing.'); }
const message = e => e.response?.data?.error?.message || e.message || 'Unable to complete the transition step.';
function resetClient() { Object.keys(childBusy).forEach(key => { childBusy[key] = false; }); currentClient.value = null; identityPaste.value = ''; candidates.value = []; searchComplete.value = false; confirmedNew.value = false; Object.assign(identity, { fullName: '', dateOfBirth: '', phone: '' }); clientTab.value = 'chart'; notice.value = ''; }
function beginClient() { if (!busy.value) resetClient(); }
watch(() => agency.value?.id, () => { generation++; providerId.value = ''; providers.value = []; caseload.value = []; organizations.value = []; resetClient(); void loadContext(); }, { immediate: true });
watch(providerId, () => { generation++; caseload.value = []; resetClient(); activeTab.value = 'clients'; void loadCaseload(); });
async function loadContext() {
  if (!canManage.value) return;
  const id = generation, agencyId = Number(agency.value.id); loading.value = true; error.value = '';
  try { const [providerResult, orgResult] = await Promise.all([api.get('/provider-scheduling/providers', { params: { agencyId }, skipGlobalLoading: true }), api.get(`/agencies/${agencyId}/affiliated-organizations`, { skipGlobalLoading: true })]); guard(id); providers.value = Array.isArray(providerResult.data) ? providerResult.data : []; organizations.value = (Array.isArray(orgResult.data) ? orgResult.data : []).filter(org => ['school', 'clinical', 'program'].includes(String(org.organization_type).toLowerCase())); if (providerId.value) await loadCaseload(); }
  catch (e) { if (id === generation) error.value = message(e); } finally { if (id === generation) loading.value = false; }
}
async function loadCaseload() {
  if (!canManage.value || !providerId.value) return;
  const id = generation; loading.value = true; error.value = '';
  try { const result = await api.get('/clients', { params: { agency_id: agency.value.id, provider_id: Number(providerId.value) }, skipGlobalLoading: true }); guard(id); caseload.value = transitionClientRows(result.data, agency.value.id); }
  catch (e) { if (id === generation) error.value = message(e); } finally { if (id === generation) loading.value = false; }
}
async function readIdentity() {
  if (busy.value) return; const id = generation; writing.value = true; error.value = '';
  try { const { data } = await api.post('/clients/demographics/preview', { text: identityPaste.value }, { skipGlobalLoading: true }); guard(id); const parsed = data?.parsed || {}; Object.assign(identity, { fullName: parsed.fullName || '', dateOfBirth: parsed.dateOfBirth || '', phone: parsed.contactPhone || '' }); if (!identity.fullName) throw new Error('Enter the client’s full name and date of birth, then search existing charts.'); await runSearch(id); }
  catch (e) { error.value = message(e); } finally { writing.value = false; }
}
async function runSearch(id) { searchComplete.value = false; confirmedNew.value = false; const result = await api.get('/clients', { params: { agency_id: agency.value.id, search: identity.fullName.trim(), includeArchived: true }, skipGlobalLoading: true }); guard(id); candidates.value = transitionClientRows(result.data, agency.value.id); searchComplete.value = true; }
async function searchClients() { if (busy.value || !identity.fullName.trim()) return; const id = generation; writing.value = true; error.value = ''; try { await runSearch(id); } catch (e) { error.value = message(e); } finally { writing.value = false; } }
async function selectExisting(client) {
  if (busy.value) return; const id = generation; writing.value = true; error.value = '';
  try { const { data } = await api.get(`/clients/${client.id}`, { skipGlobalLoading: true }); guard(id); const chart = data?.client || data; if (Number(chart?.agency_id) !== Number(agency.value.id)) throw new Error('This chart belongs to another practice.'); await assignTransitionClient(api, chart, providerId.value, { assertContext: () => guard(id) }); if (currentClient.value && Number(currentClient.value.id) !== Number(chart.id)) identityPaste.value = ''; currentClient.value = chart; if (!caseload.value.some(row => Number(row.id) === Number(chart.id))) caseload.value.push(chart); clientTab.value = 'chart'; notice.value = `Using existing chart #${chart.id}.`; }
  catch (e) { error.value = message(e); } finally { writing.value = false; }
}
async function createClient() {
  if (busy.value || !canCreate.value) return; const id = generation; let savedClientId = null; writing.value = true; error.value = '';
  try {
    // Recheck immediately before create; the backend also blocks EHR initials collisions.
    await runSearch(id); if (hasUnresolvedMatch.value) throw new Error('An existing chart now needs identity review. No new client was created.');
    const organization = organizations.value.find(org => Number(org.id) === Number(newOrganizationId.value)); if (!organization) throw new Error('Choose the client’s organization.');
    const { data } = await api.post('/clients', { agency_id: Number(agency.value.id), organization_id: Number(organization.id), provider_id: Number(providerId.value), full_name: identity.fullName.trim(), date_of_birth: identity.dateOfBirth, initials: deriveInitialsFromName(identity.fullName), contact_phone: identity.phone || undefined, client_type: organization.organization_type === 'school' ? 'school' : 'clinical', source: 'EHR_PATIENT_LIST', submission_date: new Date().toISOString().slice(0, 10), serviceType: 'counseling' }, { skipGlobalLoading: true });
    const chart = data?.client || data; if (!data.reused && Number(chart?.id)) savedClientId = Number(chart.id); guard(id); if (!Number(chart?.id) || data.reused) throw new Error('Chart creation needs identity review; refresh the caseload before continuing.'); currentClient.value = { ...chart, full_name: identity.fullName, agency_id: agency.value.id }; caseload.value.push(currentClient.value);
    await api.post(`/clients/${chart.id}/demographics/import`, { demographics: { fullName: identity.fullName.trim(), dateOfBirth: identity.dateOfBirth, contactPhone: identity.phone } }, { skipGlobalLoading: true }); guard(id); notice.value = `Created chart #${chart.id} and assigned ${providerLabel.value}. Continue importing this same client below.`;
  } catch (e) { error.value = savedClientId ? `Chart #${savedClientId} is saved. ${message(e)} Return to this chart to complete demographics; do not create another chart.` : message(e); } finally { writing.value = false; }
}
function chartSaved({ clientId }) { progress[clientId] = 'Chart information saved · clinical review may remain'; notice.value = 'Chart changes were saved. Continue with the medical history PDF or the next client.'; }
function archiveSaved(result) { progress[result.clientId] = result.verified ? 'Medical history checked' : result.fallback ? 'Medical history pending in previous EHR' : 'Medical files uploaded · verify downloads'; }
function agendaSaved(result) { if (result.complete === false) { notice.value = ''; error.value = result.error || 'Some appointments were saved and others need review. Check the agenda results and retry the same import.'; return; } notice.value = 'Agenda import saved. Review the provider calendar and the school appointment connection.'; }
</script>
<style scoped>
.aw-workbench{max-width:1440px;line-height:1.55;color:var(--text-primary,#17334a)}.aw-heading,.aw-selected-client>header{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.aw-heading h2{margin:4px 0;font-size:1.8rem}.aw-eyebrow,.aw-muted{color:var(--text-secondary,#506476);font-size:.88rem}.aw-context{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;border:0;padding:12px 0;margin:0}.aw-workbench label{display:block;font-weight:600}.aw-workbench input:not([type=checkbox]),.aw-workbench select,.aw-workbench textarea{display:block;padding:9px 10px;border:1px solid var(--border,#ccd8e0);border-radius:6px;background:var(--bg-card,#fff);color:inherit;font:inherit;box-sizing:border-box;max-width:100%}.aw-workbench textarea{width:100%;margin:8px 0}.aw-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.aw-tabs button{padding:10px 14px;border:1px solid var(--border,#ccd8e0);border-radius:7px;background:var(--bg-card,#fff);color:inherit;cursor:pointer}.aw-tabs [aria-current=step]{background:var(--primary,#1555b0);color:white;border-color:var(--primary,#1555b0)}.aw-client-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:24px}.aw-caseload{border-right:1px solid var(--border,#d7e1e8);padding-right:18px}.aw-caseload h3{margin-top:0}.aw-caseload ul,.aw-candidates ul{list-style:none;padding:0}.aw-caseload li button{display:block;text-align:left;width:100%;padding:12px;border:1px solid var(--border,#d7e1e8);border-radius:8px;margin:8px 0;background:var(--bg-card,#fff);color:inherit;cursor:pointer}.aw-caseload li button[aria-current=true]{border-color:var(--primary,#1555b0);box-shadow:inset 3px 0 var(--primary,#1555b0)}.aw-caseload small,.aw-candidates span{display:block;color:var(--text-secondary,#506476);font-size:.83rem}.aw-candidates li{padding:12px;border:1px solid var(--border,#d7e1e8);border-radius:8px;margin:8px 0;display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}.aw-check{display:flex!important;gap:8px;align-items:flex-start}.aw-error{color:var(--danger,#b42318)}.aw-success{padding:12px;background:var(--bg-alt,#edf5f0)}.aw-selected-client h3{margin:0}.aw-selected-client h3 small{font-size:.8em;color:var(--text-secondary,#506476)}button:disabled{cursor:wait;opacity:.6}@media(max-width:850px){.aw-client-layout{grid-template-columns:1fr}.aw-caseload{border-right:0;padding-right:0;border-bottom:1px solid var(--border,#d7e1e8)}.aw-caseload ul{display:flex;gap:8px;overflow:auto}.aw-caseload li{min-width:200px}}
</style>
