<template>
  <div class="my-evals">
    <div v-if="loading" class="my-evals__muted">Loading your evaluations…</div>
    <div v-else-if="error" class="my-evals__error">{{ error }}</div>
    <template v-else>
      <section v-if="openCycles.length" class="my-evals__block">
        <h3 class="my-evals__heading">Open evaluations</h3>
        <button
          v-for="item in openCycles"
          :key="item.cycle.id"
          type="button"
          class="my-evals__row"
          :class="{ 'my-evals__row--open': Number(expandedId) === Number(item.cycle.id) }"
          @click="toggle(item.cycle.id)"
        >
          <span class="my-evals__row-title">{{ periodLabel(item.cycle) }}</span>
          <span class="my-evals__badge">{{ statusLabel(item.cycle.status) }}</span>
        </button>
      </section>
      <section v-if="pastCycles.length" class="my-evals__block">
        <h3 class="my-evals__heading">Past evaluations</h3>
        <button
          v-for="item in pastCycles"
          :key="item.cycle.id"
          type="button"
          class="my-evals__row"
          :class="{ 'my-evals__row--open': Number(expandedId) === Number(item.cycle.id) }"
          @click="toggle(item.cycle.id)"
        >
          <span class="my-evals__row-title">{{ periodLabel(item.cycle) }}</span>
          <span class="my-evals__badge">{{ statusLabel(item.cycle.status) }}</span>
        </button>
      </section>
      <p v-if="!openCycles.length && !pastCycles.length" class="my-evals__muted">
        No evaluation cycles yet. When one is scheduled, it will appear here.
      </p>

      <div v-if="expandedBundle" class="my-evals__workspace">
        <EmployeeEvaluationWorkspace
          :key="expandedBundle.cycle.id"
          :bundle="expandedBundle"
          :agency-id="agencyId"
          :mode="workspaceMode(expandedBundle.cycle)"
          @updated="onUpdated"
          @submitted="onUpdated"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import EmployeeEvaluationWorkspace from './EmployeeEvaluationWorkspace.vue';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const loading = ref(false);
const error = ref('');
const cycles = ref([]);
const expandedId = ref(null);

const OPEN_STATUSES = new Set(['scheduled', 'in_progress']);

function unwrap(item) {
  if (item?.cycle) return item;
  return { cycle: item, responses: item?.responses || [], activity: item?.activity || [] };
}

const openCycles = computed(() =>
  cycles.value.filter((c) => OPEN_STATUSES.has(String(c.cycle?.status || '').toLowerCase()))
);

const pastCycles = computed(() =>
  cycles.value.filter((c) => !OPEN_STATUSES.has(String(c.cycle?.status || '').toLowerCase()))
);

const expandedBundle = computed(() => {
  const id = Number(expandedId.value || 0);
  if (!id) return null;
  return cycles.value.find((c) => Number(c.cycle?.id) === id) || null;
});

function periodLabel(cycle) {
  const y = cycle?.period_year ?? cycle?.periodYear;
  const h = cycle?.period_half ?? cycle?.periodHalf;
  const job = cycle?.job_title_snapshot || cycle?.jobTitleSnapshot;
  const base = y && h ? `${h} ${y}` : 'Evaluation';
  return job ? `${base} · ${job}` : base;
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  const map = {
    scheduled: 'Scheduled',
    in_progress: 'In progress',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
    closed: 'Closed',
    cancelled: 'Cancelled'
  };
  return map[s] || status || '—';
}

function workspaceMode(cycle) {
  const s = String(cycle?.status || '').toLowerCase();
  if (OPEN_STATUSES.has(s)) return 'employee';
  return 'readonly';
}

function toggle(id) {
  const n = Number(id);
  expandedId.value = Number(expandedId.value) === n ? null : n;
}

function onUpdated(bundle) {
  if (!bundle?.cycle?.id) return;
  const id = Number(bundle.cycle.id);
  const idx = cycles.value.findIndex((c) => Number(c.cycle?.id) === id);
  if (idx >= 0) {
    cycles.value[idx] = unwrap(bundle);
  }
}

async function load() {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId) {
    cycles.value = [];
    error.value = 'Agency is required.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/evaluations/me/cycles', { params: { agencyId } });
    const list = Array.isArray(data?.cycles) ? data.cycles : Array.isArray(data) ? data : [];
    cycles.value = list.map(unwrap);
    if (!expandedId.value && openCycles.value.length === 1) {
      expandedId.value = openCycles.value[0].cycle.id;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load evaluations';
    cycles.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.agencyId, () => { void load(); }, { immediate: true });
</script>

<style scoped>
.my-evals {
  --ee-green: #166534;
}

.my-evals__heading {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: #14532d;
}

.my-evals__block {
  margin-bottom: 16px;
}

.my-evals__row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  font: inherit;
}

.my-evals__row--open {
  border-color: var(--ee-green);
  box-shadow: inset 0 0 0 1px var(--ee-green);
}

.my-evals__row-title {
  font-weight: 600;
}

.my-evals__badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #166534;
  white-space: nowrap;
}

.my-evals__workspace {
  margin-top: 8px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}

.my-evals__muted {
  color: #6b7280;
  font-size: 14px;
}

.my-evals__error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
}
</style>
