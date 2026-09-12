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
      Goals and recorded progress shared with your account.
    </p>
    <div v-if="error" class="error" style="font-size: 13px;">{{ error }}</div>
    <div v-else-if="loading" class="hint">Loading plan progress…</div>
    <div v-else-if="!hasActivePlan" class="hint">No active plan on file yet.</div>
    <div v-else class="gpp-body">
      <div class="gpp-plan-meta">
        <strong>{{ planTitle }}</strong>
        <span v-if="plan?.status" class="muted small"> · {{ plan.status }}</span>
      </div>
      <div class="gpp-overview"><span class="gpp-goal-count">{{ goals.length }}<small>{{ goals.length === 1 ? 'goal' : 'goals' }}</small></span><div><h3>Your goals, one step at a time</h3><p>These scales show recorded ratings and targets. A higher score is not always the goal.</p><p v-if="plan?.effectiveDate">Plan started {{ formatDate(plan.effectiveDate) }}</p></div></div>
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
          <div v-if="!compact" class="gpp-scale" :aria-label="`Current rating ${o.scaleCurrent ?? 'not recorded'}, target ${o.scaleTarget ?? 'not recorded'}`"><span v-for="n in 10" :key="n" :class="{current:Number(o.scaleCurrent)===n,target:Number(o.scaleTarget)===n}"><small>{{ n }}</small><i /><b v-if="Number(o.scaleCurrent)===n">Current</b><b v-else-if="Number(o.scaleTarget)===n">Target</b></span></div>
          <p v-if="o.scaleDirection" class="gpp-direction">Direction: {{ o.scaleDirection === 'decrease' ? 'Lower toward target' : o.scaleDirection === 'increase' ? 'Higher toward target' : o.scaleDirection }}</p>
          <div v-if="!compact && sparklinePoints(o).length" class="gpp-spark">
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
  visible: { type: Boolean, default: true },
  compact: { type: Boolean, default: false }
});

const formatDate = value => new Date(String(value).length === 10 ? `${value}T12:00:00` : value).toLocaleDateString();
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
  if (values.length < 2) return '';
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

let loadSequence = 0;
async function load() {
  const request = ++loadSequence;
  hasActivePlan.value=false;plan.value=null;goals.value=[];ratings.value=[];error.value='';loading.value=false;
  const clientId = Number(props.clientId || 0);
  const agencyId = Number(props.agencyId || 0);
  if (!clientId || !props.visible) {
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
    if(request !== loadSequence)return;
    hasActivePlan.value = !!res.data?.hasActivePlan;
    plan.value = res.data?.plan || null;
    goals.value = Array.isArray(res.data?.goals) ? res.data.goals : [];
    ratings.value = Array.isArray(res.data?.ratings) ? res.data.ratings : [];
    resolvedClientType.value = res.data?.clientType || props.clientType || '';
  } catch (e) {
    if(request !== loadSequence)return;
    hasActivePlan.value = false;
    plan.value = null;
    goals.value = [];
    ratings.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load plan progress';
  } finally {
    if(request === loadSequence)loading.value = false;
  }
}

watch(
  () => [props.clientId, props.agencyId, props.visible],
  () => {
    load();
  },
  { immediate: true }
);

defineExpose({ load });
</script>

<style scoped>
.gpp-overview{display:flex;align-items:center;gap:24px;padding:24px 0;margin-bottom:15px}.gpp-goal-count{display:flex;flex-direction:column;align-items:center;justify-content:center;width:105px;height:105px;border:10px solid var(--portal-tint,#e8f2f1);border-radius:50%;font-size:30px;font-weight:700;flex-shrink:0}.gpp-goal-count small{font-size:12px;font-weight:400}.gpp-overview h3{margin:0 0 8px;font-size:18px}.gpp-overview p{margin:5px 0;color:#536680;font-size:13px;line-height:1.6}.gpp-scale{display:flex;justify-content:space-between;gap:0;padding:12px 0 28px}.gpp-scale>span{position:relative;display:grid;gap:6px;justify-items:center;flex:1;font-size:10px}.gpp-scale>span::after{content:'';position:absolute;top:24px;left:50%;width:100%;height:3px;background:#e0e6f0}.gpp-scale>span:last-child::after{display:none}.gpp-scale i{width:10px;height:10px;background:#d6deeb;border-radius:50%;z-index:1}.gpp-scale .current i{background:var(--portal-accent,#2459ad);outline:3px solid var(--portal-tint,#e7efff)}.gpp-scale .target i{background:#218269}.gpp-scale b{position:absolute;top:36px;font-size:9px;font-weight:500;color:#526784}.gpp-direction{font-size:12px;color:#526784;margin:2px 0 6px}
@media(max-width:450px){.gpp-overview{gap:16px}.gpp-goal-count{width:80px;height:80px;border-width:7px;font-size:24px}.gpp-overview h3{font-size:16px}}

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
