<template>
  <div class="training-player">
    <div v-if="loading" class="state">Loading training…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>

    <template v-else-if="module">
      <!-- Start splash -->
      <div v-if="!isPreview && !readOnly && !hasStarted && !isCompleted" class="splash">
        <div class="splash-card">
          <p class="crumb">{{ courseTitle }}</p>
          <h1>{{ module.title }}</h1>
          <p class="muted">{{ module.description || (isPrehireMode ? 'Complete this form to continue.' : 'When you start, your progress and time are saved automatically.') }}</p>
          <div class="splash-actions">
            <button type="button" class="btn btn-primary btn-lg" :disabled="starting" @click="startModule">
              {{ starting ? 'Starting…' : (isPrehireMode ? 'Start Form' : 'Start Lesson') }}
            </button>
            <button type="button" class="btn btn-secondary" @click="exitCourse">Exit</button>
          </div>
          <PoweredByFooter />
        </div>
      </div>

      <div v-else class="player-layout">
        <header class="player-top">
          <div class="top-left">
            <nav class="breadcrumb">
              <button type="button" class="linkish" @click="exitCourse">{{ exitLabel }}</button>
              <span v-if="courseTitle"> / {{ courseTitle }}</span>
              <span> / {{ module.title }}</span>
            </nav>
            <h1>{{ module.title }}</h1>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="exitCourse">Exit Course</button>
        </header>

        <div v-if="isPrehireMode && portalReturnLink" class="prehire-banner">
          <div>
            <strong>Save your personal link</strong>
            <code>{{ portalReturnLink }}</code>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="copyPortalLink">
            {{ portalLinkCopied ? 'Copied!' : 'Copy link' }}
          </button>
        </div>

        <div v-if="isPreview" class="preview-banner">Preview mode — progress is not saved</div>

        <div class="player-body">
          <main class="lesson-main">
            <FocusStepTimeTracker
              v-if="focusStepContext && !isPreview && !readOnly && !isPrehireMode"
              :focus-id="focusStepContext.focusId"
              :step-id="focusStepContext.stepId"
              :agency-id="focusStepContext.agencyId"
              :module-id="module.id"
              :enabled="hasStarted"
              :disable-idle-timeout="hasVideoBlock"
              @session-seconds="(s) => (sessionSeconds = s)"
            />
            <TimeTracker
              v-else-if="!isPreview && !readOnly && !isPrehireMode"
              :module-id="module.id"
              :enabled="hasStarted"
              :disable-idle-timeout="hasVideoBlock"
              @session-seconds="(s) => (sessionSeconds = s)"
            />

            <p v-if="lessonMeta" class="lesson-meta">{{ lessonMeta }}</p>

            <TrainingBlockRenderer
              v-for="(block, index) in content"
              :key="block.id || index"
              :block="block"
              :index="index"
              :module-id="module.id"
              :read-only="readOnly || isPreview"
              :disabled="isCompleted"
              @quiz-completed="handleQuizCompleted"
              @acknowledged="acknowledgmentSaved = true"
              @save-response="onSaveResponse"
              @knowledge-check="onKnowledgeCheck"
            >
              <template #form="{ block: formBlock }">
                <div class="inline-form">
                  <div v-if="!formDefinition" class="muted">Loading form…</div>
                  <template v-else>
                    <div v-for="field in fieldsForBlock(formBlock)" :key="field.id" class="form-field">
                      <label>{{ field.field_label }}</label>
                      <textarea
                        v-if="field.field_type === 'textarea'"
                        v-model="formValues[field.id]"
                        rows="4"
                        :disabled="isCompleted || readOnly"
                      />
                      <input
                        v-else-if="field.field_type === 'boolean'"
                        v-model="formValues[field.id]"
                        type="checkbox"
                        :disabled="isCompleted || readOnly"
                      />
                      <input
                        v-else
                        v-model="formValues[field.id]"
                        :type="field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'"
                        :disabled="isCompleted || readOnly"
                      />
                    </div>
                    <button
                      v-if="!readOnly && !isCompleted"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="formSaving"
                      @click="saveFormValues(false)"
                    >
                      {{ formSaving ? 'Saving…' : 'Save' }}
                    </button>
                    <span v-if="formSaveMessage" class="muted">{{ formSaveMessage }}</span>
                    <p v-if="formPageError" class="error-text">{{ formPageError }}</p>
                  </template>
                </div>
              </template>
            </TrainingBlockRenderer>

            <div v-if="!content.length" class="empty">This lesson has no content yet.</div>

            <div class="lesson-nav">
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="!prevLesson"
                @click="goLesson(prevLesson)"
              >
                Previous
              </button>
              <button
                v-if="!isPreview && !readOnly && canComplete"
                type="button"
                class="btn btn-success"
                :disabled="completing"
                @click="completeModule"
              >
                {{ completing ? 'Completing…' : 'Mark Lesson Complete' }}
              </button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="!nextLesson"
                @click="goLesson(nextLesson)"
              >
                Next
              </button>
            </div>

            <div v-if="isCompleted" class="completed-banner">
              <h3>Lesson completed</h3>
              <p v-if="quizResults">Quiz score: {{ quizResults.score }}% ({{ quizResults.passed ? 'Passed' : 'Failed' }})</p>
              <button
                v-if="focusStepContext && courseProgressPct >= 100"
                type="button"
                class="btn btn-primary btn-sm"
                @click="downloadCertificate"
              >
                Download Certificate
              </button>
            </div>
          </main>

          <aside class="lesson-aside">
            <div class="progress-card">
              <div class="progress-label">
                <span>{{ courseProgressPct }}% Complete</span>
                <span class="muted">{{ completedLessonCount }} of {{ outlineLessons.length || 1 }} lessons</span>
              </div>
              <div class="progress-bar"><div :style="{ width: courseProgressPct + '%' }" /></div>
            </div>

            <div class="aside-tabs">
              <button type="button" :class="{ active: asideTab === 'outline' }" @click="asideTab = 'outline'">Outline</button>
              <button type="button" :class="{ active: asideTab === 'notes' }" @click="asideTab = 'notes'">Notes</button>
            </div>

            <div v-if="asideTab === 'outline'" class="outline">
              <button
                v-for="(lesson, i) in outlineDisplay"
                :key="lesson.id || i"
                type="button"
                class="outline-item"
                :class="{
                  active: Number(lesson.id) === Number(module.id),
                  done: lesson.status === 'completed',
                  locked: lesson.locked
                }"
                :disabled="lesson.locked"
                @click="goLesson(lesson)"
              >
                <span class="mark">{{ lesson.status === 'completed' ? '✓' : (Number(lesson.id) === Number(module.id) ? '▶' : i + 1) }}</span>
                <span class="otitle">{{ lesson.title }}</span>
              </button>
            </div>

            <div v-else class="notes-panel">
              <textarea
                v-model="notes"
                rows="10"
                placeholder="Jot down notes for this lesson…"
                @input="persistNotes"
              />
              <p class="muted">{{ notesStatus }}</p>
            </div>

            <div v-if="resourceBlocks.length" class="resources">
              <h4>Resources</h4>
              <a
                v-for="r in resourceBlocks"
                :key="r.id"
                :href="r.content_data?.fileUrl || r.content_data?.googleUrl || '#'"
                target="_blank"
                rel="noopener"
              >
                {{ r.title || r.content_data?.title || 'Resource' }}
              </a>
            </div>

            <div class="help-card">
              <h4>Need help?</h4>
              <p class="muted">Contact your administrator or HR if you are stuck.</p>
            </div>
          </aside>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import api from '../services/api';
import TrainingBlockRenderer from '../components/training/TrainingBlockRenderer.vue';
import TimeTracker from '../components/TimeTracker.vue';
import FocusStepTimeTracker from '../components/FocusStepTimeTracker.vue';
import PoweredByFooter from '../components/PoweredByFooter.vue';
import { getDashboardRoute } from '../utils/router';
import { parseModuleContentData } from '../utils/trainingContentNormalize.js';
import { normalizeContentType } from '../utils/trainingBlockTypes.js';

const props = defineProps({
  /** When true, load via on-demand API and skip progress writes */
  onDemand: { type: Boolean, default: false }
});

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const module = ref(null);
const content = ref([]);
const progress = ref(null);
const hasStarted = ref(false);
const starting = ref(false);
const completing = ref(false);
const acknowledgmentSaved = ref(false);
const quizResults = ref(null);
const sessionSeconds = ref(0);
const asideTab = ref('outline');
const notes = ref('');
const notesStatus = ref('Notes sync to your account.');
const courseTitle = ref('');
let notesTimer = null;
const outlineLessons = ref([]);
const courseProgressPct = ref(0);
const completedLessonCount = ref(0);
const portalLinkCopied = ref(false);
const formDefinition = ref(null);
const formValues = ref({});
const formSaving = ref(false);
const formSaveMessage = ref('');
const formPageError = ref('');
const kcPassed = ref({});

const isPreview = computed(() => {
  const p = route.query.preview;
  return p === '1' || p === 'true' || p === true;
});
const readOnly = computed(() => props.onDemand === true);
const isPrehireMode = computed(() =>
  route.meta?.isPrehireModule === true
  || Boolean(route.params.token && String(route.path || '').includes('/pre-hire/'))
);
const prehireToken = computed(() => String(route.params.token || '').trim());
const portalReturnPath = computed(() => (prehireToken.value ? `/pre-hire/${prehireToken.value}` : ''));
const portalReturnLink = computed(() =>
  portalReturnPath.value ? `${window.location.origin}${portalReturnPath.value}` : ''
);

const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: false
});
const moduleHttp = () => (isPrehireMode.value ? portalApi : api);
const modulePath = (suffix = '') =>
  isPrehireMode.value && prehireToken.value
    ? `/prehire-portal/${prehireToken.value}/modules/${route.params.id}${suffix}`
    : `/modules/${route.params.id}${suffix}`;

const focusStepContext = computed(() => {
  const focusId = route.query.focusId;
  const stepId = route.query.stepId;
  const agencyId = route.query.agencyId;
  if (focusId && stepId && agencyId) {
    return {
      focusId: parseInt(focusId, 10),
      stepId: parseInt(stepId, 10),
      agencyId: parseInt(agencyId, 10)
    };
  }
  return null;
});

const isCompleted = computed(() => progress.value?.status === 'completed');
const hasVideoBlock = computed(() => content.value.some((b) => normalizeContentType(b.content_type, b.content_data) === 'video'));
const resourceBlocks = computed(() =>
  content.value.filter((b) => ['pdf', 'image'].includes(normalizeContentType(b.content_type, b.content_data)))
);
const exitLabel = computed(() => {
  if (isPrehireMode.value) return 'My portal';
  if (props.onDemand) return 'My Learning';
  return 'My Learning';
});

const lessonMeta = computed(() => {
  if (!outlineLessons.value.length) return null;
  const idx = outlineLessons.value.findIndex((l) => Number(l.id) === Number(module.value?.id));
  if (idx < 0) return null;
  return `Lesson ${idx + 1} of ${outlineLessons.value.length}`;
});

const outlineDisplay = computed(() => {
  if (outlineLessons.value.length) return outlineLessons.value;
  return [{ id: module.value?.id, title: module.value?.title, status: isCompleted.value ? 'completed' : 'current' }];
});

const currentIndex = computed(() =>
  outlineDisplay.value.findIndex((l) => Number(l.id) === Number(module.value?.id))
);
const prevLesson = computed(() => (currentIndex.value > 0 ? outlineDisplay.value[currentIndex.value - 1] : null));
const nextLesson = computed(() => {
  const i = currentIndex.value;
  if (i < 0 || i >= outlineDisplay.value.length - 1) return null;
  const next = outlineDisplay.value[i + 1];
  return next?.locked ? null : next;
});

const needsAck = computed(() => content.value.some((b) => normalizeContentType(b.content_type, b.content_data) === 'acknowledgment'));
const requiredKcIds = computed(() =>
  content.value
    .filter((b) => {
      const t = normalizeContentType(b.content_type, b.content_data);
      if (t !== 'knowledge_check') return false;
      const settings = typeof b.settings === 'string' ? JSON.parse(b.settings || '{}') : (b.settings || {});
      return settings.required !== false;
    })
    .map((b) => b.id)
);

const canComplete = computed(() => {
  if (isCompleted.value || readOnly.value) return false;
  if (needsAck.value && !acknowledgmentSaved.value) return false;
  for (const id of requiredKcIds.value) {
    if (!kcPassed.value[id]) return false;
  }
  return true;
});

function fieldsForBlock(formBlock) {
  const ids = formBlock?.content_data?.fieldDefinitionIds;
  const fields = formDefinition.value?.fields || [];
  if (!Array.isArray(ids) || !ids.length) return fields;
  const map = new Map(fields.map((f) => [f.id, f]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const id = route.params.id;
    if (props.onDemand) {
      const res = await api.get(`/on-demand-training/modules/${id}`);
      module.value = res.data;
      content.value = (res.data.content || []).map((item) => ({
        ...item,
        content_data: parseModuleContentData(item.content_data),
        content_type: normalizeContentType(item.content_type, parseModuleContentData(item.content_data))
      }));
      hasStarted.value = true;
      courseTitle.value = 'On-Demand';
    } else {
      const [modRes, contentRes] = await Promise.all([
        isPrehireMode.value ? moduleHttp().get(modulePath('')) : api.get(`/modules/${id}`),
        isPrehireMode.value ? moduleHttp().get(modulePath('/content')) : api.get(`/modules/${id}/content`)
      ]);
      module.value = modRes.data;
      content.value = (contentRes.data || []).map((item) => ({
        ...item,
        content_data: parseModuleContentData(item.content_data),
        content_type: normalizeContentType(item.content_type, parseModuleContentData(item.content_data))
      }));

      if (content.value.some((i) => i.content_type === 'form')) {
        await loadFormDefinition();
      }

      if (!isPreview.value && !isPrehireMode.value) {
        try {
          const progressRes = await api.get('/progress');
          progress.value = progressRes.data.find((p) => p.module_id === parseInt(id, 10)) || null;
          hasStarted.value = progress.value?.status === 'in_progress' || progress.value?.status === 'completed';
        } catch {
          progress.value = null;
        }
        try {
          const ack = await api.get(`/acknowledgments/${id}`);
          if (ack.data?.acknowledged) acknowledgmentSaved.value = true;
        } catch { /* none */ }
      } else if (isPrehireMode.value) {
        hasStarted.value = false;
        acknowledgmentSaved.value = true;
      } else {
        hasStarted.value = true;
      }
    }

    await loadOutline();
    await loadNotes();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to load lesson';
  } finally {
    loading.value = false;
  }
}

async function loadFormDefinition() {
  try {
    const res = isPrehireMode.value
      ? await moduleHttp().get(modulePath('/form-definition'))
      : await api.get(`/modules/${route.params.id}/form-definition`);
    formDefinition.value = res.data;
    const next = {};
    (res.data?.fields || []).forEach((f) => {
      next[f.id] = f.field_type === 'boolean' ? !!f.value : (f.value ?? (f.field_type === 'multi_select' ? [] : ''));
    });
    formValues.value = next;
  } catch {
    formDefinition.value = null;
  }
}

async function loadOutline() {
  const focusId = focusStepContext.value?.focusId || module.value?.track_id;
  if (!focusId || props.onDemand) {
    outlineLessons.value = [];
    courseTitle.value = props.onDemand ? 'On-Demand Training' : '';
    courseProgressPct.value = isCompleted.value ? 100 : 0;
    completedLessonCount.value = isCompleted.value ? 1 : 0;
    return;
  }
  try {
    const [focusRes, stepsRes] = await Promise.all([
      api.get(`/training-focuses/${focusId}`).catch(() => api.get(`/tracks/${focusId}`)),
      api.get(`/training-focuses/${focusId}/steps`).catch(() => ({ data: { steps: [] } }))
    ]);
    courseTitle.value = focusRes.data?.name || focusRes.data?.title || 'Course';
    const steps = stepsRes.data?.steps || [];
    const lessons = steps
      .filter((s) => (s.stepType || s.step_type) === 'module')
      .map((s, i) => ({
        id: s.referenceId || s.reference_id || s.module_id,
        title: s.title || s.module_title || `Lesson ${i + 1}`,
        status: s.status || s.progress_status || 'not_started',
        locked: s.locked === true
      }))
      .filter((l) => l.id);
    outlineLessons.value = lessons;
    const done = lessons.filter((l) => l.status === 'completed' || Number(l.id) === Number(module.value?.id) && isCompleted.value).length;
    completedLessonCount.value = done;
    courseProgressPct.value = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  } catch {
    outlineLessons.value = [];
  }
}

async function startModule() {
  starting.value = true;
  try {
    if (isPrehireMode.value) {
      await moduleHttp().post(modulePath('/progress/start'));
    } else {
      await api.post('/progress/start', { moduleId: parseInt(route.params.id, 10) });
    }
    hasStarted.value = true;
    progress.value = { ...(progress.value || {}), status: 'in_progress' };
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to start';
  } finally {
    starting.value = false;
  }
}

async function completeModule() {
  if (isPreview.value || readOnly.value) return;
  completing.value = true;
  try {
    if (content.value.some((b) => b.content_type === 'form')) {
      const ok = await saveFormValues(true);
      if (!ok) return;
    }
    if (isPrehireMode.value) {
      await moduleHttp().post(modulePath('/complete'));
    } else {
      await api.post('/progress/complete', {
        moduleId: module.value.id,
        focusId: focusStepContext.value?.focusId,
        agencyId: focusStepContext.value?.agencyId,
        stepId: focusStepContext.value?.stepId
      });
    }
    progress.value = { ...(progress.value || {}), status: 'completed', completed_at: new Date().toISOString() };
    await loadOutline();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to complete lesson';
  } finally {
    completing.value = false;
  }
}

async function saveFormValues(validate) {
  formPageError.value = '';
  formSaveMessage.value = '';
  const fields = formDefinition.value?.fields || [];
  const values = fields.map((f) => ({
    fieldDefinitionId: f.id,
    value: typeof formValues.value[f.id] === 'boolean'
      ? (formValues.value[f.id] ? 'true' : 'false')
      : formValues.value[f.id]
  }));
  try {
    formSaving.value = true;
    const suffix = validate ? '?validate=true' : '';
    if (isPrehireMode.value) {
      await moduleHttp().post(`${modulePath('/form-submit')}${suffix}`, { values, skipBlanks: true });
    } else {
      await api.post(`/modules/${module.value.id}/form-submit${suffix}`, { values, skipBlanks: true });
    }
    formSaveMessage.value = validate ? 'Validated' : 'Saved';
    return true;
  } catch (err) {
    formPageError.value = err?.response?.data?.error?.message || 'Failed to save form';
    return false;
  } finally {
    formSaving.value = false;
  }
}

function handleQuizCompleted(data) {
  if (data) quizResults.value = data;
}

function onKnowledgeCheck({ blockId, correct }) {
  if (correct) kcPassed.value = { ...kcPassed.value, [blockId]: true };
}

async function onSaveResponse({ blockId, text }) {
  try {
    await api.post(`/modules/${module.value.id}/responses`, { contentId: blockId, responseText: text });
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to save response');
  }
}

async function loadNotes() {
  if (!module.value?.id || readOnly.value || isPreview.value) {
    notes.value = localStorage.getItem(`notes:${module.value?.id}`) || '';
    return;
  }
  try {
    const res = await api.get(`/modules/${module.value.id}/notes`);
    const serverNotes = res.data?.notes ?? '';
    notes.value = serverNotes || localStorage.getItem(`notes:${module.value.id}`) || '';
    notesStatus.value = res.data?.updatedAt
      ? 'Notes sync to your account.'
      : 'Notes sync to your account.';
    try {
      localStorage.setItem(`notes:${module.value.id}`, notes.value);
    } catch { /* ignore */ }
  } catch {
    notes.value = localStorage.getItem(`notes:${module.value.id}`) || '';
    notesStatus.value = 'Offline — notes saved on this device.';
  }
}

function persistNotes() {
  try {
    localStorage.setItem(`notes:${module.value.id}`, notes.value);
  } catch { /* ignore */ }
  if (readOnly.value || isPreview.value || isPrehireMode.value) {
    notesStatus.value = 'Notes saved on this device.';
    return;
  }
  notesStatus.value = 'Saving…';
  if (notesTimer) clearTimeout(notesTimer);
  notesTimer = setTimeout(async () => {
    try {
      await api.put(`/modules/${module.value.id}/notes`, { notes: notes.value });
      notesStatus.value = 'Saved to your account.';
    } catch {
      notesStatus.value = 'Could not sync — kept on this device.';
    }
  }, 600);
}

function exitCourse() {
  if (isPrehireMode.value && portalReturnPath.value) {
    router.push(portalReturnPath.value);
    return;
  }
  if (props.onDemand || route.path.includes('on-demand')) {
    const org = route.params.organizationSlug;
    router.push(org ? `/${org}/my-learning` : '/my-learning');
    return;
  }
  const org = route.params.organizationSlug;
  if (org) {
    router.push(`/${org}/dashboard?tab=training`);
    return;
  }
  const dash = getDashboardRoute() || '/dashboard';
  router.push({ path: String(dash).split('?')[0], query: { tab: 'training' } });
}

function goLesson(lesson) {
  if (!lesson?.id || lesson.locked) return;
  if (Number(lesson.id) === Number(module.value?.id)) return;
  const org = route.params.organizationSlug;
  const q = { ...route.query };
  const base = props.onDemand
    ? (org ? `/${org}/on-demand-training/modules/${lesson.id}` : `/on-demand-training/modules/${lesson.id}`)
    : (org ? `/${org}/module/${lesson.id}` : `/module/${lesson.id}`);
  router.push({ path: base, query: q });
}

async function downloadCertificate() {
  try {
    const focusId = focusStepContext.value?.focusId;
    if (!focusId) return;
    const res = await api.get(`/certificates/training-focus/${focusId}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'certificate.pdf';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert('Certificate not available yet');
  }
}

async function copyPortalLink() {
  try {
    await navigator.clipboard.writeText(portalReturnLink.value);
    portalLinkCopied.value = true;
    setTimeout(() => { portalLinkCopied.value = false; }, 2000);
  } catch {
    window.prompt('Copy link:', portalReturnLink.value);
  }
}

watch(() => route.params.id, () => load());
onMounted(load);
</script>

<style scoped>
.training-player {
  min-height: calc(100vh - 64px);
  background: linear-gradient(180deg, var(--bg-alt) 0%, var(--bg) 240px);
  color: var(--text-primary);
}
.state { padding: 64px; text-align: center; }
.state.error { color: var(--error); }
.splash {
  min-height: calc(100vh - 64px);
  display: grid;
  place-items: center;
  padding: 24px;
}
.splash-card {
  max-width: 520px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.splash-card h1 { margin: 8px 0 12px; font-family: var(--font-header); }
.splash-actions { display: flex; gap: 10px; justify-content: center; margin: 20px 0; flex-wrap: wrap; }
.crumb { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
.player-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
}
.player-top h1 { margin: 6px 0 0; font-size: 1.35rem; font-family: var(--font-header); }
.breadcrumb { font-size: 13px; color: var(--text-secondary); }
.linkish { border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; padding: 0; }
.preview-banner, .prehire-banner {
  margin: 0 24px;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--warning) 16%, transparent);
  font-size: 13px;
}
.prehire-banner {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.prehire-banner code { display: block; font-size: 11px; word-break: break-all; margin-top: 4px; }
.player-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 0;
  max-width: 1280px;
  margin: 0 auto;
}
.lesson-main { padding: 24px 28px 64px; }
.lesson-aside {
  border-left: 1px solid var(--border);
  padding: 20px 16px 40px;
  background: var(--bg);
  position: sticky;
  top: 72px;
  align-self: start;
  max-height: calc(100vh - 72px);
  overflow: auto;
}
.lesson-meta { color: var(--text-secondary); font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.progress-card { margin-bottom: 16px; }
.progress-label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
.progress-bar { height: 8px; background: var(--bg-alt); border-radius: 999px; overflow: hidden; }
.progress-bar > div { height: 100%; background: var(--primary); border-radius: 999px; transition: width 0.25s; }
.aside-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.aside-tabs button {
  flex: 1;
  border: none;
  background: var(--bg-alt);
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
}
.aside-tabs button.active { background: color-mix(in srgb, var(--primary) 18%, transparent); color: var(--secondary); }
.outline-item {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
}
.outline-item:hover:not(:disabled) { background: var(--bg-alt); }
.outline-item.active { background: color-mix(in srgb, var(--primary) 14%, transparent); border-color: color-mix(in srgb, var(--primary) 30%, transparent); }
.outline-item.done .mark { color: var(--success); font-weight: 700; }
.outline-item.locked { opacity: 0.45; cursor: not-allowed; }
.mark { width: 20px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--text-secondary); }
.otitle { font-size: 13px; font-weight: 600; }
.notes-panel textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  font: inherit;
  resize: vertical;
}
.resources, .help-card { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.resources h4, .help-card h4 { margin: 0 0 8px; font-size: 13px; }
.resources a { display: block; font-size: 13px; color: var(--accent); margin-bottom: 6px; }
.lesson-nav {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}
.completed-banner {
  margin-top: 20px;
  padding: 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--success) 12%, transparent);
}
.inline-form { display: flex; flex-direction: column; gap: 10px; }
.form-field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.form-field input, .form-field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
}
.error-text { color: var(--error); font-size: 13px; }
.muted { color: var(--text-secondary); }
.empty { padding: 40px; text-align: center; color: var(--text-secondary); }
@media (max-width: 960px) {
  .player-body { grid-template-columns: 1fr; }
  .lesson-aside { position: static; max-height: none; border-left: none; border-top: 1px solid var(--border); }
}
</style>
