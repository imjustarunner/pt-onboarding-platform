<template>
  <main class="document-library-page">
    <header class="document-management-header"><div><p>Document library · Beta</p><h1>Manage company documents</h1></div><router-link :to="`${route.params.organizationSlug ? `/${route.params.organizationSlug}` : ''}/library`">← Back to library</router-link></header>
    <p v-if="loading" role="status">Loading company documents…</p>
    <p v-if="error" role="alert" class="library-error">{{ error }} <button type="button" @click="load">Retry</button></p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <WorkplaceDocumentLibrary v-if="library" v-bind="library" :scoped="!!route.params.organizationSlug || !!route.query.company" :selected-id="selectedId" :busy="busy" @select="selectCompany" @assign="assign">
      <template #workspace="{ company }">
        <nav class="company-document-tabs" aria-label="Company document">
          <button type="button" :aria-pressed="documentTab === 'handbook'" @click="switchDocument('handbook')">Workplace handbook</button>
          <button v-for="document in company.referenceDocuments || []" :key="document.key" type="button" :aria-pressed="documentTab === document.key" @click="switchDocument(document.key)">{{ document.title }}</button>
        </nav>
        <WorkplaceHandbookAdmin v-if="documentTab === 'handbook'" :key="company.id" :agency-id="company.id" @dirty="dirty = $event" @published="load" @draft-changed="load" />
        <CompanyReferenceWorkspace v-else :key="`${documentTab}:${company.id}`" :agency-id="company.id" :document-key="documentTab" :document-title="company.referenceDocuments?.find(d => d.key === documentTab)?.title || 'Company guide'" manage @dirty="dirty = $event" @handbook-link="openHandbook" />
      </template>
    </WorkplaceDocumentLibrary>
  </main>
</template>
<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import WorkplaceDocumentLibrary from '../../components/handbook/WorkplaceDocumentLibrary.vue';
import WorkplaceHandbookAdmin from '../../components/handbook/WorkplaceHandbookAdmin.vue';
import CompanyReferenceWorkspace from '../../components/library/CompanyReferenceWorkspace.vue';
const route = useRoute(); const router = useRouter(); const agencyStore = useAgencyStore();
const library = ref(null); const selectedId = ref(null); const loading = ref(false); const busy = ref(false); const error = ref(''); const notice = ref('');
const dirty = ref(false);
const documentTab = ref('handbook');
function switchDocument(value) { if (canLeave()) documentTab.value = value; }
function openHandbook(hash) { if (canLeave()) { window.history.replaceState(window.history.state, '', hash ? `#${hash}` : window.location.pathname + window.location.search); documentTab.value = 'handbook'; } }
function canLeave() {
  if (dirty.value && !window.confirm('Discard unsaved document section changes?')) return false;
  dirty.value = false; return true;
}
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(canLeave);
let sequence = 0;
function selectCompany(id) { notice.value = ''; router.replace({ query: { ...route.query, company: String(id) } }); }
async function load() {
  const request = ++sequence; loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/provider-update/document-library', { params: { organizationSlug: route.params.organizationSlug || undefined, agencyId: !route.params.organizationSlug && route.query.company ? route.query.company : undefined } });
    if (request !== sequence) return;
    library.value = data;
    const preferred = Number(route.query.company) || selectedId.value || data.companies.find(c => c.slug === route.params.organizationSlug)?.id || agencyStore.currentAgency?.id;
    selectedId.value = data.companies.find(c => Number(c.id) === Number(preferred))?.id || data.companies[0]?.id || null;
  } catch (e) { if (request === sequence) error.value = e?.response?.data?.error?.message || 'The document library could not be loaded.'; }
  finally { if (request === sequence) loading.value = false; }
}
async function assign(payload) {
  busy.value = true; error.value = ''; notice.value = '';
  try { await api.post('/provider-update/document-library/assign', payload); await load(); notice.value = 'Company document package assigned. The handbook and practice guides are available as starting points; complete each company edition before publishing.'; }
  catch (e) { error.value = e?.response?.data?.error?.message || 'The document could not be assigned.'; }
  finally { busy.value = false; }
}
watch(() => route.params.organizationSlug, () => { library.value = null; selectedId.value = null; load(); });
watch(() => route.query.company, value => { const id = Number(value); if (library.value?.companies.some(c => Number(c.id) === id)) selectedId.value = id; });
watch(selectedId, () => { documentTab.value = 'handbook'; });
onMounted(load);
</script>
<style scoped>
.document-management-header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}.document-management-header p{font-size:12px;color:#788579;margin:0 0 5px}.document-management-header h1{font-size:24px;margin:0;color:#284333}.document-management-header a{color:#496e58;font-size:13px;text-decoration:none}

.document-library-page{padding:clamp(12px,3vw,40px);background:#f8faf6;min-height:100vh}.library-error{color:#9b3126;padding:16px;background:#fff0ed;border-radius:8px;font-size:13px}
.company-document-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px}.company-document-tabs button{font:inherit;font-size:13px;border:1px solid #cdd9cf;border-radius:6px;background:white;color:#294935;padding:12px 16px;cursor:pointer}.company-document-tabs [aria-pressed=true]{background:#294935;color:white}
</style>
