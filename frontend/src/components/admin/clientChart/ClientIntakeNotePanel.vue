<template>
  <div class="cin">
    <!-- Header -->
    <header class="cin-header">
      <div class="cin-header__title-row">
        <h3 class="cin-title">Intake Note</h3>
        <span class="cin-badge">Intake</span>
        <span v-if="copyFlash" class="cin-copy-flash">{{ copyFlash }}</span>
      </div>
      <div class="cin-header__actions">
        <button
          v-if="draft?.id"
          type="button"
          class="cdp-btn-primary"
          :disabled="busy"
          @click="openNoteAidIntake"
        >
          Edit Note
        </button>
        <div v-if="assignedProvider" class="cin-more-wrap">
          <button
            type="button"
            class="cdp-btn-soft"
            :disabled="busy"
            aria-haspopup="menu"
            :aria-expanded="showMoreMenu"
            @click="showMoreMenu = !showMoreMenu"
          >
            More ▾
          </button>
          <div v-if="showMoreMenu" class="cin-more-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              :disabled="busy || isHistoricalView || draft?.status === 'final'"
              @click="runMoreAction('generate')"
            >
              {{ busy && busyAction === 'generate' ? 'Generating…' : (draft ? 'Regenerate draft' : 'Generate draft') }}
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="busy || isHistoricalView"
              @click="runMoreAction('import')"
            >
              {{ draft?.status === 'final' ? 'Replace / re-import intake' : 'Import pasted intake' }}
            </button>
            <button
              v-if="draft?.sections?.length"
              type="button"
              role="menuitem"
              @click="runMoreAction('copy')"
            >
              Copy all sections
            </button>
          </div>
        </div>
      </div>
    </header>

    <div v-if="phiBanner" class="phi-warning cin-phi">
      <strong>PHI access</strong>
      <span class="muted"> Chart demographics stay on this page for copy — they are never sent to the note writer.</span>
    </div>

    <div v-if="isHistoricalView" class="cin-history-banner">
      <span>Viewing a previous intake note.</span>
      <button type="button" class="cdp-text-link" @click="backToCurrent">Back to current</button>
    </div>

    <!-- Client info bar -->
    <div class="cin-client-bar">
      <ClientChartAvatar
        :initials="clientInitials"
        :full-name="clientName"
        :photo-path="clientPhotoPath"
        size="md"
      />
      <div class="cin-client-bar__info">
        <strong class="cin-client-bar__name">{{ clientName || 'Client' }}</strong>
        <div v-if="clientDemoLine" class="cin-client-bar__demo muted">{{ clientDemoLine }}</div>
        <div class="cin-client-bar__meta muted">
          <span v-if="clinicianLabel"><span class="cin-meta-label">Clinician</span> {{ clinicianLabel }}</span>
          <span v-if="intakeDateLabel"><span class="cin-meta-label">Intake date</span> {{ intakeDateLabel }}</span>
          <span v-if="draft?.serviceCode || suggestedCode">
            <span class="cin-meta-label">Service code</span>
            <code class="mono">{{ draft?.serviceCode || suggestedCode }}</code>
          </span>
        </div>
      </div>
      <div class="cin-client-bar__status">
        <span class="cin-status-chip" :class="statusChipClass">{{ statusLabel }}</span>
      </div>
    </div>

    <div v-if="loading" class="muted cin-loading">Loading intake note…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <div v-if="!assignedProvider" class="cin-callout">
        Assign a clinician to generate an intake note (credential selects 90791 vs H0031).
      </div>

      <div v-else-if="!draft" class="cin-empty">
        <p class="muted">No intake note on file yet.</p>
        <button
          type="button"
          class="cdp-btn-primary"
          :disabled="busy"
          @click="generateDraft"
        >
          {{ busy && busyAction === 'generate' ? 'Generating…' : 'Generate draft' }}
        </button>
      </div>

      <div v-else class="cin-body">
        <!-- Main column -->
        <main class="cin-main">
          <!-- Diagnosis -->
          <section v-if="activeDiagnosis" class="cin-panel cin-dx">
            <div class="cin-panel__head">
              <h4>Diagnosis</h4>
              <span v-if="draft.status !== 'final' && !draft.diagnosisAction" class="cin-chip cin-chip--warn">Needs confirmation</span>
              <span v-else-if="draft.confirmedDiagnosis" class="cin-chip cin-chip--ok">Confirmed</span>
            </div>
            <p class="cin-dx-code mono">
              {{ activeDiagnosis.code || '—' }}
              <span v-if="activeDiagnosis.description"> — {{ activeDiagnosis.description }}</span>
            </p>
            <button
              v-if="activeDiagnosis.justification"
              type="button"
              class="cin-rationale-toggle cdp-text-link"
              @click="showRationale = !showRationale"
            >
              {{ showRationale ? 'Hide' : 'Show' }} diagnostic rationale
            </button>
            <p
              v-if="showRationale && activeDiagnosis.justification"
              class="cin-dx-rationale muted"
            >{{ activeDiagnosis.justification }}</p>

            <div v-if="draft.status !== 'final' && !isHistoricalView" class="cin-dx-actions">
              <button type="button" class="cdp-btn-soft" :disabled="busy" @click="confirmDx('remain')">
                No further information — remain as is
              </button>
              <button type="button" class="cdp-btn-primary" :disabled="busy" @click="confirmDx('confirmed')">
                Diagnosis confirmed
              </button>
              <button type="button" class="cdp-btn-soft" :disabled="busy" @click="showDxEdit = !showDxEdit">
                Change / update diagnosis
              </button>
            </div>
            <div v-if="showDxEdit && !isHistoricalView" class="cin-dx-edit">
              <input v-model="dxEdit.code" class="filters-input" placeholder="ICD-10 code" />
              <input v-model="dxEdit.description" class="filters-input" placeholder="Description" />
              <textarea
                v-model="dxEdit.justification"
                class="filters-input"
                rows="3"
                placeholder="Diagnostic justification"
              />
              <textarea v-model="dxEdit.comment" class="filters-input" rows="2" placeholder="Reason for change (audit)" />
              <button type="button" class="cdp-btn-primary" :disabled="busy" @click="confirmDx('updated')">
                Save updated diagnosis
              </button>
            </div>
          </section>

          <!-- Note sections -->
          <section v-if="draft.sections?.length" class="cin-panel cin-sections">
            <div class="cin-panel__head">
              <h4>Note sections</h4>
              <span class="muted tiny">{{ draft.sections.length }} section{{ draft.sections.length === 1 ? '' : 's' }}</span>
            </div>
            <div
              v-for="sec in draft.sections"
              :key="sec.key"
              :ref="(el) => setSectionRef(sec.key, el)"
              class="cin-section"
              :class="{ 'cin-section--open': expandedSections[sec.key] }"
            >
              <button
                type="button"
                class="cin-section__toggle"
                :aria-expanded="!!expandedSections[sec.key]"
                @click="toggleSection(sec.key)"
              >
                <span class="cin-section__chevron" aria-hidden="true">{{ expandedSections[sec.key] ? '▾' : '▸' }}</span>
                <span class="cin-section__label">{{ sec.label }}</span>
                <span v-if="sectionStatus(sec)" class="cin-chip cin-chip--sm">{{ sectionStatus(sec) }}</span>
              </button>
              <div v-if="!expandedSections[sec.key]" class="cin-section__preview muted">
                {{ sectionPreview(sec.body) }}
              </div>
              <div v-else class="cin-section__body-wrap">
                <div class="cin-section__head">
                  <span class="muted tiny">Full section</span>
                  <button type="button" class="cdp-text-link" @click.stop="copyText(sec.body, sec.label)">Copy</button>
                </div>
                <pre class="cin-section__body">{{ sec.body || '—' }}</pre>
              </div>
            </div>
          </section>

          <!-- Treatment plan preview (when present) -->
          <section v-if="treatmentPlan && (treatmentPlan.goals || []).length" class="cin-panel cin-tp">
            <div class="cin-panel__head">
              <h4>Draft treatment plan</h4>
              <span class="cin-chip cin-chip--sm">{{ (treatmentPlan.goals || []).length }} goal{{ (treatmentPlan.goals || []).length === 1 ? '' : 's' }}</span>
            </div>
            <div v-for="(goal, idx) in (treatmentPlan.goals || [])" :key="idx" class="cin-section cin-section--static">
              <div class="cin-section__head">
                <strong>Goal {{ idx + 1 }}</strong>
                <button type="button" class="cdp-text-link" @click="copyText(formatGoal(goal), `Goal ${idx + 1}`)">Copy</button>
              </div>
              <pre class="cin-section__body">{{ formatGoal(goal) }}</pre>
            </div>
          </section>
        </main>

        <!-- Right sidebar -->
        <aside class="cin-sidebar">
          <!-- Progress -->
          <div class="cin-progress">
            <svg class="cin-progress__ring" viewBox="0 0 36 36" aria-hidden="true">
              <path
                class="cin-progress__track"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                class="cin-progress__fill"
                :stroke-dasharray="`${progressPct}, 100`"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div class="cin-progress__label">
              <strong>{{ progressPct }}%</strong>
              <span class="muted tiny">Complete</span>
            </div>
          </div>

          <!-- Quick nav -->
          <nav v-if="draft.sections?.length" class="cin-nav" aria-label="Section navigation">
            <h5 class="cin-sidebar__heading">Sections</h5>
            <button
              v-for="sec in draft.sections"
              :key="'nav-' + sec.key"
              type="button"
              class="cin-nav__item"
              @click="scrollToSection(sec.key)"
            >
              {{ sec.label }}
            </button>
          </nav>

          <!-- Clinical summary -->
          <div v-if="summaryBullets.length" class="cin-summary">
            <h5 class="cin-sidebar__heading">Clinical summary</h5>
            <ul>
              <li v-for="(bullet, bi) in summaryBullets" :key="bi">{{ bullet }}</li>
            </ul>
          </div>

          <!-- Note details -->
          <div class="cin-details">
            <h5 class="cin-sidebar__heading">Note details</h5>
            <dl class="cin-details__list">
              <div><dt>Status</dt><dd>{{ statusLabel }}</dd></div>
              <div v-if="draft.createdAt"><dt>Created</dt><dd>{{ formatWhen(draft.createdAt) }}</dd></div>
              <div v-if="draft.updatedAt"><dt>Updated</dt><dd>{{ formatWhen(draft.updatedAt) }}</dd></div>
              <div v-if="draft.finalizedAt"><dt>Finalized</dt><dd>{{ formatWhen(draft.finalizedAt) }}</dd></div>
              <div v-if="draft.serviceCode"><dt>Service code</dt><dd><code class="mono">{{ draft.serviceCode }}</code></dd></div>
            </dl>
          </div>

          <!-- Sidebar actions -->
          <div class="cin-sidebar__actions">
            <button
              v-if="draft.sections?.length"
              type="button"
              class="cdp-btn-soft cin-sidebar__btn"
              @click="copyAll"
            >
              Copy All
            </button>

            <template v-if="draft.status !== 'final' && !isHistoricalView">
              <label class="cin-sidebar__context-label muted tiny">Optional session context (scrubbed before rewrite)</label>
              <textarea
                v-model="sessionContext"
                class="filters-input cin-sidebar__context"
                rows="3"
                placeholder="Additional clinical context from first session…"
              />
              <button
                type="button"
                class="cdp-btn-primary cin-sidebar__btn"
                :disabled="busy || !canFinalize"
                @click="finalizeAndEditPlan"
              >
                {{ busy && busyAction === 'finalize' ? 'Finalizing…' : 'Finalize & edit treatment plan' }}
              </button>
              <button
                type="button"
                class="cdp-btn-soft cin-sidebar__btn"
                :disabled="busy || !canFinalize"
                @click="finalize"
              >
                Finalize intake only
              </button>
              <p v-if="!canFinalize" class="hint cin-sidebar__hint">Confirm or update diagnosis before finalizing.</p>
            </template>

            <button
              v-if="treatmentPlan || draft.status === 'final'"
              type="button"
              class="cdp-btn-soft cin-sidebar__btn"
              @click="openNoteAidPlan"
            >
              Open treatment plan
            </button>
            <button
              v-if="treatmentPlan"
              type="button"
              class="cdp-btn-soft cin-sidebar__btn"
              @click="$emit('navigate', 'treatment-plans')"
            >
              View on chart
            </button>
          </div>
        </aside>
      </div>

      <!-- Previous intake notes -->
      <section v-if="history.length > 1" class="cin-history">
        <h4 class="cin-history__title">Previous Intake Notes</h4>
        <div class="cin-history__list">
          <div
            v-for="item in history"
            :key="item.id"
            class="cin-history__row"
            :class="{ 'cin-history__row--active': Number(draft?.id) === Number(item.id) }"
          >
            <div class="cin-history__date">{{ formatHistoryDate(item) }}</div>
            <span class="cin-status-chip cin-status-chip--sm" :class="historyStatusClass(item.status)">
              {{ historyStatusLabel(item.status) }}
            </span>
            <span v-if="item.serviceCode" class="mono tiny muted">{{ item.serviceCode }}</span>
            <button
              type="button"
              class="cdp-text-link"
              :disabled="Number(draft?.id) === Number(item.id)"
              @click="viewHistory(item.id)"
            >
              View
            </button>
          </div>
        </div>
      </section>
    </template>

    <NoteAidIntakeImportReview
      v-if="Number(clientId || 0)"
      :open="showImport"
      :client-id="Number(clientId)"
      @close="showImport = false"
      @finalized="onImportFinalized"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../../services/api';
import { useAgencyStore } from '../../../store/agency';
import { treatmentPlanUpdaterQuery, intakeDraftEditorQuery, noteAidPath } from '../../../utils/noteAidLaunch.js';
import NoteAidIntakeImportReview from '../../clinical/NoteAidIntakeImportReview.vue';
import ClientChartAvatar from './ClientChartAvatar.vue';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  assignedProvider: { type: Boolean, default: false },
  suggestedCode: { type: String, default: '' },
  phiBanner: { type: Boolean, default: false },
  client: { type: Object, default: null }
});
defineEmits(['navigate']);

const router = useRouter();
const agencyStore = useAgencyStore();

const loading = ref(false);
const busy = ref(false);
const busyAction = ref('');
const error = ref('');
const draft = ref(null);
const treatmentPlan = ref(null);
const history = ref([]);
const latestDraftId = ref(null);
const viewingHistoryId = ref(null);
const showDxEdit = ref(false);
const showImport = ref(false);
const showMoreMenu = ref(false);
const showRationale = ref(false);
const sessionContext = ref('');
const dxEdit = ref({ code: '', description: '', justification: '', comment: '' });
const copyFlash = ref('');
const expandedSections = reactive({});
const sectionRefs = ref({});

const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
  nonbinary: 'Non-binary',
  other: 'Other'
};

const statusLabel = computed(() => {
  const s = String(draft.value?.status || 'none');
  const map = {
    none: 'Not started',
    draft: 'Draft',
    diagnosis_pending: 'Awaiting diagnosis confirm',
    ready: 'Ready to finalize',
    final: 'Finalized'
  };
  return map[s] || s;
});

const statusChipClass = computed(() => {
  const s = String(draft.value?.status || '');
  if (s === 'final') return 'cin-status-chip--final';
  if (s === 'ready') return 'cin-status-chip--ready';
  if (s === 'diagnosis_pending') return 'cin-status-chip--pending';
  return 'cin-status-chip--draft';
});

const canFinalize = computed(() => {
  const s = draft.value?.status;
  return s === 'ready' || (s === 'draft' && draft.value?.diagnosisAction);
});

const activeDiagnosis = computed(() => (
  draft.value?.confirmedDiagnosis || draft.value?.suggestedDiagnosis || null
));

const isHistoricalView = computed(() => {
  if (!viewingHistoryId.value || !latestDraftId.value) return false;
  return Number(viewingHistoryId.value) !== Number(latestDraftId.value);
});

const progressPct = computed(() => {
  const s = String(draft.value?.status || 'none');
  if (s === 'final') return 100;
  const map = { none: 0, draft: 30, diagnosis_pending: 55, ready: 80 };
  return map[s] ?? 15;
});

const clientName = computed(() => String(props.client?.full_name || '').trim());
const clientInitials = computed(() => String(props.client?.initials || '').trim());
const clientPhotoPath = computed(() => (
  props.client?.chart_photo_path || props.client?.chartPhotoPath || null
));

const clientAge = computed(() => {
  if (props.client?.age != null && props.client.age !== '') {
    const n = Number(props.client.age);
    return Number.isFinite(n) && n >= 0 && n < 130 ? String(n) : '';
  }
  const raw = props.client?.date_of_birth;
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? String(age) : '';
});

const clientGenderLabel = computed(() => {
  const g = String(props.client?.gender || '').trim().toLowerCase();
  if (!g) return '';
  return GENDER_LABELS[g] || g.charAt(0).toUpperCase() + g.slice(1);
});

const clientDobLabel = computed(() => {
  const raw = props.client?.date_of_birth;
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(raw);
  }
});

const clientDemoLine = computed(() => {
  const parts = [];
  if (clientAge.value) parts.push(`${clientAge.value} yrs`);
  if (clientGenderLabel.value) parts.push(clientGenderLabel.value);
  if (clientDobLabel.value) parts.push(`DOB ${clientDobLabel.value}`);
  return parts.join(' · ');
});

const clinicianLabel = computed(() => {
  const fromDraft = String(draft.value?.providerName || '').trim();
  if (fromDraft) return fromDraft;
  return '';
});

const intakeDateLabel = computed(() => {
  const v = draft.value?.finalizedAt || draft.value?.createdAt;
  if (!v) return '';
  try {
    return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(v);
  }
});

const summaryBullets = computed(() => {
  const secs = draft.value?.sections || [];
  return secs.slice(0, 4).map((sec) => {
    const preview = sectionPreview(sec.body, 100);
    return preview ? `${sec.label}: ${preview}` : sec.label;
  }).filter(Boolean);
});

function sectionPreview(body, max = 140) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function sectionStatus(sec) {
  const body = String(sec?.body || '').trim();
  if (!body) return 'Empty';
  if (body.length > 200) return 'Complete';
  return 'Draft';
}

function setSectionRef(key, el) {
  if (el) sectionRefs.value[key] = el;
  else delete sectionRefs.value[key];
}

function toggleSection(key) {
  expandedSections[key] = !expandedSections[key];
}

function scrollToSection(key) {
  expandedSections[key] = true;
  const el = sectionRefs.value[key];
  if (el?.scrollIntoView) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function syncDxEditFromDraft() {
  const dx = draft.value?.confirmedDiagnosis || draft.value?.suggestedDiagnosis;
  if (!dx) return;
  dxEdit.value = {
    code: dx.code || '',
    description: dx.description || '',
    justification: dx.justification || '',
    comment: ''
  };
}

function initExpandedSections() {
  const secs = draft.value?.sections || [];
  for (const key of Object.keys(expandedSections)) {
    if (!secs.some((s) => s.key === key)) delete expandedSections[key];
  }
  for (const sec of secs) {
    if (expandedSections[sec.key] === undefined) expandedSections[sec.key] = false;
  }
}

async function load(opts = {}) {
  const id = Number(props.clientId || 0);
  if (!id) return;
  loading.value = true;
  error.value = '';
  const draftId = opts.draftId ?? (opts.useViewingId ? viewingHistoryId.value : undefined);
  try {
    const params = draftId ? { draftId } : {};
    const r = await api.get(`/clients/${id}/intake-note`, { params, skipGlobalLoading: true });
    draft.value = r.data?.draft || null;
    treatmentPlan.value = r.data?.treatmentPlan || null;
    history.value = r.data?.history || [];
    syncDxEditFromDraft();
    initExpandedSections();

    if (draftId) {
      viewingHistoryId.value = Number(draftId);
    } else {
      viewingHistoryId.value = null;
      latestDraftId.value = draft.value?.id || history.value[0]?.id || null;
    }
    if (!latestDraftId.value && history.value.length) {
      latestDraftId.value = history.value[0]?.id || null;
    }
  } catch (e) {
    if (e.response?.status === 404) {
      draft.value = null;
      history.value = e.response?.data?.history || history.value;
    } else {
      error.value = e.response?.data?.error?.message || 'Failed to load intake note';
    }
  } finally {
    loading.value = false;
  }
}

async function viewHistory(draftId) {
  showMoreMenu.value = false;
  await load({ draftId: Number(draftId) });
}

async function backToCurrent() {
  viewingHistoryId.value = null;
  await load();
}

async function generateDraft() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  busy.value = true;
  busyAction.value = 'generate';
  error.value = '';
  try {
    const r = await api.post(`/clients/${id}/intake-note/generate`, {});
    draft.value = r.data?.draft || null;
    treatmentPlan.value = r.data?.treatmentPlan || null;
    latestDraftId.value = draft.value?.id || latestDraftId.value;
    viewingHistoryId.value = null;
    syncDxEditFromDraft();
    initExpandedSections();
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to generate intake note';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

async function confirmDx(action) {
  const id = Number(props.clientId || 0);
  const draftId = Number(draft.value?.id || 0);
  if (!id || !draftId) return;
  busy.value = true;
  busyAction.value = 'dx';
  error.value = '';
  try {
    const body = { action };
    if (action === 'updated') {
      body.confirmedCode = dxEdit.value.code;
      body.confirmedDescription = dxEdit.value.description;
      body.confirmedJustification = dxEdit.value.justification;
      body.comment = dxEdit.value.comment;
    }
    const r = await api.post(`/clients/${id}/intake-note/${draftId}/diagnosis`, body);
    draft.value = r.data?.draft || draft.value;
    showDxEdit.value = false;
    syncDxEditFromDraft();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to record diagnosis decision';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

async function finalize() {
  const id = Number(props.clientId || 0);
  const draftId = Number(draft.value?.id || 0);
  if (!id || !draftId) return;
  busy.value = true;
  busyAction.value = 'finalize';
  error.value = '';
  try {
    const r = await api.post(`/clients/${id}/intake-note/${draftId}/finalize`, {
      sessionContext: sessionContext.value || ''
    });
    draft.value = r.data?.draft || draft.value;
    treatmentPlan.value = r.data?.treatmentPlan || null;
    if (!isHistoricalView.value) {
      latestDraftId.value = draft.value?.id || latestDraftId.value;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to finalize intake note';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

async function finalizeAndEditPlan() {
  await finalize();
  if (draft.value?.status === 'final') {
    openNoteAidPlan();
  }
}

function openNoteAidIntake() {
  showMoreMenu.value = false;
  const slug = agencyStore.currentAgency?.slug || agencyStore.currentAgency?.organization_slug;
  const query = intakeDraftEditorQuery(props.clientId, {
    intakeDraftId: draft.value?.id,
    serviceCode: draft.value?.serviceCode || props.suggestedCode || '90791'
  });
  router.push({ path: noteAidPath({ organizationSlug: slug }), query });
}

function openNoteAidPlan() {
  showMoreMenu.value = false;
  const slug = agencyStore.currentAgency?.slug || agencyStore.currentAgency?.organization_slug;
  const query = treatmentPlanUpdaterQuery(props.clientId, {
    planId: treatmentPlan.value?.id || draft.value?.treatmentPlanId
  });
  router.push({ path: noteAidPath({ organizationSlug: slug }), query });
}

function formatGoal(goal) {
  if (!goal) return '';
  if (typeof goal === 'string') return goal;
  const parts = [goal.goal || goal.text || goal.title || goal.goal_text, goal.objectives, goal.interventions].filter(Boolean);
  return parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');
}

let copyFlashTimer = null;
async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    copyFlash.value = `${label || 'Copied'} copied`;
    if (copyFlashTimer) clearTimeout(copyFlashTimer);
    copyFlashTimer = setTimeout(() => { copyFlash.value = ''; }, 2200);
  } catch {
    /* ignore */
  }
}

function copyAll() {
  showMoreMenu.value = false;
  const parts = (draft.value?.sections || []).map((s) => `## ${s.label}\n${s.body || ''}`);
  copyText(parts.join('\n\n'), 'All sections');
}

async function onImportFinalized() {
  showImport.value = false;
  viewingHistoryId.value = null;
  await load();
}

function runMoreAction(action) {
  showMoreMenu.value = false;
  if (action === 'generate') generateDraft();
  else if (action === 'import') showImport.value = true;
  else if (action === 'copy') copyAll();
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function formatHistoryDate(item) {
  const v = item.finalizedAt || item.updatedAt || item.createdAt;
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(v);
  }
}

function historyStatusLabel(status) {
  const s = String(status || '');
  const map = {
    draft: 'Draft',
    diagnosis_pending: 'Dx pending',
    ready: 'Ready',
    final: 'Final'
  };
  return map[s] || s.replace(/_/g, ' ');
}

function historyStatusClass(status) {
  const s = String(status || '');
  if (s === 'final') return 'cin-status-chip--final';
  if (s === 'ready') return 'cin-status-chip--ready';
  if (s === 'diagnosis_pending') return 'cin-status-chip--pending';
  return 'cin-status-chip--draft';
}

function onDocumentClick(e) {
  if (!showMoreMenu.value) return;
  const wrap = e.target?.closest?.('.cin-more-wrap');
  if (!wrap) showMoreMenu.value = false;
}

onMounted(() => {
  load();
  document.addEventListener('click', onDocumentClick);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  if (copyFlashTimer) clearTimeout(copyFlashTimer);
});
watch(() => props.clientId, () => {
  viewingHistoryId.value = null;
  latestDraftId.value = null;
  load();
});
</script>

<style scoped>
.cin {
  --cin-primary: var(--primary, #166534);
  color: var(--text-primary, #0f172a);
}

.cin-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.cin-header__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.cin-title {
  margin: 0;
  font-size: 18px;
  font-weight: 750;
}
.cin-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--cin-primary) 14%, transparent);
  color: var(--cin-primary);
  border: 1px solid color-mix(in srgb, var(--cin-primary) 28%, transparent);
}
.cin-copy-flash {
  font-size: 12px;
  font-weight: 650;
  color: var(--cin-primary);
}
.cin-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.cin-more-wrap { position: relative; }
.cin-more-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  min-width: 200px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg, #fff);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cin-more-menu button {
  text-align: left;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-primary, #0f172a);
}
.cin-more-menu button:hover:not(:disabled) {
  background: var(--bg-alt, #f8fafc);
}
.cin-more-menu button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cin-phi { margin-bottom: 12px; }
.cin-history-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--cin-primary) 8%, var(--bg-alt, #f8fafc));
  border: 1px solid color-mix(in srgb, var(--cin-primary) 20%, var(--border, #e2e8f0));
  font-size: 13px;
  font-weight: 600;
}

.cin-client-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
}
.cin-client-bar__info { flex: 1; min-width: 0; }
.cin-client-bar__name {
  display: block;
  font-size: 15px;
  margin-bottom: 2px;
}
.cin-client-bar__demo { font-size: 13px; }
.cin-client-bar__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
}
.cin-meta-label {
  font-weight: 650;
  color: var(--text-secondary, #64748b);
  margin-right: 4px;
}
.cin-client-bar__status { flex-shrink: 0; }

.cin-status-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg, #fff);
}
.cin-status-chip--sm { font-size: 11px; padding: 2px 8px; }
.cin-status-chip--final {
  color: var(--cin-primary);
  border-color: color-mix(in srgb, var(--cin-primary) 35%, var(--border, #e2e8f0));
  background: color-mix(in srgb, var(--cin-primary) 10%, #fff);
}
.cin-status-chip--ready {
  color: #1d4ed8;
  border-color: #bfdbfe;
  background: #eff6ff;
}
.cin-status-chip--pending {
  color: #b45309;
  border-color: #fde68a;
  background: #fffbeb;
}
.cin-status-chip--draft {
  color: #475569;
  background: var(--bg-alt, #f8fafc);
}

.cin-callout,
.cin-empty {
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  margin-bottom: 16px;
}
.cin-loading { padding: 20px 0; }

.cin-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  align-items: start;
}
@media (max-width: 900px) {
  .cin-body { grid-template-columns: 1fr; }
}

.cin-panel {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: var(--bg, #fff);
  padding: 14px 16px;
  margin-bottom: 14px;
}
.cin-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.cin-panel__head h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 750;
  flex: 1;
}

.cin-chip {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
}
.cin-chip--sm { font-size: 10px; }
.cin-chip--ok {
  color: var(--cin-primary);
  border-color: color-mix(in srgb, var(--cin-primary) 30%, var(--border, #e2e8f0));
  background: color-mix(in srgb, var(--cin-primary) 8%, #fff);
}
.cin-chip--warn {
  color: #b45309;
  border-color: #fde68a;
  background: #fffbeb;
}

.cin-dx-code { margin: 0 0 8px; font-size: 14px; }
.cin-dx-rationale {
  margin: 8px 0 0;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.5;
}
.cin-rationale-toggle {
  padding: 0;
  font-size: 13px;
}
.cin-dx-actions,
.cin-dx-edit {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.cin-dx-edit { flex-direction: column; }

.cin-section {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  margin-bottom: 8px;
  overflow: hidden;
  background: var(--bg-alt, #f8fafc);
}
.cin-section--static {
  padding: 10px 12px;
  background: var(--bg, #fff);
}
.cin-section--open {
  background: var(--bg, #fff);
  border-color: color-mix(in srgb, var(--cin-primary) 25%, var(--border, #e2e8f0));
}
.cin-section__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
.cin-section__chevron {
  color: var(--text-secondary, #64748b);
  font-size: 12px;
  width: 12px;
  flex-shrink: 0;
}
.cin-section__label {
  font-weight: 700;
  font-size: 13px;
  flex: 1;
}
.cin-section__preview {
  padding: 0 12px 10px 32px;
  font-size: 12px;
  line-height: 1.45;
}
.cin-section__body-wrap { padding: 0 12px 12px; }
.cin-section__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.cin-section__body {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary, #0f172a);
}

.cin-sidebar {
  position: sticky;
  top: 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: var(--bg, #fff);
  padding: 14px;
}
.cin-sidebar__heading {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary, #64748b);
}
.cin-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.cin-progress__ring {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}
.cin-progress__track {
  fill: none;
  stroke: var(--border, #e2e8f0);
  stroke-width: 3;
}
.cin-progress__fill {
  fill: none;
  stroke: var(--cin-primary);
  stroke-width: 3;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  transition: stroke-dasharray 0.35s ease;
}
.cin-progress__label {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.cin-progress__label strong {
  font-size: 20px;
  color: var(--cin-primary);
}

.cin-nav {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.cin-nav__item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 5px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--cin-primary);
  cursor: pointer;
}
.cin-nav__item:hover { text-decoration: underline; }

.cin-summary {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.cin-summary ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary, #475569);
}
.cin-summary li { margin-bottom: 4px; }

.cin-details {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.cin-details__list {
  margin: 0;
  font-size: 12px;
}
.cin-details__list div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
}
.cin-details__list dt {
  margin: 0;
  color: var(--text-secondary, #64748b);
  font-weight: 600;
}
.cin-details__list dd {
  margin: 0;
  text-align: right;
  font-weight: 650;
}

.cin-sidebar__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cin-sidebar__btn { width: 100%; justify-content: center; }
.cin-sidebar__context-label { display: block; margin-top: 4px; }
.cin-sidebar__context { font-size: 12px; }
.cin-sidebar__hint { margin: 0; font-size: 12px; }

.cin-history {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.cin-history__title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 750;
}
.cin-history__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cin-history__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
}
.cin-history__row--active {
  border-color: color-mix(in srgb, var(--cin-primary) 35%, var(--border, #e2e8f0));
  background: color-mix(in srgb, var(--cin-primary) 6%, var(--bg-alt, #f8fafc));
}
.cin-history__date {
  font-weight: 650;
  font-size: 13px;
  min-width: 100px;
}

.cdp-btn-primary,
.cdp-btn-soft {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid var(--border, #e2e8f0);
  font-size: 13px;
}
.cdp-btn-primary {
  background: var(--cin-primary);
  color: #fff;
  border-color: transparent;
}
.cdp-btn-primary:disabled,
.cdp-btn-soft:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cdp-btn-soft {
  background: var(--bg-alt, #f8fafc);
  color: var(--text-primary, #0f172a);
}
.cdp-text-link {
  border: 0;
  background: transparent;
  color: var(--cin-primary);
  font-weight: 650;
  cursor: pointer;
  font-size: 13px;
}
.cdp-text-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.filters-input {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg, #fff);
  color: var(--text-primary, #0f172a);
  font: inherit;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.muted { color: var(--text-secondary, #64748b); }
.tiny { font-size: 12px; }
.hint { font-size: 12px; color: var(--text-secondary, #64748b); margin: 0; }
.error { color: #b91c1c; font-weight: 650; margin-bottom: 12px; }
</style>
