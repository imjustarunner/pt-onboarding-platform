<template>
  <div class="cpv-shell">
    <div class="cpv-breadcrumb">
      <button type="button" class="cpv-back-btn" @click="goBack">
        <span aria-hidden="true">←</span> Back to clients
      </button>
    </div>

    <div v-if="loading" class="cpv-loading">Loading client profile…</div>
    <div v-else-if="error" class="cpv-error">{{ error }}</div>
    <ClientDetailPanel
      v-else-if="client"
      :key="`cpv-${clientId}`"
      :client="client"
      :full-page="true"
      :initial-tab="initialTab"
      :initial-document-id="initialDocumentId"
      @updated="handleUpdated"
      @close="goBack"
    />
    <div v-else class="cpv-loading">Client not found.</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import ClientDetailPanel from '../../components/admin/ClientDetailPanel.vue';

const route = useRoute();
const router = useRouter();

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

const client = ref(null);
const loading = ref(false);
const error = ref('');

async function fetchClient() {
  const id = clientId.value;
  if (!id) {
    error.value = 'Invalid client ID.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/clients/${id}`);
    client.value = res.data ? { ...res.data } : null;
    if (!client.value) error.value = 'Client not found.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load client.';
  } finally {
    loading.value = false;
  }
}

function handleUpdated({ client: updated } = {}) {
  if (updated) client.value = { ...updated };
}

function goBack() {
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const back = orgSlug ? `/${orgSlug}/admin/clients` : '/admin/clients';
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push(back);
  }
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
  padding: 14px 20px 0;
  max-width: 1120px;
  margin: 0 auto;
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
  max-width: 1120px;
  margin: 0 auto;
}
.cpv-error {
  padding: 24px;
  color: #b91c1c;
  font-size: 0.9rem;
  max-width: 1120px;
  margin: 0 auto;
}
</style>
