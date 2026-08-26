<template>
  <div v-if="visible" class="gpp">
    <div class="gpp-head">
      <h4 class="gpp-title">Plan progress</h4>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        :disabled="loading || !clientId"
        @click="load"
      >
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>
    <p class="hint" style="margin: 6px 0 10px;">
      Read-only progress on {{ isLearning ? 'learning' : 'treatment' }} plan goals for this child.
    </p>
    <div v-if="error" class="error" style="font-size: 13px;">{{ error }}</div>
    <div v-else-if="loading" class="hint">Loading plan progress…</div>
    <div v-else-if="!hasActivePlan" class="hint">No active plan on file yet.</div>
    <div v-else class="gpp-body">
      <div class="gpp-plan-meta">
        <strong>{{ planTitle }}</strong>
        <span v-if="plan?.status" class="muted small"> · {{ plan.status }}</span>
      </div>
      <article v-for="g in goals" :key="g.id" class="gpp-goal">
        <header>
          <span class="gpp-pill">G{{ g.goalIndex }}</span>
          <strong>{{ g.goalText }}</strong>
        </header>
        <div v-for="o in g.objectives || []" :key="o.id" class="gpp-obj">
          <div class="gpp-obj__text">
            <span class="gpp-pill gpp-pill--obj">O{{ o.objectiveIndex }}</span>
            <span>{{ o.objectiveText }}</span>
          </div>
          <div class="gpp-obj__scale">
            <span>Current <strong>{{ o.scaleCurrent ?? '—' }}</strong></span>
            <span aria-hidden="true">→</span>
            <span>Goal <strong>{{ o.scaleTarget ?? '—' }}</strong></span>
          </div>
          <div v-if="sparklinePoints(o).length" class="gpp-spark">
            <svg
              viewBox="0 0 100 28"
              preserveAspectRatio="none"
              class="gpp-spark__svg"
              role="img"
              :aria-label="`Progress toward goal ${o.scaleTarget ?? ''}`"
            >
              <line
                v-if="o.scaleTarget != null"
                class="gpp-spark__goal"
                x1="0"
                :y1="scaleY(o.scaleTarget)"
                x2="100"
                :y2="scaleY(o.scaleTarget)"
              />
              <polyline
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                :points="sparklinePoints(o)"
              />
            </svg>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], default: null },
  agencyId: { type: [Number, String], default: null },
  clientType: { type: String, default: '' },
  visible: { type: Boolean, default: true }
});

const loading = ref(false);
const error = ref('');
const hasActivePlan = ref(false);
const plan = ref(null);
const goals = ref([]);
const ratings = ref([]);
const resolvedClientType = ref('');

const isLearning = computed(() => {
  const t = String(resolvedClientType.value || props.clientType || '').toLowerCase();
  return t === 'learning';
});

const planTitle = computed(() => {
  const fallback = isLearning.value ? 'Learning plan' : 'Treatment plan';
  return String(plan.value?.title || fallback).trim() || fallback;
});

const ratingsByObjective = computed(() => {
  const map = {};
  for (const r of ratings.value || []) {
    const oid = String(r.objectiveId || r.objective_id);
    if (!map[oid]) map[oid] = [];
    map[oid].push(r);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.ratedAt || a.rated_at) - new Date(b.ratedAt || b.rated_at));
  }
  return map;
});

function scaleY(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 14;
  const clamped = Math.min(10, Math.max(1, n));
  return 26 - ((clamped - 1) / 9) * 24;
}

function sparklinePoints(objective) {
  const series = ratingsByObjective.value[String(objective?.id)] || [];
  const rated = series.filter(
    (r) => (r.disposition == null || r.disposition === 'rated') && (r.scaleValue ?? r.scale_value) != null
  );
  const values = rated.map((r) => Number(r.scaleValue ?? r.scale_value));
  if (!values.length && objective?.scaleCurrent != null) {
    values.push(Number(objective.scaleCurrent));
  }
  if (!values.length) return '';
  if (values.length === 1) {
    const y = scaleY(values[0]);
    return `2,${y} 98,${y}`;
  }
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 98 + 1;
      return `${x.toFixed(2)},${scaleY(v).toFixed(2)}`;
    })
    .join(' ');
}

async function load() {
  const clientId = Number(props.clientId || 0);
  const agencyId = Number(props.agencyId || 0);
  if (!clientId || !props.value) {
    hasActivePlan.value = false;
    plan.value = null;
    goals.value = [];
    ratings.value = [];
    return;
  }
  if (!agencyId) {
    error.value = 'Agency context is required.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/guardian-portal/dependents/${clientId}/plan-progress`, {
      params: { agencyId },
      skipGlobalLoading: true
    });
    hasActivePlan.value = !!res.data?.hasActivePlan;
    plan.value = res.data?.plan || null;
    goals.value = Array.isArray(res.data?.goals) ? res.data.goals : [];
    ratings.value = Array.isArray(res.data?.ratings) ? res.data.ratings : [];
    resolvedClientType.value = res.data?.clientType || props.clientType || '';
  } catch (e) {
    hasActivePlan.value = false;
    plan.value = null;
    goals.value = [];
    ratings.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load plan progress';
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.clientId, props.agencyId, props.visible],
  () => {
    if (props.visible) load();
  },
  { immediate: true }
);

defineExpose({ load });
</script>

<style scoped>
.gpp {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.gpp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.gpp-title { margin: 0; font-size: 1rem; }
.gpp-plan-meta { margin-bottom: 10px; }
.gpp-goal {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  margin-bottom: 10px;
}
.gpp-goal header {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 6px;
}
.gpp-pill {
  display: inline-grid;
  place-items: center;
  min-width: 28px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  background: #0f766e;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  flex-shrink: 0;
}
.gpp-pill--obj { background: #0d9488; }
.gpp-obj {
  margin-top: 8px;
  padding: 10px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.gpp-obj__text {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.9rem;
}
.gpp-obj__scale {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 0.82rem;
  color: #334155;
}
.gpp-spark {
  margin-top: 10px;
  max-width: 220px;
  color: #0f766e;
}
.gpp-spark__svg {
  display: block;
  width: 100%;
  height: 36px;
  background: #f1f5f9;
  border-radius: 6px;
}
.gpp-spark__goal {
  stroke: #86efac;
  stroke-width: 1;
  stroke-dasharray: 3 2;
}
</style>
