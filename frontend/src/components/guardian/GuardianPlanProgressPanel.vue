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
      <label v-if="availablePlans.length > 1" class="gpp-plan-picker">Learning plan
        <select v-model="selectedLearningPlan" @change="load"><option v-for="item in availablePlans" :key="item.id" :value="item.id">{{ item.title }}</option></select>
      </label>
      <div class="gpp-plan-meta">
        <strong>{{ planTitle }}</strong>
        <span v-if="plan?.status" class="muted small"> · {{ plan.status }}</span>
      </div>
      <section v-if="plan?.presentingProblem || plan?.prescribedFrequency || plan?.dischargePlan || plan?.diagnoses?.length" class="gpp-review">
        <h3>Plan details</h3>
        <template v-if="plan.presentingProblem"><h4>{{ isLearning ? 'Family summary' : 'Presenting concerns' }}</h4><p>{{ plan.presentingProblem }}</p></template>
        <template v-if="plan.prescribedFrequency"><h4>{{ isLearning ? 'Session frequency' : 'Treatment frequency' }}</h4><p>{{ plan.prescribedFrequency }}</p></template>
        <template v-for="(diagnosis, index) in plan.diagnoses || []" :key="index"><h4>{{ diagnosis.description }}</h4><p v-if="diagnosis.justification">{{ diagnosis.justification }}</p></template>
        <template v-if="plan.dischargePlan"><h4>{{ isLearning ? 'Completion criteria' : 'Discharge planning' }}</h4><p>{{ plan.dischargePlan }}</p></template>
      </section>
      <section v-if="plan?.kind === 'learning'" class="gpp-review">
        <template v-for="(label, key) in { strengths: 'Strengths', priorityNeeds: 'Priority needs', instructionalStrategies: 'Learning strategies' }" :key="key">
          <h4 v-if="plan[key]?.length">{{ label }}</h4><ul v-if="plan[key]?.length"><li v-for="(item, index) in plan[key]" :key="index">{{ item }}</li></ul>
        </template>
        <h4 v-if="Object.keys(plan.progressMonitoring || {}).length">Progress monitoring</h4>
        <dl><template v-for="(value, key) in plan.progressMonitoring || {}" :key="key"><dt>{{ String(key).replace(/_/g, ' ') }}</dt><dd>{{ typeof value === 'object' ? JSON.stringify(value) : value }}</dd></template></dl>
      </section>
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
          <div v-if="plan.kind !== 'learning'" class="gpp-obj__scale">
            <span>Provider rating <strong>{{ o.scaleCurrent ?? '—' }}</strong></span>
            <span aria-hidden="true">→</span>
            <span>Goal <strong>{{ o.scaleTarget ?? '—' }}</strong></span>
          </div>
          <p v-if="o.providerStatus" class="hint">Tutor assessment: {{ String(o.providerStatus).replace(/_/g, ' ') }}</p>
          <p v-if="o.baseline" class="hint">Starting point: {{ o.baseline }}</p>
          <p v-if="o.successCriteria" class="hint">Success criteria: {{ o.successCriteria }}</p>
          <p v-if="o.measurementMethod" class="hint">How progress is measured: {{ o.measurementMethod }}</p>
          <ul v-if="o.interventions?.length"><li v-for="item in o.interventions" :key="item">{{ item }}</li></ul>
          <ul v-if="o.learningObjectives?.length"><li v-for="(item, index) in o.learningObjectives" :key="index">{{ item.title }}<span v-if="item.description"> — {{ item.description }}</span><span v-if="item.targetDate"> (by {{ formatDate(item.targetDate) }})</span></li></ul>
          <form v-if="!compact && o.canRate && o.familyQuestion" class="gpp-family-rating" @submit.prevent="saveRating(o)">
            <label :for="`family-rating-${o.id}`">{{ o.familyQuestion }}</label>
            <p v-if="o.previousOwnRating" class="hint">Your previous rating: <strong>{{ o.previousOwnRating.value }}/10</strong> on {{ formatDate(o.previousOwnRating.ratedAt) }}.</p>
            <p v-else class="hint">This is your first rating. Your observations are saved separately from the provider’s and the other parent’s ratings.</p>
            <div class="gpp-rating-controls"><select :id="`family-rating-${o.id}`" v-model="ratingChoices[o.id]" required>
              <option disabled value="">Choose 1–10</option><option v-for="n in 10" :key="n" :value="n">{{ n }}</option>
            </select><button type="submit" class="btn btn-secondary btn-sm" :disabled="saving || !ratingChoices[o.id]">{{ saving === o.id ? 'Saving…' : 'Save my rating' }}</button></div>
          </form>
          <div v-if="!compact && plan.kind !== 'learning'" class="gpp-scale" :aria-label="`Current rating ${o.scaleCurrent ?? 'not recorded'}, target ${o.scaleTarget ?? 'not recorded'}`"><span v-for="n in 10" :key="n" :class="{current:Number(o.scaleCurrent)===n,target:Number(o.scaleTarget)===n}"><small>{{ n }}</small><i /><b v-if="Number(o.scaleCurrent)===n">Current</b><b v-else-if="Number(o.scaleTarget)===n">Target</b></span></div>
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
      <div v-if="actionError" class="error" role="alert">{{ actionError }}</div>
      <p v-if="actionSuccess" role="status">{{ actionSuccess }}</p>
      <section v-for="ack in acknowledgments" :key="ack.id" class="gpp-review">
        <h3>Your acknowledgment</h3>
        <p v-if="ack.status === 'signed'">You signed this version on {{ formatDate(ack.signedAt) }} as {{ ack.signedByName }}.</p>
        <form v-else @submit.prevent="signPlan(ack)">
          <p>Please review the plan details and goals above. Each authorized parent or guardian signs separately. A change to the plan requires a new review.</p>
          <label class="gpp-agree"><input v-model="agree" type="checkbox" required /> I have reviewed this plan and agree to sign electronically.</label>
          <label>Full name for your signature<input v-model="signedByName" type="text" autocomplete="name" maxlength="255" required /></label>
          <button class="btn btn-primary" type="submit" :disabled="saving || !agree || !signedByName.trim()">{{ saving === 'signature' ? 'Signing…' : 'Sign this plan' }}</button>
        </form>
      </section>
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
const acknowledgments = ref([]);
const availablePlans = ref([]);
const selectedLearningPlan = ref(null);
const ratingChoices = ref({});
const signedByName = ref('');
const agree = ref(false);
const saving = ref(null);
const actionError = ref('');
const actionSuccess = ref('');

async function saveRating(objective) {
  const clientId = props.clientId;
  const agencyId = props.agencyId;
  saving.value = objective.id; actionError.value = ''; actionSuccess.value = '';
  try {
    await api.post(`/guardian-portal/dependents/${clientId}/plan-progress/ratings`, {
      agencyId: Number(agencyId), planId: plan.value.id, planKind: plan.value.kind, revision: plan.value.revision,
      objectiveId: objective.id, value: Number(ratingChoices.value[objective.id])
    });
    if (clientId !== props.clientId || agencyId !== props.agencyId) return;
    await load(); actionSuccess.value = 'Your rating was saved for your provider to review.';
  } catch (e) {
    if (clientId === props.clientId && agencyId === props.agencyId) actionError.value = e?.response?.data?.error?.message || 'Could not save your rating.';
  } finally { saving.value = null; }
}

async function signPlan(ack) {
  const clientId = props.clientId;
  const agencyId = props.agencyId;
  saving.value = 'signature'; actionError.value = ''; actionSuccess.value = '';
  try {
    await api.post(`/guardian-portal/dependents/${clientId}/plan-progress/acknowledgments/${ack.id}`, {
      agencyId: Number(agencyId), planId: plan.value.id, planKind: plan.value.kind, revision: plan.value.revision, signedByName: signedByName.value.trim(), agree: agree.value
    });
    if (clientId !== props.clientId || agencyId !== props.agencyId) return;
    await load(); actionSuccess.value = 'Your acknowledgment was saved. Other guardians sign through their own accounts.';
  } catch (e) {
    if (clientId === props.clientId && agencyId === props.agencyId) actionError.value = e?.response?.data?.error?.message || 'Could not save your acknowledgment.';
  } finally { saving.value = null; }
}

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
  acknowledgments.value=[];ratingChoices.value={};agree.value=false;
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
      params: { agencyId, ...(selectedLearningPlan.value ? { learningPlanId: selectedLearningPlan.value } : {}) },
      skipGlobalLoading: true
    });
    if(request !== loadSequence)return;
    hasActivePlan.value = !!res.data?.hasActivePlan;
    plan.value = res.data?.plan || null;
    goals.value = Array.isArray(res.data?.goals) ? res.data.goals : [];
    ratings.value = Array.isArray(res.data?.ratings) ? res.data.ratings : [];
    acknowledgments.value = Array.isArray(res.data?.acknowledgments) ? res.data.acknowledgments : [];
    availablePlans.value = Array.isArray(res.data?.availablePlans) ? res.data.availablePlans : [];
    if (res.data?.plan?.kind === 'learning') selectedLearningPlan.value = res.data.plan.id;
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
    actionError.value='';actionSuccess.value='';signedByName.value='';saving.value=null;
    availablePlans.value=[];selectedLearningPlan.value=null;
    load();
  },
  { immediate: true }
);

defineExpose({ load });
</script>

<style scoped>
.gpp-family-rating,.gpp-review{margin-top:16px;padding:16px;border:1px solid #cbdedb;border-radius:10px;background:#f5faf8}.gpp-family-rating label,.gpp-review label{display:block;font-weight:600;line-height:1.5}.gpp-review p{white-space:pre-wrap;line-height:1.6}.gpp-review h4{margin:12px 0 4px}.gpp-review input[type=text]{display:block;width:100%;max-width:420px;padding:10px;border:1px solid #b7cbc6;border-radius:6px;margin:6px 0 12px}.gpp-rating-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.gpp-rating-controls select{padding:9px;border:1px solid #b7cbc6;border-radius:6px}.gpp-agree{margin-bottom:12px}.gpp-agree input{margin-right:8px}
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
