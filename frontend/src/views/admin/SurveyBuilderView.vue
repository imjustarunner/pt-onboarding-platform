<template>
  <div class="container survey-builder">
    <div class="page-header">
      <div>
        <h1>Surveys</h1>
        <p class="subtitle">Create surveys, choose delivery targets, and publish to staff or kiosk events.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" type="button" @click="startNewSurvey">New Survey</button>
      </div>
    </div>

    <div v-if="loading" class="muted">Loading surveys...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="layout">
      <aside class="survey-list">
        <div
          v-for="s in surveys"
          :key="s.id"
          class="survey-list-item"
          :class="{ active: Number(selectedSurveyId) === Number(s.id) }"
          @click="selectSurvey(s.id)"
        >
          <div class="survey-list-item-top">
            <strong>{{ s.title || `Survey ${s.id}` }}</strong>
            <button
              class="btn btn-xs btn-danger"
              type="button"
              title="Delete survey"
              @click.stop="deleteSurveyById(s.id)"
            >
              Delete
            </button>
          </div>
          <div class="muted small survey-meta">
            {{ s.is_active ? 'Active' : 'Inactive' }} · {{ (s.questions_json || []).length }} questions
          </div>
        </div>
        <div v-if="!surveys.length" class="muted small">No surveys yet.</div>
      </aside>

      <section class="editor">
        <div class="grid two">
          <div>
            <label class="lbl">Title</label>
            <input v-model.trim="draft.title" class="input" type="text" />
          </div>
          <div>
            <label class="lbl">Default push role</label>
            <select v-model="draft.pushType" class="input">
              <option value="">Manual</option>
              <option v-for="opt in pushTypeOptions" :key="`default-push-type-${opt.value}`" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>

        <label class="lbl">Description</label>
        <textarea v-model.trim="draft.description" class="input" rows="2" />

        <div class="toggle-row">
          <label><input v-model="draft.isActive" type="checkbox" /> Active</label>
          <label><input v-model="draft.isAnonymous" type="checkbox" /> Anonymous responses</label>
          <label><input v-model="draft.isScored" type="checkbox" /> Scored survey</label>
        </div>

        <div class="section-head">
          <h3>Questions</h3>
          <button class="btn btn-secondary btn-sm" type="button" @click="addQuestion">+ Add question</button>
        </div>

        <div v-if="!draft.questions.length" class="muted small">No questions yet.</div>
        <div v-for="(q, idx) in draft.questions" :key="q.id" class="question-card">
          <div class="question-head">
            <strong>#{{ idx + 1 }}</strong>
            <div class="row-actions">
              <button class="btn btn-xs btn-secondary" type="button" @click="moveQuestion(idx, -1)" :disabled="idx === 0">↑</button>
              <button class="btn btn-xs btn-secondary" type="button" @click="moveQuestion(idx, 1)" :disabled="idx === draft.questions.length - 1">↓</button>
              <button class="btn btn-xs btn-danger" type="button" @click="removeQuestion(idx)">Delete</button>
            </div>
          </div>

          <div class="grid two">
            <div>
              <label class="lbl">Prompt</label>
              <input v-model.trim="q.label" class="input" type="text" />
            </div>
            <div>
              <label class="lbl">Type</label>
              <select v-model="q.type" class="input">
                <option value="text">Short text</option>
                <option value="textarea">Open-ended text</option>
                <option value="written">Written response</option>
                <option value="radio">Single choice</option>
                <option value="multiple_choice">Multiple choice</option>
                <option value="likert">Likert scale</option>
                <option value="slider">Slider (1-10)</option>
                <option value="scale">Custom scale</option>
                <option value="rating">Rating (stars)</option>
                <option value="nps">NPS (0-10)</option>
              </select>
            </div>
          </div>

          <div class="grid two">
            <label><input v-model="q.required" type="checkbox" /> Required</label>
            <label><input v-model="q.allowQuoteMe" type="checkbox" /> Allow "quote me"</label>
          </div>

          <div class="grid two">
            <div>
              <label class="lbl">Category (optional)</label>
              <input v-model.trim="q.category" class="input" placeholder="attention, anxiety, etc." />
            </div>
            <div>
              <label class="lbl">Score direction</label>
              <select v-model="q.scoring.direction" class="input">
                <option value="">None</option>
                <option value="positive">Positive</option>
                <option value="negative">Negative</option>
              </select>
            </div>
          </div>

          <label><input v-model="q.scoring.enabled" type="checkbox" /> Enable scoring</label>

          <div v-if="usesOptions(q.type)" class="option-block">
            <div class="lbl">Options</div>
            <div v-for="(opt, oIdx) in q.options" :key="opt.id" class="option-row">
              <input v-model.trim="opt.label" class="input" placeholder="Label" />
              <input v-model.trim="opt.value" class="input" placeholder="Value" />
              <input
                v-if="q.scoring.enabled"
                v-model.number="q.scoring.optionScores[opt.value]"
                class="input"
                type="number"
                placeholder="Score"
              />
              <button class="btn btn-xs btn-secondary" type="button" @click="removeOption(q, oIdx)">x</button>
            </div>
            <button class="btn btn-xs btn-secondary" type="button" @click="addOption(q)">+ option</button>
          </div>

          <div v-if="q.type === 'scale'" class="grid four">
            <input v-model.number="q.scale.min" class="input" type="number" placeholder="Min" />
            <input v-model.number="q.scale.max" class="input" type="number" placeholder="Max" />
            <input v-model.trim="q.scale.minLabel" class="input" placeholder="Min label" />
            <input v-model.trim="q.scale.maxLabel" class="input" placeholder="Max label" />
          </div>
        </div>

        <div class="editor-actions">
          <button class="btn btn-primary" type="button" :disabled="saving || !draft.title" @click="saveSurvey">
            {{ saving ? 'Saving...' : 'Save survey' }}
          </button>
          <span class="small muted">Push to</span>
          <select
            v-model="draft.pushType"
            class="input input-copy-target"
            title="Choose one user role target"
          >
            <option value="">Select user role...</option>
            <option v-for="opt in pushTypeOptions" :key="`action-push-type-${opt.value}`" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <select
            v-if="isSuperAdmin"
            v-model="pushTargetAgencyId"
            class="input input-copy-target"
            title="Choose one organization target"
          >
            <option value="">Push to current organization</option>
            <option v-for="a in pushAgencyOptions" :key="`push-agency-${a.id}`" :value="String(a.id)">
              {{ a.name }}
            </option>
          </select>
          <button
            class="btn btn-secondary"
            type="button"
            :disabled="!selectedSurveyId || pushSaving || !draft.pushType"
            @click="pushSurveyNow"
          >
            {{ pushSaving ? 'Sending...' : `Push to ${pushRoleLabel} @ ${pushTargetLabel}` }}
          </button>
          <router-link
            v-if="selectedSurveyId"
            class="btn btn-secondary"
            :to="surveyResultsPath"
          >
            View results
          </router-link>
          <template v-if="isSuperAdmin && selectedSurveyId">
            <select v-model="copyTargetAgencyId" class="input input-copy-target">
              <option value="">Copy to agency...</option>
              <option v-for="a in copyAgencyOptions" :key="`copy-agency-${a.id}`" :value="String(a.id)">
                {{ a.name }}
              </option>
            </select>
            <button
              class="btn btn-secondary"
              type="button"
              :disabled="copying || !copyTargetAgencyId"
              @click="copySurveyToAgency"
            >
              {{ copying ? 'Copying...' : 'Copy to other agency' }}
            </button>
          </template>
        </div>

        <div class="section-head" style="margin-top:16px;">
          <h3>Preview</h3>
          <div class="row-actions">
            <button class="btn btn-xs btn-secondary" type="button" :class="{ activePreview: previewMode === 'splash' }" @click="previewMode = 'splash'">Splash</button>
            <button class="btn btn-xs btn-secondary" type="button" :class="{ activePreview: previewMode === 'kiosk' }" @click="previewMode = 'kiosk'">Kiosk</button>
            <button class="btn btn-xs btn-primary" type="button" @click="openInteractivePreview">
              Launch {{ previewMode === 'splash' ? 'Splash' : 'Kiosk' }} Preview
            </button>
          </div>
        </div>

        <div v-if="previewMode === 'splash'" class="preview-card">
          <div class="preview-title">Dashboard splash preview</div>
          <section class="survey-prompt-card">
            <div class="head">
              <div>
                <strong>Survey waiting</strong>
                <div class="muted">{{ draft.title || 'Untitled survey' }}</div>
              </div>
            </div>
            <p v-if="draft.description" class="muted" style="margin-top:6px;">{{ draft.description }}</p>
            <div class="body">
              <div v-for="q in cleanedQuestions()" :key="`spl-${q.id}`" class="q">
                <label>{{ q.label || '(Question text)' }}</label>
              </div>
              <div class="actions">
                <button class="btn btn-secondary btn-sm" type="button">Remind me later</button>
                <button class="btn btn-primary btn-sm" type="button">Submit survey</button>
              </div>
            </div>
          </section>
        </div>

        <div v-else class="preview-card">
          <div class="preview-title">Kiosk check-in preview</div>
          <div class="kiosk-preview">
            <h4 style="margin:0 0 8px;">Complete check-in survey</h4>
            <p class="muted small" style="margin-bottom:8px;">This is what appears before final check-in complete.</p>
            <div v-for="q in cleanedQuestions()" :key="`kio-${q.id}`" class="q">
              <label>{{ q.label || '(Question text)' }}</label>
              <input v-if="['text'].includes(q.type)" type="text" disabled placeholder="Short answer" />
              <textarea v-else-if="['textarea','written'].includes(q.type)" rows="2" disabled placeholder="Open-ended response"></textarea>
              <select v-else-if="['select','radio','likert','nps','rating'].includes(q.type)" disabled>
                <option>Select…</option>
                <option v-for="opt in q.options" :key="`pv-${q.id}-${opt.value}`">{{ opt.label }}</option>
              </select>
              <input
                v-else-if="['slider','scale'].includes(q.type)"
                type="range"
                :min="Number(q.scale?.min || 1)"
                :max="Number(q.scale?.max || 10)"
                disabled
              />
              <input v-else type="text" disabled />
              <label v-if="q.allowQuoteMe" class="quote"><input type="checkbox" disabled /> Quote me</label>
            </div>
            <div class="actions">
              <button class="btn btn-primary btn-sm" type="button">Complete check-in</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <div v-if="previewModalOpen" class="preview-modal-overlay" @click.self="closeInteractivePreview">
    <div class="preview-modal">
      <div class="preview-modal-head">
        <h3 style="margin:0;">{{ previewMode === 'splash' ? 'Splash Preview' : 'Kiosk Preview' }}</h3>
        <button class="btn btn-secondary btn-sm" type="button" @click="closeInteractivePreview">Close</button>
      </div>

      <div v-if="!previewCompleted" class="preview-modal-body" :class="{ kioskBody: previewMode === 'kiosk' }">
        <div class="preview-flow-shell" :class="{ kioskShell: previewMode === 'kiosk' }">
          <div class="preview-flow-card" :class="{ kioskCard: previewMode === 'kiosk' }">
            <div class="muted small" style="margin-bottom:6px;">Question {{ previewIndex + 1 }} of {{ previewQuestions.length }}</div>
            <h4 style="margin:0 0 10px;">{{ activePreviewQuestion?.label || '(Question text)' }}</h4>

            <input
              v-if="isTextType(activePreviewQuestion?.type)"
              v-model="previewCurrentAnswer.answer"
              type="text"
              class="input preview-field-full"
              placeholder="Type your answer"
              @input="previewValidationError = ''"
            />
            <textarea
              v-else-if="isTextareaType(activePreviewQuestion?.type)"
              v-model="previewCurrentAnswer.answer"
              rows="4"
              class="input preview-field-full preview-textarea"
              placeholder="Type your response"
              @input="previewValidationError = ''"
            ></textarea>
            <div v-else-if="activePreviewQuestion?.type === 'likert'" class="likert-block">
              <div class="likert-scale">
                <button
                  v-for="(point, idx) in likertPoints(activePreviewQuestion)"
                  :key="`pv-lik-${idx}`"
                  type="button"
                  class="likert-point"
                  :class="{ selected: String(previewCurrentAnswer.answer) === String(point.value) }"
                  @click="selectLikertPoint(point.value)"
                >
                  <span class="likert-point-value">{{ point.value }}</span>
                  <span v-if="showLikertPointLabel(point)" class="likert-point-label">{{ point.label }}</span>
                </button>
              </div>
              <div class="likert-labels">
                <span>{{ likertEdgeLabels(activePreviewQuestion).left }}</span>
                <span>{{ likertEdgeLabels(activePreviewQuestion).right }}</span>
              </div>
            </div>
            <div v-else-if="activePreviewQuestion?.type === 'multiple_choice'" class="multi-choice-preview">
              <label v-for="opt in questionOptions(activePreviewQuestion)" :key="`pv-m-${opt.value}`" class="checkbox-opt">
                <input
                  type="checkbox"
                  :checked="Array.isArray(previewCurrentAnswer.answer) && previewCurrentAnswer.answer.includes(String(opt.value))"
                  @change="togglePreviewMulti(String(opt.value))"
                />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <select
              v-else-if="isSelectType(activePreviewQuestion?.type)"
              v-model="previewCurrentAnswer.answer"
              class="input preview-field-full"
              @change="previewValidationError = ''"
            >
              <option value="">Select...</option>
              <option v-for="opt in questionOptions(activePreviewQuestion)" :key="`pv-s-${opt.value}`" :value="String(opt.value)">
                {{ opt.label }}
              </option>
            </select>
            <div v-else-if="isSliderType(activePreviewQuestion?.type)">
              <input
                v-model.number="previewCurrentAnswer.answer"
                type="range"
                class="input preview-slider-control"
                :min="Number(activePreviewQuestion?.scale?.min || 1)"
                :max="Number(activePreviewQuestion?.scale?.max || 10)"
                @input="markSliderTouched"
              />
              <div class="muted small">
                Value: {{ previewCurrentAnswer.answer || Number(activePreviewQuestion?.scale?.min || 1) }}
              </div>
              <div v-if="!previewCurrentAnswer.touched" class="error small">
                Move the slider to continue.
              </div>
            </div>
            <input v-else v-model="previewCurrentAnswer.answer" type="text" class="input" />

            <label v-if="activePreviewQuestion?.allowQuoteMe" class="quote">
              <input type="checkbox" v-model="previewCurrentAnswer.quoteMe" /> Quote me
            </label>
            <p v-if="activePreviewQuestion?.allowQuoteMe" class="muted small" style="margin-top:2px;">
              Checking this gives permission to attach this response to your name and quote you.
            </p>
            <div v-if="previewValidationError" class="error small">{{ previewValidationError }}</div>

            <div class="preview-modal-actions">
              <button class="btn btn-secondary" type="button" :disabled="previewIndex === 0" @click="previewIndex -= 1">Back</button>
              <button
                class="btn btn-primary"
                type="button"
                :disabled="isSliderType(activePreviewQuestion?.type) && !previewCurrentAnswer.touched"
                @click="nextPreviewStep"
              >
                {{ previewIndex === previewQuestions.length - 1 ? 'Finish' : 'Next question' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="preview-modal-body" :class="{ kioskBody: previewMode === 'kiosk' }">
        <div class="preview-flow-shell" :class="{ kioskShell: previewMode === 'kiosk' }">
          <div class="preview-flow-card" :class="{ kioskCard: previewMode === 'kiosk' }">
            <h4 style="margin:0 0 10px;">Preview complete (not saved)</h4>
            <p class="muted small" style="margin-bottom:12px;">
              This is a fake result view so you can experience exactly what the flow feels like.
            </p>
            <div class="result-list">
              <div v-for="q in previewQuestions" :key="`pv-r-${q.id}`" class="result-item">
                <strong>{{ q.label || q.id }}</strong>
                <div>{{ formatPreviewResult(q.id) }}</div>
              </div>
            </div>
            <div class="preview-modal-actions">
              <button class="btn btn-secondary" type="button" @click="restartPreview">Run again</button>
              <button class="btn btn-primary" type="button" @click="closeInteractivePreview">Done</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const surveys = ref([]);
const selectedSurveyId = ref('');
const loading = ref(false);
const saving = ref(false);
const pushSaving = ref(false);
const error = ref('');
const previewMode = ref('splash');
const previewModalOpen = ref(false);
const previewQuestions = ref([]);
const previewAnswers = ref({});
const previewIndex = ref(0);
const previewCompleted = ref(false);
const previewValidationError = ref('');
const copying = ref(false);
const copyTargetAgencyId = ref('');
const agenciesForCopy = ref([]);
const pushTargetAgencyId = ref('');

const draft = reactive({
  title: '',
  description: '',
  isActive: true,
  isAnonymous: false,
  isScored: false,
  pushType: '',
  questions: []
});

const resolvedAgencyId = ref(0);
const activeOrgSlug = computed(() => {
  const s = String(route.params?.organizationSlug || '').trim();
  return s || '';
});
const adminBasePath = computed(() => activeOrgSlug.value ? `/${activeOrgSlug.value}/admin` : '/admin');
const surveyResultsPath = computed(() =>
  selectedSurveyId.value ? `${adminBasePath.value}/surveys/${selectedSurveyId.value}/results` : ''
);
const isSuperAdmin = computed(() => String(authStore.user?.role || '').trim().toLowerCase() === 'super_admin');
const pushTypeOptions = [
  { value: 'providers', label: 'Providers' },
  { value: 'all_staff', label: 'All staff' },
  { value: 'school_staff', label: 'School staff' },
  { value: 'all', label: 'All roles' }
];
const pushRoleLabel = computed(() => {
  const key = String(draft.pushType || '').trim().toLowerCase();
  return pushTypeOptions.find((o) => o.value === key)?.label || 'selected role';
});
const copyAgencyOptions = computed(() => {
  const current = Number(agencyId());
  return agenciesForCopy.value.filter((a) => Number(a.id) > 0 && Number(a.id) !== current);
});
const pushAgencyOptions = computed(() =>
  agenciesForCopy.value.filter((a) => Number(a.id) > 0)
);
const pushTargetLabel = computed(() => {
  if (!isSuperAdmin.value || !Number(pushTargetAgencyId.value || 0)) return 'current org';
  return pushAgencyOptions.value.find((a) => Number(a.id) === Number(pushTargetAgencyId.value))?.name || 'selected org';
});

const agencyId = () => Number(
  agencyStore.currentAgency?.id
  || resolvedAgencyId.value
  || authStore.user?.agencyId
  || 0
);

const resolveAgencyFromSlug = async () => {
  const slug = activeOrgSlug.value;
  if (!slug) return;
  try {
    const resp = await api.get(`/agencies/slug/${encodeURIComponent(slug)}`);
    const id = Number(resp?.data?.id || 0);
    if (id > 0) resolvedAgencyId.value = id;
  } catch {
    // fall back to currentAgency/auth agency id
  }
};

const newQuestion = () => ({
  id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type: 'text',
  label: '',
  required: false,
  helperText: '',
  allowQuoteMe: false,
  category: '',
  options: [],
  scale: { min: 1, max: 10, minLabel: '', maxLabel: '' },
  scoring: { enabled: false, direction: '', optionScores: {} }
});

const usesOptions = (type) => ['radio', 'multiple_choice', 'likert', 'nps', 'rating'].includes(String(type || ''));

const normalizeQuestionOptions = (q) => {
  if (!usesOptions(q.type)) return;
  if (!Array.isArray(q.options)) q.options = [];
  if (!q.options.length) {
    if (q.type === 'likert') {
      q.options = [
        { id: '1', label: 'Never', value: 'never' },
        { id: '2', label: 'Rarely', value: 'rarely' },
        { id: '3', label: 'Sometimes', value: 'sometimes' },
        { id: '4', label: 'Often', value: 'often' },
        { id: '5', label: 'Always', value: 'always' }
      ];
    } else if (q.type === 'nps') {
      q.options = Array.from({ length: 11 }, (_, i) => ({ id: String(i), label: String(i), value: String(i) }));
    } else if (q.type === 'rating') {
      q.options = Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), label: `${i + 1} star`, value: String(i + 1) }));
    }
  }
};

const hydrateDraft = (s) => {
  draft.title = String(s?.title || '');
  draft.description = String(s?.description || '');
  draft.isActive = !!s?.is_active;
  draft.isAnonymous = !!s?.is_anonymous;
  draft.isScored = !!s?.is_scored;
  draft.pushType = String(s?.push_type || '');
  draft.questions = Array.isArray(s?.questions_json) ? JSON.parse(JSON.stringify(s.questions_json)) : [];
  draft.questions.forEach((q) => {
    q.options = Array.isArray(q.options) ? q.options : [];
    q.scale = q.scale && typeof q.scale === 'object' ? q.scale : { min: 1, max: 10, minLabel: '', maxLabel: '' };
    q.scoring = q.scoring && typeof q.scoring === 'object'
      ? { enabled: !!q.scoring.enabled, direction: String(q.scoring.direction || ''), optionScores: q.scoring.optionScores || {} }
      : { enabled: false, direction: '', optionScores: {} };
    normalizeQuestionOptions(q);
  });
};

const fetchSurveys = async () => {
  loading.value = true;
  error.value = '';
  try {
    const aid = agencyId();
    if (!aid) throw new Error('No agency selected');
    const resp = await api.get('/surveys', { params: { agencyId: aid, includeInactive: 1 } });
    surveys.value = Array.isArray(resp.data) ? resp.data : [];
    if (!selectedSurveyId.value && surveys.value.length) {
      selectedSurveyId.value = surveys.value[0].id;
      hydrateDraft(surveys.value[0]);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load surveys';
  } finally {
    loading.value = false;
  }
};

const fetchAgenciesForCopy = async () => {
  if (!isSuperAdmin.value) return;
  try {
    const resp = await api.get('/agencies');
    const rows = Array.isArray(resp?.data) ? resp.data : [];
    agenciesForCopy.value = rows
      .map((a) => ({ id: Number(a.id || 0), name: String(a.name || a.slug || `Agency ${a.id || ''}`) }))
      .filter((a) => a.id > 0 && a.name);
  } catch {
    agenciesForCopy.value = [];
  }
};

const selectSurvey = (id) => {
  selectedSurveyId.value = Number(id);
  const s = surveys.value.find((x) => Number(x.id) === Number(id));
  if (s) hydrateDraft(s);
};

const startNewSurvey = () => {
  selectedSurveyId.value = '';
  draft.title = '';
  draft.description = '';
  draft.isActive = true;
  draft.isAnonymous = false;
  draft.isScored = false;
  draft.pushType = '';
  draft.questions = [];
};

const addQuestion = () => draft.questions.push(newQuestion());
const removeQuestion = (idx) => draft.questions.splice(idx, 1);
const moveQuestion = (idx, delta) => {
  const next = idx + delta;
  if (next < 0 || next >= draft.questions.length) return;
  const copy = [...draft.questions];
  const temp = copy[idx];
  copy[idx] = copy[next];
  copy[next] = temp;
  draft.questions = copy;
};

const addOption = (q) => {
  q.options.push({
    id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    value: ''
  });
};
const removeOption = (q, idx) => q.options.splice(idx, 1);

const cleanedQuestions = () => {
  return draft.questions.map((q) => {
    normalizeQuestionOptions(q);
    const options = Array.isArray(q.options)
      ? q.options
        .map((o) => ({ id: o.id, label: String(o.label || '').trim(), value: String(o.value || '').trim() }))
        .filter((o) => o.label && o.value)
      : [];
    const optionScores = {};
    if (q.scoring?.enabled) {
      for (const opt of options) {
        if (Object.prototype.hasOwnProperty.call(q.scoring.optionScores || {}, opt.value)) {
          const n = Number(q.scoring.optionScores[opt.value]);
          if (Number.isFinite(n)) optionScores[opt.value] = n;
        }
      }
    }
    return {
      id: String(q.id || '').trim() || `q_${Math.random().toString(36).slice(2, 8)}`,
      type: String(q.type || 'text').trim().toLowerCase(),
      label: String(q.label || '').trim(),
      required: !!q.required,
      helperText: String(q.helperText || '').trim(),
      allowQuoteMe: !!q.allowQuoteMe,
      category: String(q.category || '').trim(),
      options,
      scale: q.scale && typeof q.scale === 'object'
        ? {
          min: Number.isFinite(Number(q.scale.min)) ? Number(q.scale.min) : 1,
          max: Number.isFinite(Number(q.scale.max)) ? Number(q.scale.max) : 10,
          minLabel: String(q.scale.minLabel || '').trim(),
          maxLabel: String(q.scale.maxLabel || '').trim()
        }
        : null,
      scoring: {
        enabled: !!q.scoring?.enabled,
        direction: String(q.scoring?.direction || '').trim().toLowerCase(),
        optionScores
      }
    };
  });
};

const saveSurvey = async () => {
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      agencyId: agencyId(),
      title: draft.title,
      description: draft.description || null,
      isActive: !!draft.isActive,
      isAnonymous: !!draft.isAnonymous,
      isScored: !!draft.isScored,
      pushType: draft.pushType || null,
      questions: cleanedQuestions()
    };
    if (selectedSurveyId.value) {
      await api.put(`/surveys/${selectedSurveyId.value}`, payload);
    } else {
      const resp = await api.post('/surveys', payload);
      selectedSurveyId.value = Number(resp.data?.id || 0) || '';
    }
    await fetchSurveys();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save survey';
  } finally {
    saving.value = false;
  }
};

const deleteSurveyById = async (id) => {
  const numericId = Number(id || 0);
  if (!numericId) return;
  const target = surveys.value.find((s) => Number(s.id) === numericId);
  const label = target?.title || `Survey ${numericId}`;
  const ok = window.confirm(`Delete "${label}"? This cannot be undone.`);
  if (!ok) return;
  error.value = '';
  try {
    await api.delete(`/surveys/${numericId}`);
    if (Number(selectedSurveyId.value) === numericId) {
      selectedSurveyId.value = '';
      startNewSurvey();
    }
    await fetchSurveys();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete survey';
  }
};

const copySurveyToAgency = async () => {
  if (!selectedSurveyId.value || !copyTargetAgencyId.value) return;
  copying.value = true;
  error.value = '';
  try {
    const targetAgencyId = Number(copyTargetAgencyId.value);
    if (!targetAgencyId || targetAgencyId === Number(agencyId())) {
      throw new Error('Choose a different agency');
    }
    const payload = {
      agencyId: targetAgencyId,
      title: `${String(draft.title || 'Untitled Survey').trim()} (Copy)`,
      description: draft.description || null,
      isActive: !!draft.isActive,
      isAnonymous: !!draft.isAnonymous,
      isScored: !!draft.isScored,
      pushType: draft.pushType || null,
      questions: cleanedQuestions()
    };
    await api.post('/surveys', payload);
    copyTargetAgencyId.value = '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to copy survey';
  } finally {
    copying.value = false;
  }
};

const pushSurveyNow = async () => {
  if (!selectedSurveyId.value) return;
  pushSaving.value = true;
  error.value = '';
  try {
    const payload = { pushType: draft.pushType || null };
    if (isSuperAdmin.value && Number(pushTargetAgencyId.value) > 0) {
      payload.targetAgencyId = Number(pushTargetAgencyId.value);
    }
    await api.post(`/surveys/${selectedSurveyId.value}/push`, payload);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to push survey';
  } finally {
    pushSaving.value = false;
  }
};

const isTextType = (type) => ['text'].includes(String(type || ''));
const isTextareaType = (type) => ['textarea', 'written'].includes(String(type || ''));
const isSelectType = (type) => ['select', 'radio', 'likert', 'nps', 'rating'].includes(String(type || ''));
const isSliderType = (type) => ['slider', 'scale'].includes(String(type || ''));

const questionOptions = (q) => {
  const raw = Array.isArray(q?.options) ? q.options : [];
  return raw.map((o) => ({
    label: String(o?.label ?? o?.value ?? o ?? ''),
    value: String(o?.value ?? o?.label ?? o ?? '')
  })).filter((o) => o.label || o.value);
};

const likertPoints = (q) => {
  const opts = questionOptions(q).slice(0, 5);
  if (!opts.length) {
    return [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
  }
  return opts.map((opt, idx) => ({ value: String(idx + 1), label: opt.label }));
};

const likertEdgeLabels = (q) => {
  const points = likertPoints(q);
  const left = points[0]?.label || '1';
  const right = points[points.length - 1]?.label || '5';
  return { left, right };
};

const showLikertPointLabel = (point) => {
  const label = String(point?.label || '').trim();
  const value = String(point?.value || '').trim();
  return !!label && label !== value;
};

const activePreviewQuestion = computed(() => previewQuestions.value[previewIndex.value] || null);
const previewCurrentAnswer = computed({
  get() {
    const q = activePreviewQuestion.value;
    if (!q) return { answer: '', quoteMe: false };
    const key = String(q.id || `q_${previewIndex.value}`);
    if (!previewAnswers.value[key]) {
      previewAnswers.value[key] = {
        answer: isSliderType(q.type) ? Number(q?.scale?.min || 1) : '',
        quoteMe: false,
        touched: false
      };
    }
    return previewAnswers.value[key];
  },
  set(v) {
    const q = activePreviewQuestion.value;
    if (!q) return;
    const key = String(q.id || `q_${previewIndex.value}`);
    previewAnswers.value[key] = v;
  }
});

const togglePreviewMulti = (value) => {
  const cur = Array.isArray(previewCurrentAnswer.value.answer) ? [...previewCurrentAnswer.value.answer] : [];
  const idx = cur.indexOf(value);
  if (idx >= 0) cur.splice(idx, 1);
  else cur.push(value);
  previewCurrentAnswer.value = { ...previewCurrentAnswer.value, answer: cur };
};

const selectLikertPoint = (value) => {
  previewCurrentAnswer.value = { ...previewCurrentAnswer.value, answer: String(value) };
  previewValidationError.value = '';
};

const markSliderTouched = () => {
  previewCurrentAnswer.value = { ...previewCurrentAnswer.value, touched: true };
  previewValidationError.value = '';
};

const openInteractivePreview = () => {
  const qs = cleanedQuestions().filter((q) => String(q.label || '').trim());
  if (!qs.length) {
    error.value = 'Add at least one question with text before preview.';
    return;
  }
  error.value = '';
  previewQuestions.value = qs;
  previewAnswers.value = {};
  previewIndex.value = 0;
  previewCompleted.value = false;
  previewValidationError.value = '';
  previewModalOpen.value = true;
};

const closeInteractivePreview = () => {
  previewModalOpen.value = false;
  previewValidationError.value = '';
};

const hasRequiredAnswer = (q, answerState) => {
  if (!q) return true;
  if (isSliderType(q.type)) return !!answerState?.touched;
  const answer = answerState?.answer;
  if (Array.isArray(answer)) return answer.length > 0;
  return String(answer ?? '').trim().length > 0;
};

const nextPreviewStep = () => {
  const q = activePreviewQuestion.value;
  if (q && isSliderType(q.type) && !previewCurrentAnswer.value?.touched) {
    previewValidationError.value = 'Please move the slider before continuing.';
    return;
  }
  if (q?.required && !hasRequiredAnswer(q, previewCurrentAnswer.value)) {
    previewValidationError.value = 'This question is required before continuing.';
    return;
  }
  previewValidationError.value = '';
  if (previewIndex.value >= previewQuestions.value.length - 1) {
    previewCompleted.value = true;
    return;
  }
  previewIndex.value += 1;
};

const restartPreview = () => {
  previewAnswers.value = {};
  previewIndex.value = 0;
  previewCompleted.value = false;
  previewValidationError.value = '';
};

const formatPreviewResult = (qid) => {
  const v = previewAnswers.value[String(qid)];
  if (!v) return '(No answer)';
  let out = Array.isArray(v.answer) ? v.answer.join(', ') : (v.answer ?? '');
  if (!String(out).trim()) out = '(No answer)';
  if (v.quoteMe) out = `${out} (Quote me)`;
  return out;
};

onMounted(async () => {
  await resolveAgencyFromSlug();
  await Promise.all([fetchSurveys(), fetchAgenciesForCopy()]);
});

watch(
  () => agencyStore.currentAgency?.id,
  async (id) => {
    if (Number(id || 0) > 0 && !surveys.value.length) {
      await fetchSurveys();
    }
  }
);

watch(
  () => isSuperAdmin.value,
  async (v) => {
    if (v && !agenciesForCopy.value.length) await fetchAgenciesForCopy();
  }
);
</script>

<style scoped>
.layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; }
.survey-list { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; max-height: 72vh; overflow: auto; }
.survey-list-item { padding: 10px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; margin-bottom: 8px; }
.survey-list-item.active { border-color: #cbd5e1; background: #f8fafc; }
.survey-list-item-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.survey-meta { margin-top: 4px; }
.editor { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
.question-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.question-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.option-row { display: grid; grid-template-columns: 1fr 1fr 120px 42px; gap: 8px; margin-bottom: 6px; }
.header-actions, .editor-actions, .row-actions, .toggle-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; }
.grid.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
.grid.four { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }
.small { font-size: .85rem; }
.input-copy-target { min-width: 220px; max-width: 320px; }
.activePreview { background: #e2e8f0; }
.preview-card { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px; margin-top: 8px; }
.preview-title { font-size: .9rem; color: #64748b; margin-bottom: 8px; font-weight: 700; }
.survey-prompt-card, .kiosk-preview { border: 1px solid #dbe3ef; border-radius: 12px; padding: 12px; background: #fff; }
.head { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.q { margin: 10px 0; display: grid; gap: 6px; }
.q input[type="text"], .q textarea, .q select { width: 100%; }
.quote { font-size: .9rem; color: #475569; display: flex; align-items: center; gap: 6px; }
.preview-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.preview-modal {
  width: min(760px, 96vw);
  max-height: 92vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #dbe3ef;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.28);
}
.preview-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
}
.preview-modal-body { padding: 14px; }
.kioskBody {
  background: radial-gradient(circle at 30% 20%, #334155 0%, #0f172a 45%, #020617 100%);
}
.preview-flow-shell { width: 100%; }
.kioskShell {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 560px;
  padding: 24px 0;
}
.preview-flow-card { width: 100%; }
.kioskCard {
  width: min(760px, 95%);
  background: #ffffff;
  border: 14px solid #111827;
  border-radius: 36px;
  padding: 22px 20px;
  box-shadow: 0 30px 50px rgba(2, 6, 23, 0.55);
  position: relative;
}
.kioskCard::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 72px;
  height: 6px;
  border-radius: 999px;
  background: #475569;
}
.preview-modal-actions { display: flex; gap: 8px; margin-top: 14px; }
.multi-choice-preview { display: grid; gap: 8px; }
.checkbox-opt { display: flex; gap: 8px; align-items: center; }
.result-list { display: grid; gap: 10px; }
.result-item { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 8px; padding: 8px 10px; }
.preview-field-full { width: 100%; }
.preview-textarea { min-height: 120px; }
.preview-slider-control {
  display: block;
  width: clamp(320px, 55%, 640px);
  margin: 4px auto;
}
.likert-block { width: 100%; }
.likert-scale {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.likert-point {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 8px 6px;
  font-weight: 700;
  cursor: pointer;
  min-height: 64px;
  display: grid;
  gap: 2px;
  align-content: center;
}
.likert-point.selected {
  border-color: #14b8a6;
  background: #ccfbf1;
  color: #0f766e;
}
.likert-point-value {
  line-height: 1;
}
.likert-point-label {
  font-size: .72rem;
  font-weight: 500;
  color: #475569;
  line-height: 1.15;
}
.likert-labels {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  font-size: .85rem;
}
@media (max-width: 980px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
