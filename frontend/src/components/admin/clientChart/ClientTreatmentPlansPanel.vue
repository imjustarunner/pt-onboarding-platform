<template>
  <div class="ctp">
    <div class="ctp-head">
      <div>
        <h3 class="ctp-title">Treatment plans</h3>
        <p class="hint">Draft and active plans on the clinical chart. Finalize an intake note to create a draft, or open clinical notes for session-linked plans.</p>
      </div>
      <div class="ctp-actions">
        <button type="button" class="cdp-btn-soft" @click="$emit('navigate', 'clinical-notes')">Open clinical notes</button>
        <button type="button" class="cdp-btn-soft" :disabled="loading" @click="load">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading && !plans.length" class="muted">Loading treatment plans…</div>
    <div v-else-if="!plans.length" class="muted">
      No treatment plans on file yet.
      <button type="button" class="cdp-text-link" style="margin-left: 6px;" @click="$emit('navigate', 'clinical-notes')">
        Start from intake note →
      </button>
    </div>
    <div v-else class="ctp-list">
      <article
        v-for="plan in plans"
        :key="plan.id"
        class="ctp-card"
        :class="{ 'ctp-card--active': Number(selectedId) === Number(plan.id) }"
        @click="selectedId = plan.id"
      >
        <div class="ctp-card__top">
          <strong>{{ planTitle(plan) }}</strong>
          <span class="ctp-badge" :class="statusClass(plan)">{{ statusLabel(plan) }}</span>
        </div>
        <div class="muted tiny">
          Updated {{ formatWhen(plan.updated_at || plan.created_at) }}
          <span v-if="plan.version_number"> · v{{ plan.version_number }}</span>
        </div>
      </article>
    </div>

    <div v-if="selectedPlan" class="ctp-detail">
      <h4>{{ planTitle(selectedPlan) }}</h4>
      <p class="muted tiny">Status: {{ statusLabel(selectedPlan) }}</p>
      <pre v-if="detailText" class="ctp-detail__body">{{ detailText }}</pre>
      <p v-else class="muted">Open clinical notes for the full structured plan editor.</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null }
});
defineEmits(['navigate']);

const loading = ref(false);
const error = ref('');
const plans = ref([]);
const latestPlan = ref(null);
const selectedId = ref(null);

const selectedPlan = computed(() => {
  const id = Number(selectedId.value || 0);
  if (id && latestPlan.value && Number(latestPlan.value.id) === id) return latestPlan.value;
  return (plans.value || []).find((p) => Number(p.id) === id) || null;
});

const detailText = computed(() => {
  const p = selectedPlan.value;
  if (!p) return '';
  if (typeof p.plan_text === 'string' && p.plan_text.trim()) return p.plan_text.trim();
  if (typeof p.summary === 'string' && p.summary.trim()) return p.summary.trim();
  if (p.payload && typeof p.payload === 'object') {
    try {
      return JSON.stringify(p.payload, null, 2);
    } catch {
      return '';
    }
  }
  return '';
});

function planTitle(plan) {
  return String(plan?.title || plan?.plan_title || `Treatment plan #${plan?.id || ''}`).trim() || 'Treatment plan';
}

function statusLabel(plan) {
  const s = String(plan?.status || plan?.plan_status || '').trim();
  return s ? s.replace(/_/g, ' ') : 'On file';
}

function statusClass(plan) {
  const s = String(plan?.status || '').toLowerCase();
  if (s.includes('active') || s.includes('final')) return 'ctp-badge--ok';
  if (s.includes('draft')) return 'ctp-badge--draft';
  return '';
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

async function load() {
  const clientId = Number(props.clientId || 0);
  const agencyId = Number(props.agencyId || 0);
  if (!clientId || !agencyId) {
    plans.value = [];
    error.value = agencyId ? '' : 'Agency context is required to load treatment plans.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/medical-billing/clients/${clientId}/chart`, {
      params: { agencyId },
      skipGlobalLoading: true
    });
    plans.value = Array.isArray(res.data?.plans) ? res.data.plans : [];
    latestPlan.value = res.data?.latestPlan || null;
    if (!selectedId.value && plans.value[0]?.id) selectedId.value = plans.value[0].id;
  } catch (e) {
    plans.value = [];
    latestPlan.value = null;
    error.value = e?.response?.data?.error?.message || 'Unable to load treatment plans.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [props.clientId, props.agencyId], load);
</script>

<style scoped>
.ctp-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.ctp-title { margin: 0 0 4px; font-size: 16px; font-weight: 750; }
.ctp-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ctp-list { display: flex; flex-direction: column; gap: 8px; }
.ctp-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  background: var(--bg-card, var(--bg, #fff));
  text-align: left;
}
.ctp-card--active { border-color: var(--primary, #166534); box-shadow: 0 0 0 1px var(--primary, #166534); }
.ctp-card__top { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.ctp-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: capitalize;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-alt, #f1f5f9);
  color: var(--text-secondary);
}
.ctp-badge--ok { background: #dcfce7; color: #166534; }
.ctp-badge--draft { background: #fef3c7; color: #92400e; }
.ctp-detail {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
}
.ctp-detail__body {
  white-space: pre-wrap;
  font-size: 12px;
  max-height: 360px;
  overflow: auto;
  background: var(--bg-alt, #f8fafc);
  padding: 10px;
  border-radius: 8px;
}
</style>
