<template>
  <div class="ctp">
    <div class="ctp-head">
      <div>
        <h3 class="ctp-title">{{ isLearning ? 'Learning plans' : 'Treatment plans' }}</h3>
        <p class="hint">
          <template v-if="isLearning">
            Goals and measurable objectives for this student, with progress over time.
            Open Note Aid to write or update a learning plan.
          </template>
          <template v-else>
            Structured goals and measurable objectives. Every treatment plan must be acknowledged
            by the client or guardian (dashboard share, in-session witness, emailed link, or print + upload).
          </template>
        </p>
      </div>
      <div class="ctp-actions">
        <button type="button" class="cdp-btn-soft" @click="openNoteAidUpdater">
          Update in Note Aid
        </button>
        <button type="button" class="cdp-btn-soft" @click="$emit('navigate', 'notes')">
          {{ isLearning ? 'Learning notes' : 'Notes' }}
        </button>
        <button type="button" class="cdp-btn-soft" :disabled="loading" @click="load">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading && !plans.length" class="muted">
      Loading {{ isLearning ? 'learning' : 'treatment' }} plans…
    </div>
    <div v-else-if="!plans.length" class="muted">
      No {{ isLearning ? 'learning' : 'treatment' }} plans on file yet.
      <button type="button" class="cdp-text-link" style="margin-left: 6px;" @click="openNoteAidUpdater">
        Write a plan in Note Aid →
      </button>
    </div>

    <div v-else class="ctp-layout">
      <aside class="ctp-side">
        <div class="ctp-profile">
          <ClientChartAvatar
            :initials="clientInitials"
            :full-name="clientDisplayName"
            :photo-path="clientPhotoPath"
            size="lg"
          />
          <div>
            <strong class="ctp-profile__name">{{ clientDisplayName }}</strong>
            <p class="muted tiny">{{ clientMetaLine }}</p>
          </div>
        </div>
        <div v-if="detailPlan" class="ctp-overview">
          <div><span class="muted">Status</span> <strong :class="statusClass(detailPlan)">{{ statusLabel(detailPlan) }}</strong></div>
          <div v-if="detailPlan.effective_date"><span class="muted">Plan start</span> <strong>{{ formatDateOnly(detailPlan.effective_date) }}</strong></div>
          <div><span class="muted">Last updated</span> <strong>{{ formatWhen(detailPlan.updated_at || detailPlan.created_at) }}</strong></div>
          <div v-if="primaryDxLabel"><span class="muted">Primary diagnosis</span> <strong>{{ primaryDxLabel }}</strong></div>
          <div v-if="detailPlan.client_ack_status">
            <span class="muted">Client ack</span>
            <strong>{{ String(detailPlan.client_ack_status).replace(/_/g, ' ') }}</strong>
          </div>
        </div>
        <div v-if="detailPlan" class="ctp-glance">
          <div><strong>{{ structuredGoals.length }}</strong><span>Goals</span></div>
          <div><strong>{{ objectiveCount }}</strong><span>Objectives</span></div>
          <div><strong>{{ ratingsCount }}</strong><span>Ratings</span></div>
        </div>
      </aside>

      <div class="ctp-main">
        <div class="ctp-list">
          <article
            v-for="plan in currentPlans"
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
            <label class="ctp-kiosk-toggle" @click.stop>
              <input
                type="checkbox"
                :checked="!!Number(detailPlan.kiosk_share_enabled || 0)"
                :disabled="kioskBusy"
                @change="toggleKioskShare($event.target.checked)"
              />
              Share via kiosk
            </label>
            <button type="button" class="cdp-btn-soft" @click="openNoteAidUpdater">Open updater</button>
          </div>

          <div v-if="planDiagnosesDisplay.length" class="ctp-dx">
            <div class="ctp-dx__head">
              <strong>{{ isLearning ? 'Areas of concern' : 'Diagnosis summary' }}</strong>
              <button type="button" class="cdp-text-link" @click="$emit('navigate', 'intake-note')">
                View full intake note →
              </button>
            </div>
            <ul>
              <li v-for="d in planDiagnosesDisplay" :key="d.id || d.icd10_code || d.diagnosis_id">
                <code v-if="d.icd10_code && !isLearningConcernCode(d.icd10_code)">{{ d.icd10_code }}</code>
                {{ d.description || '' }}
                <em v-if="d.is_primary">primary</em>
              </li>
            </ul>
            <p v-if="planSharedJustification" class="ctp-dx-just">{{ planSharedJustification }}</p>
          </div>

          <p v-if="detailPlan?.effective_date" class="muted tiny">
            Plan date: {{ formatWhen(detailPlan.effective_date) }}
          </p>

          <div class="ctp-goals-head">
            <h4>Treatment Goals &amp; Objectives</h4>
            <button type="button" class="cdp-text-link" @click="expandAllGoals = !expandAllGoals">
              {{ expandAllGoals ? 'Collapse all' : 'Expand all' }}
            </button>
          </div>

          <div v-if="structuredGoals.length" class="ctp-goals">
            <article
              v-for="g in structuredGoals"
              :key="g.id"
              class="ctp-goal"
              :class="{ 'ctp-goal--collapsed': !isGoalOpen(g.id) }"
            >
              <header @click="toggleGoal(g.id)">
                <span class="ctp-pill">G{{ g.goal_index }}</span>
                <strong>{{ g.goal_text }}</strong>
                <span class="ctp-badge ctp-badge--ok">On track</span>
                <span class="ctp-chevron">{{ isGoalOpen(g.id) ? '▾' : '▸' }}</span>
              </header>
              <template v-if="isGoalOpen(g.id)">
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
                    <span>Start <strong>{{ o.scale_start ?? o.scale_current ?? '—' }}</strong></span>
                    <span aria-hidden="true">→</span>
                    <span>Current <strong>{{ o.scale_current ?? '—' }}</strong></span>
                    <span aria-hidden="true">→</span>
                    <span>Goal <strong class="ctp-goal-num">{{ o.scale_target ?? '—' }}</strong></span>
                    <em v-if="o.scale_direction" class="ctp-dir">{{ o.scale_direction }}</em>
                    <span v-if="o.measurement_method" class="muted">{{ o.measurement_method }}</span>
                  </div>
                  <div v-if="sparklinePoints(o).length" class="ctp-spark">
                    <svg
                      viewBox="0 0 100 28"
                      preserveAspectRatio="none"
                      class="ctp-spark__svg"
                      role="img"
                      :aria-label="`Progress toward goal ${o.scale_target ?? ''}`"
                    >
                      <line
                        v-if="o.scale_target != null"
                        class="ctp-spark__goal"
                        x1="0"
                        :y1="scaleY(o.scale_target)"
                        x2="100"
                        :y2="scaleY(o.scale_target)"
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
                    <span class="ctp-spark__caption muted tiny">Progress (current → goal)</span>
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
                  <div class="ctp-kiosk-q" :class="{ faded: !Number(detailPlan.kiosk_share_enabled || 0) }">
                    <label>
                      Client question
                      <textarea
                        rows="2"
                        :value="o.kiosk_prompt || ''"
                        :disabled="kioskBusy"
                        @blur="saveKioskPrompt(o, 'kioskPrompt', $event.target.value)"
                      />
                    </label>
                    <label>
                      Other (third person)
                      <textarea
                        rows="2"
                        :value="o.kiosk_prompt_other || ''"
                        :disabled="kioskBusy"
                        @blur="saveKioskPrompt(o, 'kioskPromptOther', $event.target.value)"
                      />
                    </label>
                  </div>
                </div>
              </template>
            </article>
          </div>
          <p v-else class="muted">
            This plan has no structured goals on the chart yet. Use Note Aid to write or paste a plan, then save to chart.
          </p>

          <details v-if="dischargePlan" class="ctp-discharge">
            <summary>Discharge plan</summary>
            <pre>{{ dischargePlan }}</pre>
          </details>

          <TreatmentPlanAckPanel
            v-if="!isLearning && detailPlan?.id"
            class="ctp-ack"
            :agency-id="agencyId"
            :client-id="clientId"
            :plan-id="detailPlan.id"
            :client-name="clientDisplayName"
            @updated="onAckUpdated"
          />
        </div>

        <section v-if="previousPlans.length" class="ctp-previous">
          <h4>Previous Treatment Plans</h4>
          <div
            v-for="plan in previousPlans"
            :key="`prev-${plan.id}`"
            class="ctp-previous__row"
          >
            <span class="ctp-previous__chevron" aria-hidden="true">›</span>
            <div class="ctp-previous__label">
              {{ planTitle(plan) }}
              <span class="muted">({{ formatDateOnly(plan.effective_date || plan.created_at) }})</span>
            </div>
            <span class="ctp-badge" :class="statusClass(plan)">{{ statusLabel(plan) }}</span>
            <button type="button" class="cdp-text-link" @click="selectPlan(plan.id)">View summary →</button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../../services/api';
import { activePlanGoals } from '../../../utils/noteAidTreatmentHelpers.js';
import { treatmentPlanUpdaterQuery, noteAidPath } from '../../../utils/noteAidLaunch.js';
import { useAgencyStore } from '../../../store/agency';
import ClientChartAvatar from './ClientChartAvatar.vue';
import TreatmentPlanAckPanel from './TreatmentPlanAckPanel.vue';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  clientType: { type: String, default: '' },
  client: { type: Object, default: null }
});
defineEmits(['navigate']);

const router = useRouter();
const agencyStore = useAgencyStore();

const isLearning = computed(() => String(props.clientType || '').toLowerCase() === 'learning');

const loading = ref(false);
const error = ref('');
const plans = ref([]);
const latestPlan = ref(null);
const diagnoses = ref([]);
const objectiveRatings = ref([]);
const selectedId = ref(null);
const selectedFullPlan = ref(null);
const kioskBusy = ref(false);
const expandAllGoals = ref(true);
const openGoalIds = reactive({});

const clientDisplayName = computed(() => {
  const c = props.client || {};
  return String(c.full_name || c.name || c.initials || `Client ${props.clientId}`).trim();
});
const clientInitials = computed(() => String(props.client?.initials || '').trim());
const clientPhotoPath = computed(() =>
  props.client?.chart_photo_path || props.client?.chartPhotoPath || null
);
const clientMetaLine = computed(() => {
  const c = props.client || {};
  const parts = [];
  if (c.age != null && c.age !== '') parts.push(`${c.age} yrs`);
  if (c.date_of_birth || c.dob) {
    try {
      parts.push(new Date(c.date_of_birth || c.dob).toLocaleDateString());
    } catch {
      /* ignore */
    }
  }
  if (c.identifier_code || c.id) parts.push(`ID: ${c.identifier_code || c.id}`);
  return parts.join(' · ') || 'Chart profile';
});

const detailPlan = computed(() => {
  const id = Number(selectedId.value || 0);
  if (selectedFullPlan.value && Number(selectedFullPlan.value.id) === id) return selectedFullPlan.value;
  if (latestPlan.value && Number(latestPlan.value.id) === id) return latestPlan.value;
  return (plans.value || []).find((p) => Number(p.id) === id) || null;
});

const structuredGoals = computed(() => activePlanGoals(detailPlan.value));

const currentPlans = computed(() => {
  const list = plans.value || [];
  if (list.length <= 1) return list;
  // Show active/draft selected first in the main list; rest go to Previous
  const active = list.filter((p) => {
    const s = String(p.status || '').toLowerCase();
    return s === 'active' || s === 'draft' || Number(p.id) === Number(selectedId.value);
  });
  return active.length ? active.slice(0, 2) : list.slice(0, 1);
});

const previousPlans = computed(() => {
  const shown = new Set(currentPlans.value.map((p) => Number(p.id)));
  return (plans.value || []).filter((p) => !shown.has(Number(p.id)));
});

const objectiveCount = computed(() =>
  structuredGoals.value.reduce((n, g) => n + (g.objectives || []).length, 0)
);
const ratingsCount = computed(() => (objectiveRatings.value || []).length);

const primaryDxLabel = computed(() => {
  const rows = planDiagnosesDisplay.value || [];
  const primary = rows.find((d) => d && (d.is_primary || d.isPrimary)) || rows[0];
  if (!primary) return '';
  return [primary.icd10_code, primary.description].filter(Boolean).join(' ');
});

function isGoalOpen(id) {
  if (expandAllGoals.value) return true;
  if (openGoalIds[id] == null) return true;
  return !!openGoalIds[id];
}
function toggleGoal(id) {
  expandAllGoals.value = false;
  openGoalIds[id] = !isGoalOpen(id);
}

function formatDateOnly(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v);
  }
}

async function onAckUpdated() {
  await load();
}

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

const planSharedJustification = computed(() => {
  const planJust = String(
    detailPlan.value?.diagnostic_justification || detailPlan.value?.diagnosticJustification || ''
  ).trim();
  if (planJust) return planJust;
  const rows = planDiagnosesDisplay.value || [];
  const primary = rows.find((d) => d && (d.is_primary || d.isPrimary));
  return String(primary?.justification || rows.find((d) => d?.justification)?.justification || '').trim();
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

/** Fixed 1–10 y-domain for objective scale sparklines. */
function scaleY(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 14;
  const clamped = Math.min(10, Math.max(1, n));
  return 26 - ((clamped - 1) / 9) * 24;
}

function sparklinePoints(objective) {
  const rated = timelineFor(objective?.id).filter(
    (r) => r.disposition === 'rated' && r.scale_value != null
  );
  const values = rated.map((r) => Number(r.scale_value));
  if (!values.length && objective?.scale_current != null) {
    values.push(Number(objective.scale_current));
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

function isLearningConcernCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return !c || c.startsWith('LC-') || c === 'LEARNING' || c === 'CONCERN';
}

function planTitle(plan) {
  const fallback = isLearning.value ? 'Learning plan' : 'Treatment plan';
  return String(plan?.title || plan?.plan_title || `${fallback} #${plan?.id || ''}`).trim() || fallback;
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
  if (latestPlan.value && Number(latestPlan.value.id) === planId && latestPlan.value.goals) {
    selectedFullPlan.value = latestPlan.value;
    return;
  }
  const agencyId = Number(props.agencyId || 0);
  const clientId = Number(props.clientId || 0);
  if (!agencyId || !clientId) return;
  try {
    const res = await api.get(`/medical-billing/treatment-plans/${planId}`, {
      params: { agencyId, clientId },
      skipGlobalLoading: true
    });
    selectedFullPlan.value = res?.data?.plan || null;
  } catch {
    selectedFullPlan.value = (plans.value || []).find((p) => Number(p.id) === planId) || null;
  }
}

function openNoteAidUpdater() {
  const slug = agencyStore.currentAgency?.slug || agencyStore.currentAgency?.organization_slug;
  const query = treatmentPlanUpdaterQuery(props.clientId);
  router.push({ path: noteAidPath({ organizationSlug: slug }), query });
}

function applyPlanToState(plan) {
  if (!plan) return;
  selectedFullPlan.value = plan;
  if (latestPlan.value && Number(latestPlan.value.id) === Number(plan.id)) {
    latestPlan.value = plan;
  }
  plans.value = (plans.value || []).map((p) => (
    Number(p.id) === Number(plan.id) ? { ...p, kiosk_share_enabled: plan.kiosk_share_enabled } : p
  ));
}

async function toggleKioskShare(enabled) {
  const planId = Number(detailPlan.value?.id || 0);
  const clientId = Number(props.clientId || 0);
  const agencyId = Number(props.agencyId || 0);
  if (!planId || !clientId || !agencyId) return;
  kioskBusy.value = true;
  try {
    const res = await api.patch(`/medical-billing/treatment-plans/${planId}/kiosk-share`, {
      agencyId,
      clientId,
      enabled: !!enabled
    });
    applyPlanToState(res.data?.plan || { ...detailPlan.value, kiosk_share_enabled: enabled ? 1 : 0 });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to update kiosk sharing.';
  } finally {
    kioskBusy.value = false;
  }
}

async function saveKioskPrompt(objective, field, value) {
  const clientId = Number(props.clientId || 0);
  const agencyId = Number(props.agencyId || 0);
  const oid = Number(objective?.id || 0);
  if (!oid || !clientId || !agencyId) return;
  const next = String(value || '').trim();
  const prev = field === 'kioskPromptOther'
    ? String(objective.kiosk_prompt_other || '').trim()
    : String(objective.kiosk_prompt || '').trim();
  if (next === prev) return;
  kioskBusy.value = true;
  try {
    await api.patch(`/medical-billing/objectives/${oid}/kiosk-prompts`, {
      agencyId,
      clientId,
      [field]: next || null
    });
    const col = field === 'kioskPromptOther' ? 'kiosk_prompt_other' : 'kiosk_prompt';
    const patchObj = (plan) => {
      if (!plan?.goals) return plan;
      return {
        ...plan,
        goals: plan.goals.map((g) => ({
          ...g,
          objectives: (g.objectives || []).map((o) => (
            Number(o.id) === oid ? { ...o, [col]: next || null } : o
          ))
        }))
      };
    };
    if (selectedFullPlan.value) selectedFullPlan.value = patchObj(selectedFullPlan.value);
    if (latestPlan.value) latestPlan.value = patchObj(latestPlan.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to save kiosk question.';
  } finally {
    kioskBusy.value = false;
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
.ctp-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .ctp-layout { grid-template-columns: 1fr; }
}
.ctp-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 12px;
}
.ctp-profile {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #fff;
}
.ctp-profile__name { display: block; font-size: 0.95rem; }
.ctp-overview {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #f8fafc;
  font-size: 0.82rem;
}
.ctp-overview > div { display: flex; flex-direction: column; gap: 2px; }
.ctp-glance {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #fff;
  text-align: center;
}
.ctp-glance strong { display: block; font-size: 1.1rem; color: #166534; }
.ctp-glance span { font-size: 0.7rem; color: #64748b; font-weight: 650; }
.ctp-main { min-width: 0; }
.ctp-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.ctp-goals-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0 8px;
}
.ctp-goals-head h4 { margin: 0; font-size: 0.95rem; }
.ctp-goal header { cursor: pointer; }
.ctp-goal--collapsed .ctp-obj { display: none; }
.ctp-chevron { margin-left: auto; color: #64748b; }
.ctp-dx__head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.ctp-ack { margin-top: 18px; }
.ctp-previous {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.ctp-previous h4 {
  margin: 0 0 10px;
  font-size: 0.95rem;
  color: #0f172a;
}
.ctp-previous__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  border-bottom: 1px solid #f1f5f9;
  flex-wrap: wrap;
}
.ctp-previous__chevron { color: #94a3b8; }
.ctp-previous__label { flex: 1; min-width: 160px; font-weight: 650; }
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
.ctp-kiosk-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #0f766e;
  white-space: nowrap;
}
.ctp-kiosk-q {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
.ctp-kiosk-q.faded label,
.ctp-kiosk-q.faded textarea {
  color: #94a3b8;
}
.ctp-kiosk-q label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
}
.ctp-kiosk-q textarea {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.8rem;
  font-weight: 500;
  color: #334155;
  resize: vertical;
}
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
.ctp-spark {
  margin-top: 10px;
  max-width: 220px;
  color: #0f766e;
}
.ctp-spark__svg {
  display: block;
  width: 100%;
  height: 36px;
  background: #f1f5f9;
  border-radius: 6px;
}
.ctp-spark__goal {
  stroke: #86efac;
  stroke-width: 1;
  stroke-dasharray: 3 2;
}
.ctp-spark__caption {
  display: block;
  margin-top: 2px;
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
