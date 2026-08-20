<template>
  <div class="cap">
    <div class="cap-head">
      <div>
        <h3 class="cap-title">Authorizations</h3>
        <p class="hint">
          Smart ROI, HIPAA / consent notices, Smart Disclosure, and related signed authorizations for this client.
        </p>
      </div>
      <button type="button" class="cdp-btn-soft" :disabled="loading" @click="load">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading && !rows.length" class="muted">Loading authorizations…</div>
    <div v-else-if="!rows.length" class="muted">No authorization documents on file yet.</div>
    <div v-else class="cap-grid">
      <article v-for="row in rows" :key="row.id" class="cap-card">
        <div class="cap-card__kicker">{{ row.kindLabel || row.kind }}</div>
        <strong>{{ row.title }}</strong>
        <div class="muted tiny">
          <span v-if="row.missing">Not on file</span>
          <span v-else-if="row.signedAt">Signed {{ formatWhen(row.signedAt) }}</span>
          <span v-else>On file</span>
        </div>
        <button
          v-if="row.viewKey && !row.missing"
          type="button"
          class="btn btn-primary btn-sm"
          style="margin-top: 8px;"
          @click="$emit('open-document', row.viewKey)"
        >
          View
        </button>
      </article>
    </div>

    <ClientDisclosurePanel
      class="cap-disclosure"
      :client-id="clientId"
      :client="client"
      @view-artifact="$emit('open-document', $event)"
    />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import ClientDisclosurePanel from './ClientDisclosurePanel.vue';

const AUTH_KINDS = new Set([
  'smart_roi',
  'disclosure',
  'hipaa_notice',
  'informed_group_consent',
  'policy_services'
]);

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  client: { type: Object, default: null }
});
defineEmits(['open-document']);

const loading = ref(false);
const error = ref('');
const rows = ref([]);

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

async function load() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/phi-documents/clients/${id}/chart-artifacts`, { skipGlobalLoading: true });
    const all = Array.isArray(resp.data?.artifacts) ? resp.data.artifacts : [];
    rows.value = all.filter((a) => AUTH_KINDS.has(String(a.kind || '').toLowerCase()));
  } catch (e) {
    rows.value = [];
    error.value = e?.response?.data?.error?.message || 'Unable to load authorizations.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.clientId, load);
</script>

<style scoped>
.cap-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.cap-title { margin: 0 0 4px; font-size: 16px; font-weight: 750; }
.cap-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.cap-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--bg-card, var(--bg, #fff));
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cap-card__kicker {
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}
.cap-disclosure { margin-top: 8px; }
</style>
