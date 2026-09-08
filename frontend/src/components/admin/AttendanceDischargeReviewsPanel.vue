<template>
  <section class="adr" data-testid="attendance-discharge-reviews">
    <header class="adr-head">
      <div>
        <h3 class="adr-title">Attendance discharge reviews</h3>
        <p class="adr-sub">
          Third Medicaid strike prompts review — never auto-termination. Choose continue scheduling or open the terminate workflow.
        </p>
      </div>
      <button type="button" class="adr-btn" :disabled="loading" @click="load">Refresh</button>
    </header>

    <p v-if="error" class="adr-error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>
    <p v-else-if="!reviews.length" class="muted">No pending third-strike reviews.</p>

    <ul v-else class="adr-list">
      <li v-for="r in reviews" :key="r.id" class="adr-card">
        <div class="adr-card-main">
          <strong>
            {{ clientLabel(r) }}
          </strong>
          <span class="muted">
            Strike · {{ r.struckAt ? formatWhen(r.struckAt) : '—' }}
            · {{ r.strikeNumberHint || 'miss' }}
          </span>
          <p v-if="r.providerRecommendedWaive" class="adr-note">
            Provider recommended waiving termination/discharge recommendation
            <template v-if="r.providerWaiveReason"> ({{ r.providerWaiveReason }})</template>.
          </p>
          <p v-else class="adr-note">Provider continued with third-strike recommendation for review.</p>
        </div>
        <div class="adr-actions">
          <button
            type="button"
            class="adr-btn primary"
            :disabled="decidingId === r.id"
            @click="decide(r, 'continue_scheduling')"
          >
            Continue scheduling
          </button>
          <button
            type="button"
            class="adr-btn warn"
            :disabled="decidingId === r.id"
            @click="decide(r, 'proceed_to_termination')"
          >
            Proceed to termination…
          </button>
          <button
            type="button"
            class="adr-btn ghost"
            :disabled="decidingId === r.id"
            @click="decide(r, 'dismissed')"
          >
            Dismiss
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  agencyId: { type: [Number, String], required: true }
});

const emit = defineEmits(['open-terminate']);

const loading = ref(false);
const decidingId = ref(null);
const error = ref('');
const reviews = ref([]);

function clientLabel(r) {
  const code = r.clientCode || r.client_code;
  const name = [r.clientFirstName || r.first_name, r.clientLastName || r.last_name].filter(Boolean).join(' ');
  if (code && name) return `${code} — ${name}`;
  return code || name || `Client #${r.clientId}`;
}

function formatWhen(raw) {
  try {
    return new Date(String(raw).includes('T') ? raw : String(raw).replace(' ', 'T')).toLocaleString();
  } catch {
    return String(raw || '');
  }
}

async function load() {
  const aid = Number(props.agencyId || 0);
  if (!aid) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/tenant-booking/agencies/${aid}/attendance-discharge-reviews`, {
      skipGlobalLoading: true
    });
    reviews.value = Array.isArray(r.data?.reviews) ? r.data.reviews : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load reviews';
    reviews.value = [];
  } finally {
    loading.value = false;
  }
}

async function decide(row, status) {
  const aid = Number(props.agencyId || 0);
  decidingId.value = row.id;
  error.value = '';
  try {
    const r = await api.post(
      `/tenant-booking/agencies/${aid}/attendance-discharge-reviews/${row.id}/decide`,
      { status },
      { skipGlobalLoading: true }
    );
    if (status === 'proceed_to_termination' && r.data?.openTerminateClientId) {
      emit('open-terminate', { clientId: r.data.openTerminateClientId });
    }
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save decision';
  } finally {
    decidingId.value = null;
  }
}

onMounted(load);
watch(() => props.agencyId, load);

defineExpose({ reload: load });
</script>

<style scoped>
.adr {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  padding: 14px 16px;
  margin: 12px 0;
}
.adr-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
}
.adr-title { margin: 0; font-size: 1.05rem; font-weight: 800; }
.adr-sub { margin: 4px 0 0; font-size: 13px; color: #64748b; line-height: 1.4; max-width: 52rem; }
.adr-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.adr-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
}
.adr-card-main { display: grid; gap: 4px; }
.adr-note { margin: 6px 0 0; font-size: 13px; color: #334155; }
.adr-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.adr-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
  font-size: 13px;
}
.adr-btn.primary { background: #0f766e; border-color: #0f766e; color: #fff; }
.adr-btn.warn { background: #fff7ed; border-color: #fdba74; color: #9a3412; }
.adr-btn.ghost { border-style: dashed; }
.adr-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.adr-error { color: #b91c1c; font-size: 13px; }
.muted { color: #64748b; font-size: 13px; }
</style>
