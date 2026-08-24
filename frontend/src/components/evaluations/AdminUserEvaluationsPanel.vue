<template>
  <div class="admin-evals">
    <div class="admin-evals__toolbar">
      <button type="button" class="ae-btn ae-btn--secondary" :disabled="loading" @click="load">
        Refresh
      </button>
      <button
        type="button"
        class="ae-btn ae-btn--primary"
        :disabled="creating || !agencyId || !userId"
        @click="createCycle"
      >
        {{ creating ? 'Creating…' : 'Create cycle (current period)' }}
      </button>
    </div>

    <div v-if="loading" class="ae-muted">Loading evaluations…</div>
    <div v-else-if="error" class="ae-error">{{ error }}</div>

    <section v-if="preview" class="ae-preview">
      <h3 class="ae-heading">Template preview</h3>
      <p class="ae-muted">
        Job: {{ preview.jobTitle || '—' }}
        <span v-if="preview.templates?.length"> · {{ preview.templates.length }} rubric(s)</span>
      </p>
      <ul v-if="preview.templates?.length" class="ae-list">
        <li v-for="t in preview.templates" :key="t.templateId || t.slug">
          {{ t.name || t.slug }}
          <span v-if="t.version != null" class="ae-muted">v{{ t.version }}</span>
          <span v-if="t.isSupervisorRubric" class="ae-pill">Supervisor</span>
        </li>
      </ul>
      <p v-else class="ae-muted">No evaluation templates resolved for this employee yet.</p>
      <p v-if="scheduleHint" class="ae-hint">
        <span>{{ scheduleHint }}</span>
        <button type="button" class="ae-link" @click="copyHint">Copy schedule hint</button>
      </p>
    </section>

    <section class="ae-cycles">
      <h3 class="ae-heading">Cycles</h3>
      <p v-if="!cycles.length && !loading" class="ae-muted">No cycles yet.</p>
      <button
        v-for="item in cycles"
        :key="item.cycle.id"
        type="button"
        class="ae-row"
        :class="{ 'ae-row--open': Number(expandedId) === Number(item.cycle.id) }"
        @click="toggle(item.cycle.id)"
      >
        <span>{{ periodLabel(item.cycle) }}</span>
        <span class="ae-badge">{{ statusLabel(item.cycle.status) }}</span>
      </button>
    </section>

    <div v-if="expandedBundle" class="ae-workspace">
      <EmployeeEvaluationWorkspace
        :key="expandedBundle.cycle.id"
        :bundle="expandedBundle"
        :agency-id="agencyId"
        mode="admin"
        @updated="onUpdated"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import EmployeeEvaluationWorkspace from './EmployeeEvaluationWorkspace.vue';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  userId: { type: [Number, String], default: null }
});

const loading = ref(false);
const creating = ref(false);
const error = ref('');
const cycles = ref([]);
const preview = ref(null);
const period = ref(null);
const expandedId = ref(null);
const hintCopied = ref(false);

function unwrap(item) {
  if (item?.cycle) return item;
  return { cycle: item, responses: item?.responses || [], activity: item?.activity || [] };
}

const expandedBundle = computed(() => {
  const id = Number(expandedId.value || 0);
  if (!id) return null;
  return cycles.value.find((c) => Number(c.cycle?.id) === id) || null;
});

const scheduleHint = computed(() => {
  const p = period.value;
  if (!p) return '';
  const profile = preview.value?.profile || {};
  const name = [profile.first_name || profile.firstName, profile.last_name || profile.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || `user #${props.userId}`;
  return `Schedule a Team Meeting with subtype “Employee Evaluation”, one attendee (${name}), period ${p.periodHalf} ${p.periodYear}.`;
});

function periodLabel(cycle) {
  const y = cycle?.period_year ?? cycle?.periodYear;
  const h = cycle?.period_half ?? cycle?.periodHalf;
  return y && h ? `${h} ${y}` : `Cycle #${cycle?.id}`;
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

function toggle(id) {
  const n = Number(id);
  expandedId.value = Number(expandedId.value) === n ? null : n;
}

function onUpdated(bundle) {
  if (!bundle?.cycle?.id) return;
  const id = Number(bundle.cycle.id);
  const idx = cycles.value.findIndex((c) => Number(c.cycle?.id) === id);
  if (idx >= 0) cycles.value[idx] = unwrap(bundle);
}

async function copyHint() {
  const text = scheduleHint.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    hintCopied.value = true;
    setTimeout(() => { hintCopied.value = false; }, 1500);
  } catch {
    /* ignore */
  }
}

async function load() {
  const agencyId = Number(props.agencyId || 0);
  const userId = Number(props.userId || 0);
  if (!agencyId || !userId) {
    error.value = 'Agency and user are required.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [periodRes, cyclesRes, previewRes] = await Promise.all([
      api.get('/evaluations/period'),
      api.get(`/evaluations/employees/${userId}/cycles`, { params: { agencyId } }),
      api.get(`/evaluations/employees/${userId}/preview`, { params: { agencyId } }).catch(() => ({ data: null }))
    ]);
    period.value = periodRes.data || null;
    const list = Array.isArray(cyclesRes.data?.cycles)
      ? cyclesRes.data.cycles
      : Array.isArray(cyclesRes.data) ? cyclesRes.data : [];
    cycles.value = list.map(unwrap);
    preview.value = previewRes.data || null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load evaluations';
    cycles.value = [];
  } finally {
    loading.value = false;
  }
}

async function createCycle() {
  const agencyId = Number(props.agencyId || 0);
  const employeeUserId = Number(props.userId || 0);
  if (!agencyId || !employeeUserId) return;
  creating.value = true;
  error.value = '';
  try {
    let p = period.value;
    if (!p?.periodYear || !p?.periodHalf) {
      const { data } = await api.get('/evaluations/period');
      p = data;
      period.value = data;
    }
    const { data } = await api.post('/evaluations/cycles', {
      agencyId,
      employeeUserId,
      periodYear: Number(p.periodYear),
      periodHalf: String(p.periodHalf).toUpperCase()
    });
    const bundle = unwrap(data);
    cycles.value = [bundle, ...cycles.value.filter((c) => Number(c.cycle?.id) !== Number(bundle.cycle?.id))];
    expandedId.value = bundle.cycle?.id || null;
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || 'Failed to create cycle';
    const existingId = e?.response?.data?.error?.cycleId;
    error.value = msg;
    if (existingId) {
      expandedId.value = Number(existingId);
      await load();
    }
  } finally {
    creating.value = false;
  }
}

watch(
  () => [props.agencyId, props.userId],
  () => { void load(); },
  { immediate: true }
);
</script>

<style scoped>
.admin-evals {
  --ee-green: #166534;
}

.admin-evals__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.ae-btn {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #fff;
}

.ae-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ae-btn--primary {
  background: var(--ee-green);
  border-color: var(--ee-green);
  color: #fff;
}

.ae-btn--secondary {
  background: #f9fafb;
}

.ae-heading {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: #14532d;
}

.ae-preview,
.ae-cycles {
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

.ae-list {
  margin: 6px 0 0;
  padding-left: 18px;
}

.ae-pill {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #166534;
}

.ae-hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: #374151;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}

.ae-link {
  border: none;
  background: none;
  color: var(--ee-green);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  font: inherit;
  text-decoration: underline;
}

.ae-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  text-align: left;
  border: 1px solid #e5e7eb;
  background: #fafafa;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 6px;
  cursor: pointer;
  font: inherit;
}

.ae-row--open {
  border-color: var(--ee-green);
  background: #ecfdf5;
}

.ae-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
}

.ae-workspace {
  margin-top: 8px;
}

.ae-muted {
  color: #6b7280;
  font-size: 13px;
}

.ae-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
</style>
