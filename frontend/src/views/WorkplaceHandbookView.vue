<template>
  <main class="company-handbook-page agency-document" :style="brandStyle">
    <header><div><p>Company resources</p><h1>{{ showingUpdates ? 'Workplace Handbook updates' : 'Workplace Handbook' }}</h1></div><label v-if="companies.length > 1">Company <select v-model="selectedId"><option v-for="company in companies" :key="company.id" :value="Number(company.id)">{{ company.name }}</option></select></label></header>
    <p v-if="loading" role="status">Loading your company…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else-if="selectedId">
      <nav class="resource-actions" aria-label="Handbook resources">
        <router-link :to="handbookPath" :class="{ primary: showingUpdates }">Read the main Workplace Handbook →</router-link>
        <router-link :to="{ path: handbookPath, query: { updates: route.query.updates || 'latest' } }">Browse handbook updates →</router-link>
      </nav>
      <WorkplaceHandbookHistory v-if="showingUpdates" :agency-id="selectedId" :initial-digest-id="requestedDigestId" :sections="sections" @close="router.push(handbookPath)" @open-section="openSection" />
      <WorkplaceHandbookReader v-else :key="`${selectedId}-${route.hash}`" :agency-id="selectedId" library-mode />
    </template>
    <p v-else>Select your company to read its published handbook.</p>
    <ContractHandbookModal :open="citedReferenceOpen" v-bind="citedReference || {}" return-label="Return to handbook" @close="citedReferenceOpen = false" />
  </main>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../services/api';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import WorkplaceHandbookHistory from '../components/handbook/WorkplaceHandbookHistory.vue';
import WorkplaceHandbookReader from '../components/handbook/WorkplaceHandbookReader.vue';
import ContractHandbookModal from '../components/documents/ContractHandbookModal.vue';
import { useDocumentBranding } from '../composables/useDocumentBranding.js';
const agencyStore = useAgencyStore(); const route = useRoute();
const router = useRouter();
const sections = ref([]);
const showingUpdates = computed(() => !!route.query.updates);
const requestedDigestId = computed(() => /^\d+$/.test(String(route.query.updates)) ? Number(route.query.updates) : null);
const handbookPath = computed(() => route.params.organizationSlug ? `/${route.params.organizationSlug}/workplace-handbook` : '/workplace-handbook');
function openSection(slug) { router.push({ path: handbookPath.value, hash: `#handbook-${slug}` }); }
const selectedId = ref(null); const loading = ref(true); const error = ref('');
watch(() => selectedId.value, async agencyId => {
  sections.value = [];
  if (!agencyId) return;
  try { const { data } = await api.get('/provider-update/handbook/library', { params: { agencyId } }); if (Number(selectedId.value) === Number(agencyId)) sections.value = data.handbook?.sections || []; } catch { /* The handbook itself remains accessible from the main link. */ }
});
const companies = computed(() => agencyStore.userAgencies || []);
const brandStyle = useDocumentBranding(() => ({ presentation: { theme: { itsco: 'itsco-foundations', nlu: 'nlu-foundations', tisi: 'isi-foundations' }[companies.value.find(company => Number(company.id) === Number(selectedId.value))?.slug] } }), () => selectedId.value);
const citedReferenceOpen = ref(false);
const citedReference = computed(() => {
  const expectedVersionId = Number(route.query.versionId), agencyId = Number(route.query.agencyId || selectedId.value);
  const match = String(route.hash || '').match(/^#handbook-([a-z0-9][a-z0-9-]{0,199})$/);
  if (!Number.isSafeInteger(expectedVersionId) || expectedVersionId <= 0 || !match || !companies.value.some(company => Number(company.id) === agencyId)) return null;
  return { agencyId, sectionSlug: match[1], expectedVersionId };
});
watch(citedReference, value => { citedReferenceOpen.value = !!value; }, { immediate: true });
onMounted(async () => {
  try {
    await agencyStore.fetchUserAgencies();
    const requested = Number(route.query.agencyId);
    const explicitCompany = requested > 0 ? companies.value.find(company => Number(company.id) === requested) : null;
    if (requested > 0 && !explicitCompany) throw new Error('The referenced company is not available to this account.');
    const scoped = companies.value.find(c => c.slug === route.params.organizationSlug);
    const selected = explicitCompany || scoped || companies.value.find(c => Number(c.id) === Number(agencyStore.currentAgency?.id)) || companies.value[0];
    selectedId.value = selected?.id ? Number(selected.id) : null;
  } catch { error.value = 'Your company could not be loaded. Please reload to try again.'; }
  finally { loading.value = false; }
});
</script>
<style scoped>
.resource-actions{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}.resource-actions a{display:inline-flex;align-items:center;padding:14px 18px;border-radius:10px;border:1px solid var(--doc-line);background:white;color:var(--doc-ink);text-decoration:none;font-weight:650}.resource-actions a.primary{background:var(--doc-ink);color:white}.resource-actions a:focus-visible{outline:3px solid var(--doc-accent);outline-offset:3px}.company-handbook-page{width:100%;max-width:none;min-width:0;box-sizing:border-box;margin:0;padding:clamp(12px,2vw,32px)}header{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:24px}header p{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--doc-muted);margin:0 0 10px}h1{font-size:28px;margin:0;color:var(--doc-ink)}label{font-size:13px;display:grid;gap:7px}select{font:inherit;padding:10px;border:1px solid var(--doc-line);border-radius:6px;max-width:100%}
</style>
