<template>
  <div class="cpv-shell auricwell-client-workspace">
    <div class="cpv-breadcrumb"><AuricWellBrand compact context="Client record" />
      <button type="button" class="cpv-back-btn" @click="goBack">
        <span aria-hidden="true">←</span> Back to workspace
      </button>
    </div>
    <nav v-if="!loading && linkedCharts.length" class="cpv-linked-charts" aria-label="Agency charts for this client">
      <strong>Agency charts</strong>
      <span aria-current="page">{{ currentChartAgency }}</span>
      <RouterLink v-for="chart in linkedCharts" :key="chart.id" :to="linkedChartRoute(chart)">{{ chart.agencyName }}</RouterLink>
    </nav>

    <div v-if="loading" class="cpv-loading">Loading client profile…</div>
    <div v-else-if="error" class="cpv-error">{{ error }}</div>
    <ClientDetailPanel
      v-else-if="client"
      :key="`cpv-${clientId}`"
      :client="client"
      :full-page="true"
      :initial-tab="initialTab"
      :initial-document-id="initialDocumentId"
      :open-paper-packet="route.query.packet === 'latest'"
      :initial-encounter-id="initialEncounterId"
      @updated="handleUpdated"
      @close="goBack"
      @tab-change="onTabChange"
      @encounter-change="onEncounterChange"
    />
    <div v-else class="cpv-loading">Client not found.</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { clinicalReturnPath } from '../../utils/clinicalWorkspace';
import ClientDetailPanel from '../../components/admin/ClientDetailPanel.vue';
import AuricWellBrand from '../../components/auricwell/AuricWellBrand.vue';
import '../../styles/auricwellClients.css';

const route = useRoute();
const router = useRouter();

const origin = window.history.state?.back;
const clientId = computed(() => {
  const raw = route.params?.clientId;
  const n = parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const initialTab = computed(() => String(route.query?.tab || 'overview').trim());

const initialDocumentId = computed(() => {
  const n = Number(route.query?.documentId);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const initialEncounterId = computed(() => {
  const n = Number(route.query?.encounterId);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const client = ref(null);
const loading = ref(false);
const error = ref('');
const linkedCharts = ref([]);
let profileLoad = 0;
const currentChartAgency = computed(() => client.value?.agency_name || 'Current chart');

function linkedChartRoute(chart) {
  return chart.agencySlug && route.params.organizationSlug
    ? { name: 'OrganizationClientProfile', params: { organizationSlug: chart.agencySlug, clientId: chart.id } }
    : { name: 'ClientProfile', params: { clientId: chart.id } };
}

async function fetchClient() {
  const currentLoad = ++profileLoad;
  const id = clientId.value;
  linkedCharts.value = [];
  if (!id) {
    error.value = 'Invalid client ID.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/clients/${id}`, { skipGlobalLoading: true });
    if (currentLoad !== profileLoad) return;
    client.value = res.data ? { ...res.data } : null;
    if (!client.value) error.value = 'Client not found.';
    else api.get(`/clients/${id}/linked-charts`, { skipGlobalLoading: true })
      .then(({ data }) => { if (currentLoad === profileLoad) linkedCharts.value = data?.charts || []; })
      .catch(() => {});
  } catch (e) {
    if (currentLoad === profileLoad) error.value = e.response?.data?.error?.message || e.message || 'Failed to load client.';
  } finally {
    if (currentLoad === profileLoad) loading.value = false;
  }
}

function handleUpdated({ client: updated } = {}) {
  if (updated) client.value = { ...updated };
}

function onTabChange(tab) {
  const nextTab = String(tab || 'overview').trim() || 'overview';
  const query = { ...route.query, tab: nextTab };
  if (nextTab !== 'phi') delete query.documentId;
  if (nextTab !== 'medical-record') delete query.encounterId;
  const sameTab = String(route.query?.tab || '') === nextTab;
  const sameDoc = !route.query?.documentId;
  const sameEnc = !route.query?.encounterId;
  if (sameTab && sameDoc && sameEnc) return;
  router.replace({ query });
}

function onEncounterChange(encounterId) {
  const n = Number(encounterId || 0);
  const query = { ...route.query, tab: 'medical-record' };
  if (n > 0) query.encounterId = String(n);
  else delete query.encounterId;
  if (
    String(route.query?.tab || '') === 'medical-record'
    && String(route.query?.encounterId || '') === String(query.encounterId || '')
  ) {
    return;
  }
  router.replace({ query });
}

function goBack() {
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const back = clinicalReturnPath({previous:origin,current:route.fullPath,slug:orgSlug});
  router.push(back);
}

onMounted(fetchClient);

watch(clientId, (id, prev) => {
  if (id && id !== prev) fetchClient();
});
</script>

<style scoped>
.cpv-shell {
  min-height: 100vh;
  background: var(--bg-page, #f8fafc);
}
.cpv-breadcrumb {
  padding: 14px 24px 0;
}
.cpv-linked-charts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 24px;
}
.cpv-linked-charts [aria-current="page"] {
  font-weight: 600;
  color: var(--primary, #15803d);
}
.cpv-back-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--primary, #15803d);
  font-size: 0.875rem;
  font-weight: 600;
  padding: 6px 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
}
.cpv-back-btn:hover {
  text-decoration: underline;
}
.cpv-loading {
  padding: 40px 24px;
  color: var(--text-secondary, #64748b);
  font-size: 0.9rem;
}
.cpv-error {
  padding: 24px;
  color: #b91c1c;
  font-size: 0.9rem;
}
</style>
