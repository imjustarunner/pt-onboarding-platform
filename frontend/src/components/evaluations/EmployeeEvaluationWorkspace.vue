<template>
  <div class="ee-workspace" :class="{ 'ee-workspace--compact': compact }">
    <div v-if="loading" class="ee-muted">Loading evaluation…</div>
    <div v-else-if="error" class="ee-error">{{ error }}</div>
    <template v-else-if="cycle">
      <header class="ee-header">
        <div>
          <h3 class="ee-title">
            {{ periodLabel }}
            <span v-if="cycle.job_title_snapshot || cycle.jobTitleSnapshot" class="ee-job">
              · {{ cycle.job_title_snapshot || cycle.jobTitleSnapshot }}
            </span>
          </h3>
          <p class="ee-meta">
            <span class="ee-status" :data-status="cycleStatus">{{ statusLabel(cycleStatus) }}</span>
            <span v-if="saveState" class="ee-save">{{ saveState }}</span>
          </p>
        </div>
        <div v-if="mode === 'employee' && canEdit" class="ee-actions">
          <button
            type="button"
            class="ee-btn ee-btn--primary"
            :disabled="submitting || saving"
            @click="submit"
          >
            {{ submitting ? 'Submitting…' : 'Submit evaluation' }}
          </button>
        </div>
      </header>

      <div
        v-for="(resp, idx) in drafts"
        :key="resp.templateSlug || idx"
        class="ee-rubric"
      >
        <h4 class="ee-rubric-title">
          {{ resp.templateName }}
          <span v-if="resp.isSupervisorRubric" class="ee-pill">Supervisor</span>
        </h4>

        <section
          v-for="section in rubricSections(resp)"
          :key="section.key"
          class="ee-section"
        >
          <h5 class="ee-section-title">{{ section.title }}</h5>

          <div
            v-for="criterion in section.criteria || []"
            :key="criterion.key"
            class="ee-criterion"
          >
            <div class="ee-criterion-label">{{ criterion.label }}</div>
            <p v-if="criterion.description" class="ee-criterion-desc">{{ criterion.description }}</p>
            <div class="ee-ratings" role="radiogroup" :aria-label="criterion.label">
              <label
                v-for="scale in ratingScale(resp)"
                :key="scale.value"
                class="ee-rating"
                :class="{
                  'ee-rating--selected': Number(resp.ratings[criterion.key]) === Number(scale.value),
                  'ee-rating--readonly': !canEdit
                }"
              >
                <input
                  type="radio"
                  :name="`${resp.templateSlug}-${criterion.key}`"
                  :value="scale.value"
                  :disabled="!canEdit"
                  :checked="Number(resp.ratings[criterion.key]) === Number(scale.value)"
                  @change="setRating(resp, criterion.key, scale.value)"
                />
                <span class="ee-rating-value">{{ scale.value }}</span>
                <span class="ee-rating-label">{{ scale.label }}</span>
                <span v-if="anchorFor(criterion, scale.value)" class="ee-rating-anchor">
                  {{ anchorFor(criterion, scale.value) }}
                </span>
              </label>
            </div>
          </div>

          <div v-if="sectionShowsActionItem(section)" class="ee-action-item">
            <label class="ee-field-label">
              {{ section.actionItemPrompt || 'Action items / development notes for this section' }}
            </label>
            <textarea
              class="ee-textarea"
              rows="2"
              :disabled="!canEdit"
              :value="resp.sectionActionItems[section.key] || ''"
              @input="setSectionAction(resp, section.key, $event.target.value)"
            />
          </div>
        </section>

        <section v-if="reflectionPrompts(resp).length" class="ee-reflection">
          <h5 class="ee-section-title">Reflection</h5>
          <div
            v-for="prompt in reflectionPrompts(resp)"
            :key="prompt.key"
            class="ee-prompt"
          >
            <label class="ee-field-label">{{ prompt.prompt || prompt.label }}</label>
            <textarea
              class="ee-textarea"
              rows="3"
              :disabled="!canEdit"
              :value="resp.reflection[prompt.key] || ''"
              @input="setReflection(resp, prompt.key, $event.target.value)"
            />
          </div>
        </section>
      </div>

      <section v-if="mode === 'admin' || adminCommentsDisplay" class="ee-admin">
        <h4 class="ee-rubric-title">Admin review</h4>
        <label v-if="mode === 'admin'" class="ee-field-label">Comments</label>
        <textarea
          v-if="mode === 'admin'"
          v-model="adminComments"
          class="ee-textarea"
          rows="4"
          placeholder="Notes for the employee and file…"
        />
        <p v-else-if="adminCommentsDisplay" class="ee-admin-readonly">{{ adminCommentsDisplay }}</p>
        <div v-if="mode === 'admin'" class="ee-actions ee-actions--admin">
          <button
            type="button"
            class="ee-btn ee-btn--primary"
            :disabled="adminBusy"
            @click="markReviewed"
          >
            {{ adminBusy === 'review' ? 'Saving…' : 'Mark reviewed' }}
          </button>
          <button
            type="button"
            class="ee-btn ee-btn--secondary"
            :disabled="adminBusy || !['submitted', 'reviewed'].includes(cycleStatus)"
            @click="reopen"
          >
            {{ adminBusy === 'reopen' ? 'Reopening…' : 'Reopen' }}
          </button>
          <button
            type="button"
            class="ee-btn ee-btn--secondary"
            :disabled="adminBusy || cycleStatus === 'closed'"
            @click="closeCycle"
          >
            {{ adminBusy === 'close' ? 'Closing…' : 'Close' }}
          </button>
        </div>
      </section>
    </template>
    <div v-else class="ee-muted">No evaluation loaded.</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  cycleId: { type: [Number, String], default: null },
  bundle: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null },
  mode: {
    type: String,
    default: 'employee',
    validator: (v) => ['employee', 'admin', 'readonly'].includes(v)
  },
  compact: { type: Boolean, default: false }
});

const emit = defineEmits(['updated', 'submitted']);

const loading = ref(false);
const error = ref('');
const cycle = ref(null);
const drafts = ref([]);
const adminComments = ref('');
const saving = ref(false);
const submitting = ref(false);
const adminBusy = ref('');
const saveState = ref('');
let saveTimer = null;
let suppressAutosave = false;

const cycleStatus = computed(() => String(cycle.value?.status || '').toLowerCase());

const periodLabel = computed(() => {
  const y = cycle.value?.period_year ?? cycle.value?.periodYear;
  const h = cycle.value?.period_half ?? cycle.value?.periodHalf;
  if (!y || !h) return 'Employee evaluation';
  return `${h} ${y} evaluation`;
});

const canEdit = computed(() => {
  if (props.mode !== 'employee') return false;
  return ['scheduled', 'in_progress'].includes(cycleStatus.value);
});

const adminCommentsDisplay = computed(() => {
  const raw = cycle.value?.admin_comments ?? cycle.value?.adminComments ?? '';
  return String(raw || '').trim();
});

function statusLabel(status) {
  const map = {
    scheduled: 'Scheduled',
    in_progress: 'In progress',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
    closed: 'Closed',
    cancelled: 'Cancelled',
    not_scheduled: 'Not scheduled'
  };
  return map[status] || status || '—';
}

function parseRubric(resp) {
  const raw = resp?.rubricSnapshot || resp?.rubric_snapshot_json || resp?.rubric || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

function ratingScale(resp) {
  const rubric = parseRubric(resp);
  const scale = Array.isArray(rubric.ratingScale) ? rubric.ratingScale : [];
  if (scale.length) return scale;
  return [
    { value: 1, label: 'Needs Improvement' },
    { value: 2, label: 'Developing' },
    { value: 3, label: 'Proficient' },
    { value: 4, label: 'Exemplary' }
  ];
}

function rubricSections(resp) {
  const rubric = parseRubric(resp);
  return Array.isArray(rubric.sections) ? rubric.sections : [];
}

function reflectionPrompts(resp) {
  const rubric = parseRubric(resp);
  return Array.isArray(rubric.reflectionPrompts) ? rubric.reflectionPrompts : [];
}

function sectionShowsActionItem(section) {
  if (!section) return false;
  if (section.actionItemPrompt) return true;
  if (section.hasActionItems === false) return false;
  return true;
}

function anchorFor(criterion, value) {
  const v = Number(value);
  if (criterion?.anchors && typeof criterion.anchors === 'object') {
    return criterion.anchors[v] || criterion.anchors[String(v)] || '';
  }
  if (Array.isArray(criterion?.anchors)) {
    return criterion.anchors[v - 1] || '';
  }
  return '';
}

function normalizeResponse(row) {
  const ratings = row?.ratings_json || row?.ratings || {};
  const sectionActionItems = row?.section_action_items_json || row?.sectionActionItems || {};
  const reflection = row?.reflection_json || row?.reflection || {};
  return {
    id: Number(row?.id || 0) || null,
    templateSlug: row?.template_slug || row?.templateSlug || '',
    templateName: row?.template_name || row?.templateName || 'Rubric',
    isSupervisorRubric: !!(row?.is_supervisor_rubric ?? row?.isSupervisorRubric),
    rubricSnapshot: parseRubric(row),
    ratings: { ...(typeof ratings === 'object' && ratings ? ratings : {}) },
    sectionActionItems: {
      ...(typeof sectionActionItems === 'object' && sectionActionItems ? sectionActionItems : {})
    },
    reflection: { ...(typeof reflection === 'object' && reflection ? reflection : {}) }
  };
}

function applyBundle(bundle) {
  suppressAutosave = true;
  cycle.value = bundle?.cycle || null;
  drafts.value = (bundle?.responses || []).map(normalizeResponse);
  adminComments.value = String(
    bundle?.cycle?.admin_comments ?? bundle?.cycle?.adminComments ?? ''
  );
  error.value = '';
  queueMicrotask(() => {
    suppressAutosave = false;
  });
}

async function loadCycle() {
  const id = Number(props.cycleId || 0);
  if (!id) {
    error.value = 'Missing evaluation cycle.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/evaluations/cycles/${id}`);
    applyBundle(data);
    emit('updated', data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load evaluation';
    cycle.value = null;
    drafts.value = [];
  } finally {
    loading.value = false;
  }
}

function buildPayload() {
  return {
    responses: drafts.value.map((d) => ({
      id: d.id,
      templateSlug: d.templateSlug,
      ratings: d.ratings,
      sectionActionItems: d.sectionActionItems,
      reflection: d.reflection
    }))
  };
}

function scheduleAutosave() {
  if (suppressAutosave || !canEdit.value) return;
  const id = Number(cycle.value?.id || props.cycleId || 0);
  if (!id) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistDraft();
  }, 800);
}

async function persistDraft() {
  const id = Number(cycle.value?.id || props.cycleId || 0);
  if (!id || !canEdit.value) return;
  saving.value = true;
  saveState.value = 'Saving…';
  try {
    const { data } = await api.put(`/evaluations/cycles/${id}/draft`, buildPayload());
    if (data?.cycle) cycle.value = data.cycle;
    else if (data?.status) cycle.value = { ...cycle.value, status: data.status };
    saveState.value = 'Draft saved';
    emit('updated', data);
    setTimeout(() => {
      if (saveState.value === 'Draft saved') saveState.value = '';
    }, 1800);
  } catch (e) {
    saveState.value = '';
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save draft';
  } finally {
    saving.value = false;
  }
}

function setRating(resp, key, value) {
  resp.ratings[key] = Number(value);
  scheduleAutosave();
}

function setSectionAction(resp, key, value) {
  resp.sectionActionItems[key] = value;
  scheduleAutosave();
}

function setReflection(resp, key, value) {
  resp.reflection[key] = value;
  scheduleAutosave();
}

async function submit() {
  const id = Number(cycle.value?.id || props.cycleId || 0);
  if (!id) return;
  submitting.value = true;
  error.value = '';
  try {
    const { data } = await api.post(`/evaluations/cycles/${id}/submit`, buildPayload());
    applyBundle(data);
    emit('submitted', data);
    emit('updated', data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to submit';
  } finally {
    submitting.value = false;
  }
}

async function markReviewed() {
  const id = Number(cycle.value?.id || props.cycleId || 0);
  if (!id) return;
  adminBusy.value = 'review';
  error.value = '';
  try {
    const { data } = await api.post(`/evaluations/cycles/${id}/admin-comment`, {
      adminComments: adminComments.value,
      markReviewed: true
    });
    applyBundle(data);
    emit('updated', data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save review';
  } finally {
    adminBusy.value = '';
  }
}

async function reopen() {
  const id = Number(cycle.value?.id || props.cycleId || 0);
  if (!id) return;
  adminBusy.value = 'reopen';
  error.value = '';
  try {
    const { data } = await api.post(`/evaluations/cycles/${id}/reopen`);
    applyBundle(data);
    emit('updated', data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to reopen';
  } finally {
    adminBusy.value = '';
  }
}

async function closeCycle() {
  const id = Number(cycle.value?.id || props.cycleId || 0);
  if (!id) return;
  adminBusy.value = 'close';
  error.value = '';
  try {
    const { data } = await api.post(`/evaluations/cycles/${id}/close`);
    applyBundle(data);
    emit('updated', data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to close';
  } finally {
    adminBusy.value = '';
  }
}

watch(
  () => props.bundle,
  (b) => {
    if (b) applyBundle(b);
  },
  { immediate: true, deep: true }
);

watch(
  () => [props.cycleId, props.bundle],
  ([id, b]) => {
    if (b) return;
    if (Number(id || 0) > 0) void loadCycle();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
});

defineExpose({ reload: loadCycle, persistDraft });
</script>

<style scoped>
.ee-workspace {
  --ee-green: #166534;
  --ee-border: #e5e7eb;
  --ee-muted: #6b7280;
  color: #111827;
  font-size: 14px;
}

.ee-workspace--compact .ee-rating-anchor {
  display: none;
}

.ee-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.ee-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #14532d;
}

.ee-job {
  font-weight: 500;
  color: var(--ee-muted);
}

.ee-meta {
  margin: 6px 0 0;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.ee-status {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #f3f4f6;
  color: #374151;
}

.ee-status[data-status='submitted'],
.ee-status[data-status='reviewed'] {
  background: #dcfce7;
  color: #166534;
}

.ee-status[data-status='closed'] {
  background: #e5e7eb;
  color: #4b5563;
}

.ee-status[data-status='in_progress'],
.ee-status[data-status='scheduled'] {
  background: #ecfdf5;
  color: #047857;
}

.ee-save {
  font-size: 12px;
  color: var(--ee-muted);
}

.ee-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ee-actions--admin {
  margin-top: 10px;
}

.ee-btn {
  border: 1px solid var(--ee-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #fff;
  color: #111827;
}

.ee-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ee-btn--primary {
  background: var(--ee-green);
  border-color: var(--ee-green);
  color: #fff;
}

.ee-btn--secondary {
  background: #f9fafb;
}

.ee-rubric,
.ee-admin {
  border: 1px solid var(--ee-border);
  border-radius: 10px;
  background: #fff;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.ee-rubric-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ee-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #166534;
}

.ee-section {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f3f4f6;
}

.ee-section:last-of-type {
  border-bottom: none;
}

.ee-section-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: #14532d;
  text-transform: none;
}

.ee-criterion {
  margin-bottom: 14px;
}

.ee-criterion-label {
  font-weight: 600;
  margin-bottom: 4px;
}

.ee-criterion-desc {
  margin: 0 0 8px;
  color: var(--ee-muted);
  font-size: 13px;
}

.ee-ratings {
  display: grid;
  gap: 6px;
}

@media (min-width: 720px) {
  .ee-ratings {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.ee-rating {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--ee-border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  background: #fafafa;
  min-height: 100%;
}

.ee-rating input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.ee-rating--selected {
  border-color: var(--ee-green);
  background: #ecfdf5;
  box-shadow: inset 0 0 0 1px var(--ee-green);
}

.ee-rating--readonly {
  cursor: default;
}

.ee-rating-value {
  font-weight: 800;
  color: var(--ee-green);
  font-size: 14px;
}

.ee-rating-label {
  font-size: 12px;
  font-weight: 600;
}

.ee-rating-anchor {
  font-size: 11px;
  color: var(--ee-muted);
  line-height: 1.35;
}

.ee-field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #374151;
}

.ee-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ee-border);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
  background: #fff;
}

.ee-textarea:disabled {
  background: #f9fafb;
  color: #374151;
}

.ee-action-item,
.ee-prompt {
  margin-top: 10px;
}

.ee-reflection {
  margin-top: 8px;
}

.ee-admin-readonly {
  margin: 0;
  white-space: pre-wrap;
  color: #374151;
}

.ee-muted {
  color: var(--ee-muted);
  padding: 8px 0;
}

.ee-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
</style>
