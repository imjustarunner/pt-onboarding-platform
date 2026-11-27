<template>
  <div class="ctp">
    <div class="ctp-head">
      <div>
        <h3 class="ctp-title">{{ isLearning ? 'Learning plans' : 'Treatment plans' }}</h3>
        <p class="hint">
          <template v-if="isLearning">
            Goals and measurable objectives for this student, with progress over time.
            Open Note Workspace to write or update a learning plan.
          </template>
          <template v-else>
            Structured goals and measurable objectives. Every treatment plan must be acknowledged
            by the client or guardian (dashboard share, in-session witness, emailed link, or print + upload).
          </template>
        </p>
      </div>
      <div class="ctp-actions">
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
        Write a plan in Note Workspace →
      </button>
    </div>

    <div v-else class="ctp-layout" :class="{ 'ctp-layout--editing': editingDraft }">
      <aside v-if="!editingDraft" class="ctp-side">
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
            <span class="muted">Acknowledgement status</span>
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
        <div v-if="!editingDraft" class="ctp-list">
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
          <p v-if="!currentPlans.length" class="muted tiny" style="padding: 8px 4px;">
            No active or in-progress treatment plan.
            <button type="button" class="cdp-text-link" @click="openNoteAidUpdater">Write or update in Note Workspace →</button>
          </p>
        </div>

        <NoteAidTreatmentPlanImportReview v-if="editingDraft && detailPlan" :key="`draft-${detailPlan.id}`"
          open embedded mode="draft" :client-label="clientDisplayName" :plan-id="detailPlan.id" :agency-id="agencyId" :client-id="clientId"
          :initial-plan="editablePlan" @close="editingDraft=false" @draft-updated="applyChartDraft" @saved="onDraftPrepared" />

        <div v-else-if="detailPlan" class="ctp-detail">
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
            <button v-if="isEditingEligible" type="button" class="cdp-btn-primary" @click="editingDraft=true">Edit draft in chart</button>
            <button v-else type="button" class="ctp-revision-button" @click="openNoteAidUpdater">
              <img :src="NARRIVA_BRAND.icon" alt="" /> {{ isLearning ? 'Update learning plan' : 'Revise plan with Narriva' }}
            </button>
            <button
              v-if="isDiscardableDraft(detailPlan)"
              type="button"
              class="cdp-btn-soft cdp-btn-danger"
              :disabled="discardBusy"
              @click="discardDraftPlan"
            >
              {{ discardBusy ? 'Discarding…' : 'Discard draft' }}
            </button>
          </div>

          <p class="ctp-policy">Treatment plan review interval: {{ renewalPolicy.renewAfterDays }} days.<template v-if="renewalPolicy.flagEnabled"> Review reminder after {{ renewalPolicy.flagAfterDays }} days.</template><template v-if="renewalPolicy.renewByDate"> Current renewal deadline: {{ formatDateOnly(renewalPolicy.renewByDate) }}.</template></p>
          <div v-if="renewalStatus.flagged || renewalStatus.required" class="ctp-renewal" role="alert">
            <strong>{{ renewalStatus.required ? 'Treatment plan update required' : 'Treatment plan review due' }}</strong>
            <p>This plan is {{ renewalStatus.ageDays }} days old. Renewal interval: {{ renewalPolicy.renewAfterDays }} days.</p>
          </div>
          <section v-if="planSections.presentingProblem" class="ctp-goal ctp-plan-section"><h4>Presenting problem</h4><p>{{ planSections.presentingProblem }}</p></section>
          <section v-if="planSections.prescribedFrequency" class="ctp-goal ctp-plan-section"><h4>Prescribed treatment frequency</h4><p>{{ planSections.prescribedFrequency }}</p></section>
          <section v-if="!isLearning || planDiagnosesDisplay.length" class="ctp-dx">
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
                <span v-if="d.imported" class="muted"> · Imported, review in draft</span>
                <p v-if="d.justification" class="ctp-dx-just">{{ d.justification }}</p>
              </li>
            </ul>
            <p v-if="!planDiagnosesDisplay.length" class="muted">No diagnosis has been recorded for this plan.</p>
            <p v-if="planSharedJustification" class="ctp-dx-just">{{ planSharedJustification }}</p>
          </section>

          <p v-if="detailPlan?.effective_date" class="muted tiny">
            Plan date: {{ formatDateOnly(detailPlan.effective_date) }}
          </p>

          <div class="ctp-goals-head">
            <h4>Treatment Goals &amp; Objectives</h4>
            <button type="button" class="cdp-text-link" @click="expandAllGoals = !expandAllGoals">
              {{ expandAllGoals ? 'Collapse all' : 'Expand all' }}
            </button>
          </div>

          <p v-if="goalProgressNotice" role="status">{{ goalProgressNotice }}</p>
          <details v-if="canMarkGoalProgress" class="ctp-goal">
            <summary @click="loadGoalProgressHistory">Recent family progress notifications</summary>
            <p v-if="goalProgressHistoryError" class="error">{{ goalProgressHistoryError }}</p>
            <p v-else-if="!goalProgressHistory.length" class="muted tiny">No progress notifications recorded for this plan.</p>
            <ul><li v-for="event in goalProgressHistory" :key="event.id">{{ formatWhen(event.createdAt) }} · Goal #{{ event.goalId }} · {{ goalProgressLabel(event.status) }} · {{ goalDeliverySummary(event.delivery) }}</li></ul>
            <p class="muted tiny">Accepted for delivery records the email transport receipt. Inbox receipt is verified separately. Notices held for review are not automatically resent.</p>
          </details>
          <div v-if="structuredGoals.length" class="ctp-goals">
            <article
              v-for="(g, gi) in structuredGoals"
              :key="g.id"
              class="ctp-goal"
              :class="{ 'ctp-goal--collapsed': !isGoalOpen(g.id) }"
            >
              <header @click="toggleGoal(g.id)">
                <span class="ctp-pill">G{{ gi + 1 }}</span>
                <strong>{{ stripPlanHeadingPrefix(g.goal_text) || g.goal_text }}</strong>
                <span class="ctp-badge ctp-badge--ok">{{ goalProgressLabel(g.status) }}</span>
                <span class="ctp-chevron">{{ isGoalOpen(g.id) ? '▾' : '▸' }}</span>
              </header>
              <template v-if="isGoalOpen(g.id)">
                <form v-if="canMarkGoalProgress" class="ctp-progress-controls" @submit.prevent="saveGoalProgress(g)">
                  <label :for="`goal-progress-${g.id}`">Provider assessment
                    <select :id="`goal-progress-${g.id}`" :value="goalProgressChoices[g.id] || g.status || 'active'" @change="goalProgressChoices[g.id] = $event.target.value">
                      <option value="active">In progress</option><option value="improved">Improved</option><option value="achieved">Achieved</option>
                    </select>
                  </label>
                  <button type="submit" class="cdp-btn-soft" :disabled="goalProgressBusy || !goalProgressChoices[g.id] || goalProgressChoices[g.id] === (g.status || 'active')">{{ goalProgressBusy === g.id ? 'Saving…' : 'Save progress' }}</button>
                  <p class="muted tiny">A new improved or achieved assessment notifies the client or guardians who currently have plan access. Signed plan content stays intact.</p>
                </form>
                <p v-if="g.projected_completion" class="muted tiny">Timeframe: {{ g.projected_completion }}</p>
                <div
                  v-for="(o, oi) in g.objectives || []"
                  :key="o.id"
                  class="ctp-obj"
                >
                  <div class="ctp-obj__text">
                    <span class="ctp-pill ctp-pill--obj">O{{ gi + 1 }}.{{ oi + 1 }}</span>
                    <span>{{ stripPlanHeadingPrefix(o.objective_text) || o.objective_text }}</span>
                  </div>
                  <div v-if="!String(o.measurement_method || '').startsWith('Alternate measure:')" class="ctp-obj__scale">
                    <span>Start <strong>{{ o.scale_start ?? o.scale_current ?? '—' }}</strong></span>
                    <span aria-hidden="true">→</span>
                    <span>Current <strong>{{ o.scale_current ?? '—' }}</strong></span>
                    <span aria-hidden="true">→</span>
                    <span>Goal <strong class="ctp-goal-num">{{ o.scale_target ?? '—' }}</strong></span>
                    <em v-if="o.scale_direction" class="ctp-dir">{{ o.scale_direction }}</em>
                    <span v-if="o.measurement_method" class="muted">{{ o.measurement_method }}</span>
                  </div>
                  <p v-else>{{ o.measurement_method }}</p>
                  <p v-if="o.projected_completion" class="muted">Objective target date {{ formatDateOnly(o.projected_completion) }}</p>
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
                    <span class="ctp-spark__caption muted tiny">Provider observations (current → goal)</span>
                  </div>
                  <div v-if="timelineFor(o.id).length" class="ctp-timeline">
                    <span class="ctp-timeline__label">Scale over time</span>
                    <ol>
                      <li v-for="r in timelineFor(o.id)" :key="r.id">
                        <time>{{ formatWhen(r.rated_at) }}</time>
                        <span>{{ r.observer_name ? `Parent/guardian: ${r.observer_name}` : r.rater_kind === 'client' ? 'Client self-rating' : r.rater_kind === 'other' ? (r.rater_label || 'Other observer') : 'Provider observation' }}</span>
                        <span v-if="r.disposition === 'rated'">
                          {{ r.scale_value }}/10
                          <em v-if="r.progress_label">({{ r.progress_label }})</em>
                        </span>
                        <span v-else>{{ dispositionLabel(r.disposition) }}</span>
                      </li>
                    </ol>
                  </div>
                  <p v-else class="muted tiny">No ratings logged yet for this objective.</p>
                  <div v-if="o.interventions?.length" class="ctp-interventions"><strong>Linked interventions</strong>
                    <ul><li v-for="intervention in o.interventions" :key="intervention">{{ intervention }}</li></ul>
                  </div>
                  <div v-if="detailPlan.status !== 'draft'" class="ctp-kiosk-q">
                    <label>
                      Client question
                      <span v-if="o.kiosk_prompt_verified_at">Verified</span>
                      <button v-else type="button" :disabled="kioskBusy || !o.kiosk_prompt" @click="verifyQuestion(o, 'kiosk_prompt')">Verify</button>
                      <textarea
                        rows="2"
                        :value="o.kiosk_prompt || ''"
                        :disabled="kioskBusy"
                        @blur="saveKioskPrompt(o, 'kioskPrompt', $event.target.value)"
                      />
                    </label>
                    <label>
                      Other (third person)
                      <span v-if="o.kiosk_prompt_other_verified_at">Verified</span>
                      <button v-else type="button" :disabled="kioskBusy || !o.kiosk_prompt_other" @click="verifyQuestion(o, 'kiosk_prompt_other')">Verify</button>
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
            This plan has no structured goals on the chart yet. Use Note Workspace to write or paste a plan, then save to chart.
          </p>

          <section v-if="planSections.dischargePlan" class="ctp-goal ctp-plan-section"><h4>Discharge plan</h4><p>{{ planSections.dischargePlan }}</p></section>

          <TreatmentPlanApprovalPanel v-if="!isLearning && ['draft', 'active', 'final', 'finalized'].includes(detailPlan.status) && detailPlan.source_tool_id !== 'intake_packet_bootstrap'"
            :agency-id="agencyId" :client-id="clientId" :plan-id="detailPlan.id" @updated="onAckUpdated" />
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
import { splitTreatmentPlanSections } from '../../../utils/treatmentPlanSections.js';
import { formatDate } from '../../../utils/formatDate.js';
import { DEFAULT_RENEWAL_POLICY, treatmentPlanRenewalStatus } from '../../../utils/treatmentPlanRenewal.js';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../../services/api';
import { activePlanGoals, stripPlanHeadingPrefix } from '../../../utils/noteAidTreatmentHelpers.js';
import { treatmentPlanUpdaterQuery, noteAidPath } from '../../../utils/noteAidLaunch.js';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import ClientChartAvatar from './ClientChartAvatar.vue';
import NoteAidTreatmentPlanImportReview from '../../clinical/NoteAidTreatmentPlanImportReview.vue';
import TreatmentPlanApprovalPanel from '../../clinical/TreatmentPlanApprovalPanel.vue';
import { NARRIVA_BRAND } from '../../../config/narrivaBrand.js';
import TreatmentPlanAckPanel from './TreatmentPlanAckPanel.vue';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  clientType: { type: String, default: '' },
  client: { type: Object, default: null }
});
const emit=defineEmits(['navigate','updated']);

const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const goalProgressBusy = ref(null);
const goalProgressChoices = reactive({});
const goalProgressNotice = ref('');
const goalProgressHistory = ref([]);
const goalProgressHistoryError = ref('');
const canMarkGoalProgress = computed(() => !isLearning.value && ['provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'admin', 'super_admin'].includes(String(authStore.user?.role || '').toLowerCase()) && ['active', 'final', 'finalized'].includes(String(detailPlan.value?.status || '').toLowerCase()));

const isLearning = computed(() => String(props.clientType || '').toLowerCase() === 'learning');

const loading = ref(false);
const error = ref('');
const plans = ref([]);
const latestPlan = ref(null);
const diagnoses = ref([]);
const editingDraft = ref(false);
const objectiveRatings = ref([]);
const selectedId = ref(null);
const selectedFullPlan = ref(null);
const kioskBusy = ref(false);
const discardBusy = ref(false);
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
      parts.push(formatDateOnly(c.date_of_birth || c.dob));
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

const isEditingEligible = computed(() => !isLearning.value && isDiscardableDraft(detailPlan.value)
  && !!detailPlan.value.chartDraft && !detailPlan.value.providerApproved && ['provider','provider_plus','intern','intern_plus','supervisor','admin','super_admin'].includes(String(authStore.user?.role || '').toLowerCase()));
const editablePlan = computed(() => ({ ...detailPlan.value, diagnoses: detailPlan.value?.recordsImportSource?.parsed?.diagnoses?.length
  ? detailPlan.value.recordsImportSource.parsed.diagnoses : activeDiagnoses.value }));
async function onDraftPrepared(plan) {
  editingDraft.value=false;
  selectedId.value=plan?.id || null;
  selectedFullPlan.value=plan;
  await load();
  emit('updated');
}
function applyChartDraft(chartDraft) {
  applyPlanToState({ ...detailPlan.value, chartDraft });
}

const structuredGoals = computed(() => {
  const plan = detailPlan.value;
  const saved = plan?.status === 'draft' && plan.chartDraft?.value;
  const goals = activePlanGoals(plan);
  if (!saved) return goals;
  return saved.goals.map((goal, gi) => ({
    id: goals[gi]?.id || `draft-goal-${gi}`,
    goal_text: goal.goalText,
    projected_completion: goal.projectedCompletion,
    objectives: goal.objectives.map((objective, oi) => ({
      id: `draft-objective-${gi}-${oi}`,
      objective_text: objective.objectiveText,
      scale_start: objective.scaleCurrent, scale_current: objective.scaleCurrent,
      scale_target: objective.scaleTarget, scale_direction: objective.scaleDirection,
      measurement_method: objective.measurementMethod, projected_completion: objective.projectedCompletion,
      interventions: objective.interventions
    }))
  }));
});

const currentPlans = computed(() => {
  const list = plans.value || [];
  return list.filter((p) => {
    const s = String(p.status || '').toLowerCase();
    return s === 'active' || s === 'draft';
  }).slice(0, 3);
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
  return formatDate(v) || '—';
}

async function onAckUpdated() {
  const id=selectedId.value;
  await load();
  if(id && Number(selectedFullPlan.value?.id)===Number(id) && !selectedFullPlan.value.chartDraft && selectedFullPlan.value.status==='draft') await selectPlan(id);
  emit('updated');
}

const activeDiagnoses = computed(() =>
  (diagnoses.value || []).filter((d) => d && (d.is_active == null || Number(d.is_active) === 1))
);

const planDiagnosesDisplay = computed(() => {
  const plan = detailPlan.value;
  const working = plan?.chartDraft?.value;
  const normalizeDraftDiagnoses = rows => (rows || []).map(d => ({
    icd10_code: d.icd10Code || d.icd10_code || d.code,
    description: d.description, is_primary: d.isPrimary ?? d.is_primary, justification: d.justification, imported: !working
  }));
  if (working) return normalizeDraftDiagnoses(working.diagnoses);
  if (plan?.planDiagnoses?.length) return plan.planDiagnoses;
  const imported = plan?.recordsImportSource?.parsed?.diagnoses;
  return imported?.length ? normalizeDraftDiagnoses(imported) : activeDiagnoses.value;
});

const planSharedJustification = computed(() => {
  const planJust = String(
    detailPlan.value?.chartDraft?.value?.diagnosticJustification ?? (detailPlan.value?.diagnostic_justification || detailPlan.value?.diagnosticJustification || '')
  ).trim();
  return planDiagnosesDisplay.value.some(d => String(d.justification || '').trim() === planJust) ? '' : planJust;
});

const planSections = computed(() => splitTreatmentPlanSections(detailPlan.value || {}));
const renewalPolicy = ref({ ...DEFAULT_RENEWAL_POLICY });
const renewalStatus = computed(() => treatmentPlanRenewalStatus(detailPlan.value, renewalPolicy.value));

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
    (r) => r.disposition === 'rated' && r.scale_value != null && (!r.rater_kind || r.rater_kind === 'clinician')
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
  const status = String(plan?.status || '').toLowerCase();
  const raw = String(plan?.title || plan?.plan_title || '').trim();
  if (status === 'discarded' || status === 'superseded' || status === 'inactive') {
    if (/draft/i.test(raw)) return 'Discarded treatment plan draft';
    return raw || `${fallback} (archived)`;
  }
  if (status === 'draft' && plan?.providerApproved) return raw.replace(/\s+draft$/i, '') || fallback;
  if (status === 'draft') {
    return raw && !/^treatment plan$/i.test(raw) ? raw : 'Treatment plan draft';
  }
  return raw || `${fallback} #${plan?.id || ''}` || fallback;
}

function statusLabel(plan) {
  const s = String(plan?.status || plan?.plan_status || '').trim().toLowerCase();
  if (s === 'discarded' || s === 'inactive') return 'Discarded draft';
  if (s === 'superseded') return 'Superseded';
  if (s === 'draft' && plan.providerApproved) return plan.supervisorRequired === false ? 'Provider signed · Complete approval' : 'Provider signed · Supervisor review pending';
  if (s === 'draft') return 'Draft — updating';
  if (s === 'active') return 'Active';
  return s ? s.replace(/_/g, ' ') : 'On file';
}

function statusClass(plan) {
  const s = String(plan?.status || '').toLowerCase();
  if (s.includes('active') || s.includes('final')) return 'ctp-badge--ok';
  if (s.includes('draft')) return 'ctp-badge--draft';
  if (s.includes('discard') || s.includes('superseded') || s.includes('inactive')) return 'ctp-badge--archived';
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

const goalHistoryContext = () => [props.agencyId, props.clientId, detailPlan.value?.id].join(':');
async function loadGoalProgressHistory() {
  const context = goalHistoryContext();
  goalProgressHistoryError.value = '';
  try {
    const response = await api.get(`/medical-billing/treatment-plans/${detailPlan.value.id}/goal-progress`, { params: { agencyId: Number(props.agencyId), clientId: Number(props.clientId) }, skipGlobalLoading: true });
    if (context === goalHistoryContext()) goalProgressHistory.value = response.data.events || [];
  } catch (error) { if (context === goalHistoryContext()) goalProgressHistoryError.value = error.response?.data?.error?.message || 'Notification delivery history is unavailable.'; }
}
function goalDeliverySummary(delivery) {
  const labels = { sent: 'accepted for delivery', queued: 'awaiting email approval', pending: 'pending', sending: 'sending', needs_review: 'needs receipt review', skipped: 'not sent under current permissions or settings' };
  return Object.entries(delivery || {}).map(([status, count]) => `${count} ${labels[status] || status}`).join('; ') || 'No eligible family recipients';
}
function goalProgressLabel(status) { return ({ improved: 'Improved', achieved: 'Achieved', active: 'In progress' })[status] || String(status || 'In progress').replace(/_/g, ' '); }
async function saveGoalProgress(goal) {
  if (goalProgressBusy.value || !canMarkGoalProgress.value) return;
  const status = goalProgressChoices[goal.id];
  if (!status || status === (goal.status || 'active')) return;
  goalProgressBusy.value = goal.id; goalProgressNotice.value = ''; error.value = '';
  try {
    const response = await api.patch(`/medical-billing/treatment-plans/${detailPlan.value.id}/goals/${goal.id}/progress`, { agencyId: Number(props.agencyId), clientId: Number(props.clientId), status, expectedStatus: goal.status || 'active' });
    goal.status = response.data.status;
    const delivery = response.data.notifications || {};
    const followUp = Number(delivery.pending || 0) + Number(delivery.queued || 0) + Number(delivery.needs_review || 0);
    goalProgressNotice.value = `Goal marked ${goalProgressLabel(status).toLowerCase()}. ${delivery.sent ? `${delivery.sent} email(s) accepted for delivery. ` : ''}${followUp || delivery.followUpRequired ? 'Family notification needs delivery follow-up.' : delivery.skipped ? 'Some family notices were skipped because current permissions or delivery settings did not allow them.' : response.data.changed ? 'Current family access was checked for notifications.' : 'No new notification was created.'}`;
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not save goal progress.'; }
  finally { goalProgressBusy.value = null; }
}

async function selectPlan(id) {
  editingDraft.value=false;
  selectedId.value = id;
  const planId = Number(id || 0);
  if (!planId) {
    selectedFullPlan.value = null;
    return;
  }
  const latest = latestPlan.value;
  const needsDetailedPlan = isDiscardableDraft(latest) || String(latest?.source_tool_id || '').startsWith('client_records_import:');
  if (latest && Number(latest.id) === planId && latest.goals && (!needsDetailedPlan || latest.chartDraft || latest.recordsImportSource)) {
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
    if (Number(selectedId.value) !== planId || Number(props.clientId) !== clientId || Number(props.agencyId) !== agencyId) return;
    selectedFullPlan.value = res?.data?.plan || null;
  } catch {
    if (Number(selectedId.value) !== planId || Number(props.clientId) !== clientId || Number(props.agencyId) !== agencyId) return;
    selectedFullPlan.value = Number(latest?.id) === planId ? latest : (plans.value || []).find(p => Number(p.id) === planId) || null;
  }
}

function openNoteAidUpdater() {
  const matchingAgency=(agencyStore.userAgencies||[]).find(a=>Number(a.id)===Number(props.agencyId));
  const slug = matchingAgency?.portal_url || matchingAgency?.slug || (Number(agencyStore.currentAgency?.id)===Number(props.agencyId) ? agencyStore.currentAgency?.slug || agencyStore.currentAgency?.organization_slug : null) || router.currentRoute?.value?.params?.organizationSlug;
  const planId = Number(detailPlan.value?.id || latestPlan.value?.id || 0) || null;
  const status = String(detailPlan.value?.status || latestPlan.value?.status || '').toLowerCase();
  const usable = planId && !['superseded', 'inactive', 'discarded'].includes(status);
  const query = treatmentPlanUpdaterQuery(props.clientId, {
    planId: usable ? planId : null,
    // Never pass a psychotherapy CPT — treatment plan writer is sessionless / non-billable.
    serviceCode: null
  });
  if (usable && (!isDiscardableDraft(detailPlan.value) || detailPlan.value?.providerApproved)) query.revision = '1';
  router.push({ path: noteAidPath({ organizationSlug: slug }), query });
}

function isDiscardableDraft(plan) {
  return String(plan?.status || '').toLowerCase() === 'draft' && !!Number(plan?.id || 0) && !plan?.providerApproved;
}

async function discardDraftPlan() {
  const planId = Number(detailPlan.value?.id || 0);
  const clientId = Number(props.clientId || 0);
  const agencyId = Number(props.agencyId || 0);
  if (!planId || !clientId || !agencyId || discardBusy.value || !isDiscardableDraft(detailPlan.value)) return;
  if (!window.confirm('Discard this treatment plan draft? It will move to Previous and no longer count as an in-progress update.')) {
    return;
  }
  discardBusy.value = true;
  error.value = '';
  try {
    await api.post(`/medical-billing/treatment-plans/${planId}/discard`, {
      agencyId,
      clientId
    }, { skipGlobalLoading: true });
    selectedId.value = null;
    selectedFullPlan.value = null;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to discard draft.';
  } finally {
    discardBusy.value = false;
  }
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
            Number(o.id) === oid ? { ...o, [col]: next || null, [`${col}_verified_at`]: null, [`${col}_verified_by`]: null } : o
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

async function verifyQuestion(objective, field) {
  kioskBusy.value = true; error.value = '';
  try {
    const { data } = await api.patch(`/medical-billing/objectives/${objective.id}/kiosk-prompts`, { agencyId: Number(props.agencyId), clientId: Number(props.clientId), verifyField: field, expectedQuestion: objective[field] });
    objective[`${field}_verified_at`] = data.verifiedAt;
    objective[`${field}_verified_by`] = data.verifiedBy;
  } catch (e) { error.value = e.response?.data?.error?.message || 'Unable to verify the question.'; }
  finally { kioskBusy.value = false; }
}
let loadGeneration = 0;
async function load() {
  const generation = ++loadGeneration;
  const clientId = Number(props.clientId || 0);
  const agencyId = Number(props.agencyId || 0);
  if (!clientId || !agencyId) {
    plans.value = [];
    loading.value = false;
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
    if (generation !== loadGeneration) return;
    renewalPolicy.value = res.data?.treatmentPlanRenewalPolicy || { ...DEFAULT_RENEWAL_POLICY };
    plans.value = Array.isArray(res.data?.plans) ? res.data.plans : [];
    latestPlan.value = res.data?.latestPlan || null;
    diagnoses.value = Array.isArray(res.data?.diagnoses) ? res.data.diagnoses : [];
    objectiveRatings.value = Array.isArray(res.data?.objectiveRatings) ? res.data.objectiveRatings : [];
    const live = (plans.value || []).find((p) => {
      const s = String(p.status || '').toLowerCase();
      return s === 'active' || s === 'draft';
    });
    const preferredId = Number(latestPlan.value?.id || live?.id || 0);
    if (!selectedId.value && preferredId) {
      selectedId.value = preferredId;
      selectedFullPlan.value = latestPlan.value && Number(latestPlan.value.id) === preferredId
        ? latestPlan.value
        : null;
      if (!selectedFullPlan.value || isDiscardableDraft(selectedFullPlan.value) || String(selectedFullPlan.value.source_tool_id || '').startsWith('client_records_import:')) await selectPlan(preferredId);
    } else if (selectedId.value && latestPlan.value && Number(latestPlan.value.id) === Number(selectedId.value)) {
      selectedFullPlan.value = latestPlan.value;
      if (!editingDraft.value && (isDiscardableDraft(latestPlan.value) || String(latestPlan.value.source_tool_id || '').startsWith('client_records_import:'))) await selectPlan(selectedId.value);
    } else if (selectedId.value) {
      const stillThere = (plans.value || []).some((p) => Number(p.id) === Number(selectedId.value));
      if (!stillThere && preferredId) {
        selectedId.value = preferredId;
        selectedFullPlan.value = latestPlan.value;
      }
    }
  } catch (e) {
    if (generation !== loadGeneration) return;
    plans.value = [];
    latestPlan.value = null;
    diagnoses.value = [];
    objectiveRatings.value = [];
    error.value = e?.response?.data?.error?.message || 'Unable to load treatment plans.';
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

onMounted(load);
watch(() => [props.clientId, props.agencyId], () => { editingDraft.value=false; selectedId.value=null; selectedFullPlan.value=null; plans.value=[]; latestPlan.value=null; goalProgressHistory.value = []; goalProgressHistoryError.value = ''; goalProgressNotice.value = ''; Object.keys(goalProgressChoices).forEach((key) => delete goalProgressChoices[key]); load(); });
watch(selectedId, () => { goalProgressHistory.value = []; goalProgressHistoryError.value = ''; });
</script>

<style scoped>
.ctp-progress-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:10px 0}.ctp-progress-controls label{display:flex;align-items:center;gap:8px}.ctp-progress-controls select{padding:8px;border:1px solid #cbd5e1;border-radius:6px}.ctp-progress-controls p{flex-basis:100%;margin:0}

.ctp-plan-section { padding:14px; margin:12px 0; }
.ctp-plan-section p { white-space:pre-wrap; margin:8px 0; }
.ctp-renewal { border:2px solid #b45309; background:#fffbeb; padding:16px; margin:12px 0; }
.ctp-interventions { display:block; margin:12px 0; }
.ctp-interventions textarea { display:block; width:100%; box-sizing:border-box; }
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
.ctp-layout.ctp-layout--editing { grid-template-columns: minmax(0, 1fr); }
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
.ctp-badge--archived { background: #e2e8f0; color: #475569; }
.cdp-btn-danger { color: #b91c1c; border-color: #fecaca; }
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

<style scoped>
.ctp-detail { background:#fff; padding:clamp(16px,3vw,32px); border:1px solid #d9e3ed; border-radius:14px; }
.ctp-detail .ctp-goal,.ctp-detail .ctp-dx,.ctp-detail .ctp-obj { background:transparent; border-radius:0; border:0; border-bottom:1px solid #dce5ee; padding:12px 0; }
.ctp-detail .ctp-obj { border-bottom:0; border-left:2px solid #cedded; padding-left:16px; }
.ctp-revision-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:8px 14px; background:#183d66; border:1px solid #183d66; border-radius:8px; color:white; font:inherit; font-weight:700; cursor:pointer; }
.ctp-revision-button:hover { background:#235580; }
.ctp-revision-button img { width:22px; height:22px; object-fit:contain; background:white; border-radius:4px; padding:2px; }
</style>
