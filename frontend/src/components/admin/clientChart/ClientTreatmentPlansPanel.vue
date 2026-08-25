<template>
  <div class="ctp">
    <div class="ctp-head">
      <div>
        <h3 class="ctp-title">Treatment plans</h3>
        <p class="hint">
          Structured goals and measurable objectives on the clinical chart, with scale history over time.
          Open Note Aid to write or update a plan for this client.
        </p>
      </div>
      <div class="ctp-actions">
        <button type="button" class="cdp-btn-soft" @click="openNoteAidUpdater">
          Update in Note Aid
        </button>
        <button type="button" class="cdp-btn-soft" @click="$emit('navigate', 'clinical-notes')">
          Clinical notes
        </button>
        <button type="button" class="cdp-btn-soft" :disabled="loading" @click="load">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading && !plans.length" class="muted">Loading treatment plans…</div>
    <div v-else-if="!plans.length" class="muted">
      No treatment plans on file yet.
      <button type="button" class="cdp-text-link" style="margin-left: 6px;" @click="openNoteAidUpdater">
        Write a plan in Note Aid →
      </button>
    </div>
    <div v-else class="ctp-list">
      <article
        v-for="plan in plans"
        :key="plan.id"
        class="ctp-card"
        :class="{ 'ctp-card--active': Number(selectedId) === Number(plan.id) }"
        @click="selectPlan(plan.id)"
      >
        <div class="ctp-card__top">
          <strong>{{ planTitle(plan) }}</strong>
          <span class="ctp-badge" :class="statusClass(plan)">{{ statusLabel(plan) }}</span>
        </div>
        <div class="muted tiny">
          Updated {{ formatWhen(plan.updated_at || plan.created_at) }}
        </div>
      </article>
    </div>

    <div v-if="detailPlan" class="ctp-detail">
      <div class="ctp-detail__head">
        <div>
          <h4>{{ planTitle(detailPlan) }}</h4>
          <p class="muted tiny">Status: {{ statusLabel(detailPlan) }}</p>
        </div>
        <button type="button" class="cdp-btn-soft" @click="openNoteAidUpdater">Open updater</button>
      </div>

      <div v-if="planDiagnosesDisplay.length" class="ctp-dx">
        <strong>Diagnosis on file</strong>
        <ul>
              <li v-for="d in planDiagnosesDisplay" :key="d.id || d.icd10_code || d.diagnosis_id">
                <code>{{ d.icd10_code }}</code>
                {{ d.description || '' }}
                <em v-if="d.is_primary">primary</em>
                <p v-if="d.justification" class="ctp-dx-just">{{ d.justification }}</p>
              </li>
            </ul>
          </div>

      <p v-if="detailPlan?.effective_date" class="muted tiny">
        Plan date: {{ formatWhen(detailPlan.effective_date) }}
      </p>

      <div v-if="structuredGoals.length" class="ctp-goals">
        <article v-for="g in structuredGoals" :key="g.id" class="ctp-goal">
          <header>
            <span class="ctp-pill">G{{ g.goal_index }}</span>
            <strong>{{ g.goal_text }}</strong>
          </header>
          <p v-if="g.projected_completion" class="muted tiny">Timeframe: {{ g.projected_completion }}</p>
          <div
            v-for="o in g.objectives || []"
            :key="o.id"
            class="ctp-obj"
          >
            <div class="ctp-obj__text">
              <span class="ctp-pill ctp-pill--obj">O{{ o.objective_index }}</span>
              <span>{{ o.objective_text }}</span>
            </div>
            <div class="ctp-obj__scale">
              <span>Current <strong>{{ o.scale_current ?? '—' }}</strong></span>
              <span aria-hidden="true">→</span>
              <span>Goal <strong class="ctp-goal-num">{{ o.scale_target ?? '—' }}</strong></span>
              <em v-if="o.scale_direction" class="ctp-dir">{{ o.scale_direction }}</em>
              <span v-if="o.measurement_method" class="muted">{{ o.measurement_method }}</span>
            </div>
            <div v-if="timelineFor(o.id).length" class="ctp-timeline">
              <span class="ctp-timeline__label">Scale over time</span>
              <ol>
                <li v-for="r in timelineFor(o.id)" :key="r.id">
                  <time>{{ formatWhen(r.rated_at) }}</time>
                  <span v-if="r.disposition === 'rated'">
                    {{ r.scale_value }}/10
                    <em v-if="r.progress_label">({{ r.progress_label }})</em>
                  </span>
                  <span v-else>{{ dispositionLabel(r.disposition) }}</span>
                </li>
              </ol>
            </div>
            <p v-else class="muted tiny">No ratings logged yet for this objective.</p>
          </div>
        </article>
      </div>
      <p v-else class="muted">
        This plan has no structured goals on the chart yet. Use Note Aid to write or paste a plan, then save to chart.
      </p>

      <details v-if="dischargePlan" class="ctp-discharge">
        <summary>Discharge plan</summary>
        <pre>{{ dischargePlan }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../../services/api';
import { activePlanGoals } from '../../../utils/noteAidTreatmentHelpers.js';
import { treatmentPlanUpdaterQuery, noteAidPath } from '../../../utils/noteAidLaunch.js';
import { useAgencyStore } from '../../../store/agency';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null }
});
defineEmits(['navigate']);

const router = useRouter();
const agencyStore = useAgencyStore();

const loading = ref(false);
const error = ref('');
const plans = ref([]);
const latestPlan = ref(null);
const diagnoses = ref([]);
const objectiveRatings = ref([]);
const selectedId = ref(null);
const selectedFullPlan = ref(null);

const detailPlan = computed(() => {
  const id = Number(selectedId.value || 0);
  if (selectedFullPlan.value && Number(selectedFullPlan.value.id) === id) return selectedFullPlan.value;
  if (latestPlan.value && Number(latestPlan.value.id) === id) return latestPlan.value;
  return (plans.value || []).find((p) => Number(p.id) === id) || null;
});

const structuredGoals = computed(() => activePlanGoals(detailPlan.value));

const activeDiagnoses = computed(() =>
  (diagnoses.value || []).filter((d) => d && (d.is_active == null || Number(d.is_active) === 1))
);

const planDiagnosesDisplay = computed(() => {
  const fromPlan = Array.isArray(detailPlan.value?.planDiagnoses)
    ? detailPlan.value.planDiagnoses
    : [];
  if (fromPlan.length) {
    return fromPlan.map((d) => ({
      id: d.id || d.diagnosis_id,
      icd10_code: d.icd10_code,
      description: d.description,
      is_primary: d.is_primary,
      justification: d.justification
    }));
  }
  return activeDiagnoses.value;
});

const dischargePlan = computed(() =>
  String(detailPlan.value?.discharge_plan || detailPlan.value?.dischargePlan || '').trim()
);

const ratingsByObjective = computed(() => {
  const map = {};
  for (const r of objectiveRatings.value || []) {
    const oid = String(r.objective_id);
    if (!map[oid]) map[oid] = [];
    map[oid].push(r);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.rated_at) - new Date(b.rated_at));
  }
  return map;
});

function timelineFor(objectiveId) {
  return ratingsByObjective.value[String(objectiveId)] || [];
}

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

function dispositionLabel(d) {
  return String(d || '').replace(/_/g, ' ');
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

async function selectPlan(id) {
  selectedId.value = id;
  const planId = Number(id || 0);
  if (!planId) {
    selectedFullPlan.value = null;
    return;
  }
  if (latestPlan.value && Number(latestPlan.value.id) === planId) {
    selectedFullPlan.value = latestPlan.value;
    return;
  }
  // Chart list is summary-only; re-fetch chart when selecting non-latest to get nested goals if available.
  if (plans.value.length && Number(plans.value[0]?.id) === planId && latestPlan.value) {
    selectedFullPlan.value = latestPlan.value;
  }
}

function openNoteAidUpdater() {
  const slug = agencyStore.currentAgency?.slug || agencyStore.currentAgency?.organization_slug;
  const query = treatmentPlanUpdaterQuery(props.clientId);
  router.push({ path: noteAidPath({ organizationSlug: slug }), query });
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
    diagnoses.value = Array.isArray(res.data?.diagnoses) ? res.data.diagnoses : [];
    objectiveRatings.value = Array.isArray(res.data?.objectiveRatings) ? res.data.objectiveRatings : [];
    if (!selectedId.value && plans.value[0]?.id) {
      selectedId.value = plans.value[0].id;
      selectedFullPlan.value = latestPlan.value;
    } else if (selectedId.value && latestPlan.value && Number(latestPlan.value.id) === Number(selectedId.value)) {
      selectedFullPlan.value = latestPlan.value;
    }
  } catch (e) {
    plans.value = [];
    latestPlan.value = null;
    diagnoses.value = [];
    objectiveRatings.value = [];
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
.ctp-detail__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.ctp-detail h4 { margin: 0 0 4px; }
.ctp-dx {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 10px;
  font-size: 0.88rem;
}
.ctp-dx ul { margin: 6px 0 0; padding-left: 18px; }
.ctp-dx em { color: #0f766e; font-style: normal; font-weight: 700; margin-left: 6px; }
.ctp-dx-just {
  margin: 4px 0 0;
  white-space: pre-wrap;
  font-size: 0.8rem;
  color: #475569;
}
.ctp-goals { display: flex; flex-direction: column; gap: 12px; }
.ctp-goal {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.ctp-goal header {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 6px;
}
.ctp-pill {
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
.ctp-pill--obj { background: #0d9488; }
.ctp-obj {
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.ctp-obj__text {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.9rem;
}
.ctp-obj__scale {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 0.82rem;
  color: #334155;
}
.ctp-goal-num { color: #15803d; }
.ctp-dir {
  font-style: normal;
  font-size: 0.72rem;
  font-weight: 700;
  color: #0f766e;
  text-transform: uppercase;
}
.ctp-timeline {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #cbd5e1;
}
.ctp-timeline__label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.ctp-timeline ol {
  margin: 0;
  padding-left: 18px;
  font-size: 0.8rem;
  color: #475569;
}
.ctp-timeline li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}
.ctp-timeline time { color: #94a3b8; min-width: 140px; }
.ctp-timeline em { font-style: normal; color: #0f766e; font-weight: 600; }
.ctp-discharge {
  margin-top: 14px;
  font-size: 0.88rem;
}
.ctp-discharge pre {
  white-space: pre-wrap;
  background: #f8fafc;
  padding: 10px;
  border-radius: 8px;
  font-size: 0.82rem;
}
</style>
