<template>
  <div v-if="open" class="modal-overlay" @click.self="handleClose">
    <div class="wizard-modal">
      <div class="wizard-header">
        <h2>{{ mode === 'append' ? 'Add content with AI' : 'Build Module with AI' }}</h2>
        <button type="button" class="btn btn-secondary btn-sm" @click="handleClose">Close</button>
      </div>

      <div v-if="!agencyId" class="empty-state">
        Select an agency (use the agency filter above) before using the AI builder.
      </div>
      <div v-else-if="!trainingAiEnabled" class="empty-state">
        Training AI Module Builder is not enabled for this organization.
      </div>

      <template v-else>
        <div class="steps">
          <span :class="{ active: step === 1 }">1. Basics</span>
          <span :class="{ active: step === 2 }">2. Sources</span>
          <span :class="{ active: step === 3 }">3. Preview</span>
        </div>

        <div v-if="error" class="error-banner">{{ error }}</div>

        <!-- Step 1 -->
        <div v-show="step === 1" class="step-body">
          <div class="form-group">
            <label>Module title *</label>
            <input v-model="form.title" type="text" class="input" placeholder="e.g. Workplace Safety Essentials" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="form.description" rows="2" class="input" />
          </div>
          <div class="form-group">
            <label>Learning objectives</label>
            <textarea v-model="form.learningObjectives" rows="2" class="input" placeholder="What should learners know after completing this module?" />
          </div>
          <div class="form-group">
            <label>Content template</label>
            <select v-model="form.templateId" class="input">
              <option value="rich-text-quiz">Rich text lesson + quiz</option>
              <option value="document-quiz">Document lesson + quiz</option>
            </select>
          </div>
          <div v-if="mode !== 'append'" class="form-group">
            <label>Link to training focus (optional)</label>
            <select v-model="form.trainingFocusId" class="input">
              <option :value="null">None — standalone module</option>
              <option v-for="f in trainingFocuses" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </div>
          <p v-else class="muted small">
            Generated pages will be added to the module you are editing. Save when finished to persist.
          </p>
        </div>

        <!-- Step 2 -->
        <div v-show="step === 2" class="step-body">
          <p class="muted">
            Agency handbook: {{ kbDocCount }} file(s) on file.
            <button type="button" class="link-btn" @click="$emit('open-kb-settings')">Manage reference docs</button>
          </p>
          <div class="form-group">
            <label>Additional notes for AI</label>
            <textarea v-model="form.notes" rows="3" class="input" placeholder="Topics to emphasize, audience, etc." />
          </div>
          <div class="form-group">
            <label>Upload source files for this module (PDF or TXT)</label>
            <input ref="sourceFilesInput" type="file" class="input" accept=".pdf,.txt" multiple @change="onSourceFilesChange" />
            <small v-if="sourceFileNames.length" class="hint">{{ sourceFileNames.join(', ') }}</small>
          </div>
          <p class="muted small">
            AI will use uploaded files plus your agency handbook/policies. At least one source (upload, notes, or handbook) is required.
          </p>
        </div>

        <!-- Step 3 -->
        <div v-show="step === 3" class="step-body preview-step">
          <div v-if="generating" class="generating">
            <p>Generating draft with Gemini…</p>
            <p class="muted">This may take 15–30 seconds.</p>
          </div>
          <template v-else-if="draft">
            <div v-if="draft.alignmentNotes" class="alignment-notes">
              <strong>AI notes:</strong> {{ draft.alignmentNotes }}
            </div>
            <div v-if="draft.sourcesUsed?.length" class="sources-used">
              <strong>Sources referenced:</strong>
              <ul>
                <li v-for="(s, i) in draft.sourcesUsed" :key="i">{{ s.kind }}: {{ s.name }}</li>
              </ul>
            </div>

            <div v-for="(page, idx) in draft.pages" :key="idx" class="preview-page">
              <h4>{{ pageLabel(page) }}</h4>
              <div v-if="page.type === 'intro'" class="preview-block">
                <p><strong>{{ page.data.title }}</strong></p>
                <p>{{ page.data.description }}</p>
              </div>
              <div v-else-if="page.type === 'document'" class="preview-block doc-preview" v-html="sanitizePreview(page.data.textContent)" />
              <div v-else-if="page.type === 'quiz'" class="preview-quiz">
                <QuizBuilder
                  :content="normalizeQuizDataForEditor(page.data)"
                  @update="(c) => updateQuizPage(idx, c)"
                />
              </div>
            </div>
          </template>
        </div>

        <div class="wizard-actions">
          <button v-if="step > 1" type="button" class="btn btn-secondary" :disabled="generating || applying" @click="step--">
            Back
          </button>
          <button
            v-if="step < 3"
            type="button"
            class="btn btn-primary"
            :disabled="!canAdvance"
            @click="advanceStep"
          >
            {{ step === 2 ? (generating ? 'Generating…' : 'Generate draft') : 'Next' }}
          </button>
          <button
            v-if="step === 3 && draft"
            type="button"
            class="btn btn-primary"
            :disabled="applying"
            @click="applyDraft"
          >
            {{ applying ? 'Applying…' : (mode === 'append' ? 'Add pages to this module' : 'Create module & open editor') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import QuizBuilder from './QuizBuilder.vue';
import { normalizeQuizDataForEditor } from '../../utils/trainingContentNormalize.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: Number, default: null },
  trainingAiEnabled: { type: Boolean, default: false },
  trainingFocuses: { type: Array, default: () => [] },
  kbDocCount: { type: Number, default: 0 },
  /** create = new module; append = add generated pages to module already open in editor */
  mode: { type: String, default: 'create' },
  existingModuleId: { type: Number, default: null },
  initialTitle: { type: String, default: '' },
  initialDescription: { type: String, default: '' }
});

const emit = defineEmits(['close', 'open-kb-settings', 'applied', 'append-draft']);

const router = useRouter();

const step = ref(1);
const error = ref('');
const generating = ref(false);
const applying = ref(false);
const draft = ref(null);
const generationRequestId = ref(null);
const sourceFiles = ref([]);
const sourceFilesInput = ref(null);

const form = ref({
  title: '',
  description: '',
  learningObjectives: '',
  templateId: 'rich-text-quiz',
  notes: '',
  trainingFocusId: null
});

const sourceFileNames = computed(() => sourceFiles.value.map((f) => f.name));

const canAdvance = computed(() => {
  if (step.value === 1) return String(form.value.title || '').trim().length > 0;
  if (step.value === 2) {
    return (
      sourceFiles.value.length > 0 ||
      String(form.value.notes || '').trim().length > 0 ||
      props.kbDocCount > 0
    );
  }
  return false;
});

const pageLabel = (page) => {
  if (page.type === 'intro') return 'Introduction';
  if (page.type === 'document') return page.data?.title || 'Lesson';
  if (page.type === 'quiz') return page.data?.title || 'Quiz';
  return page.type;
};

const sanitizePreview = (html) => {
  const s = String(html || '');
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '');
};

const resetWizard = () => {
  step.value = 1;
  error.value = '';
  draft.value = null;
  generationRequestId.value = null;
  sourceFiles.value = [];
  form.value = {
    title: props.initialTitle || '',
    description: props.initialDescription || '',
    learningObjectives: '',
    templateId: 'rich-text-quiz',
    notes: props.mode === 'append' ? 'Add lesson and quiz pages to the existing module.' : '',
    trainingFocusId: null
  };
  if (sourceFilesInput.value) sourceFilesInput.value.value = '';
};

const prefillFromProps = () => {
  if (props.initialTitle) form.value.title = props.initialTitle;
  if (props.initialDescription) form.value.description = props.initialDescription;
};

const handleClose = () => {
  resetWizard();
  emit('close');
};

const onSourceFilesChange = (e) => {
  sourceFiles.value = Array.from(e.target?.files || []);
};

const advanceStep = async () => {
  if (step.value === 1) {
    step.value = 2;
    return;
  }
  if (step.value === 2) {
    await runGenerate();
  }
};

const runGenerate = async () => {
  if (!props.agencyId) return;
  try {
    generating.value = true;
    error.value = '';
    step.value = 3;
    draft.value = null;

    const fd = new FormData();
    fd.append('agencyId', String(props.agencyId));
    fd.append('title', form.value.title.trim());
    fd.append('description', form.value.description || '');
    fd.append('learningObjectives', form.value.learningObjectives || '');
    fd.append('templateId', form.value.templateId);
    fd.append('notes', form.value.notes || '');
    for (const file of sourceFiles.value) {
      fd.append('files', file, file.name);
    }

    const res = await api.post('/training-builder/generate-module-draft', fd, {
      timeout: 120000
    });
    draft.value = res.data?.draft || null;
    generationRequestId.value = res.data?.generationRequestId || null;
    if (!draft.value) throw new Error('No draft returned');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Generation failed';
    step.value = 2;
  } finally {
    generating.value = false;
  }
};

const updateQuizPage = (idx, quizContent) => {
  if (!draft.value?.pages?.[idx]) return;
  draft.value.pages[idx].data = { ...quizContent };
};

const applyDraft = async () => {
  if (!props.agencyId || !draft.value) return;
  try {
    applying.value = true;
    error.value = '';

    if (props.mode === 'append') {
      emit('append-draft', { draft: draft.value, generationRequestId: generationRequestId.value });
      handleClose();
      return;
    }

    const payload = {
      agencyId: props.agencyId,
      draft: draft.value,
      generationRequestId: generationRequestId.value || undefined,
      trainingFocusId: form.value.trainingFocusId || undefined,
      trackOrderIndex: 0
    };
    const res = await api.post('/training-builder/apply-module-draft', payload);
    const moduleId = res.data?.moduleId;
    emit('applied', { moduleId });
    handleClose();
    if (moduleId) {
      await router.push(`/admin/modules/${moduleId}/content-editor`);
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create module';
  } finally {
    applying.value = false;
  }
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) prefillFromProps();
    else resetWizard();
  }
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2100;
  padding: 16px;
}
.wizard-modal {
  background: var(--surface, #fff);
  border-radius: 12px;
  width: 100%;
  max-width: 720px;
  max-height: 92vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.wizard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.wizard-header h2 {
  margin: 0;
  font-size: 1.2rem;
}
.steps {
  display: flex;
  gap: 16px;
  padding: 12px 20px;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.steps span.active {
  color: var(--primary, #2563eb);
  font-weight: 600;
}
.step-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.preview-step {
  max-height: 50vh;
}
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 0.875rem;
}
.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  box-sizing: border-box;
}
.muted {
  color: var(--text-secondary, #64748b);
  font-size: 0.875rem;
}
.muted.small {
  font-size: 0.8rem;
}
.link-btn {
  background: none;
  border: none;
  color: var(--primary, #2563eb);
  cursor: pointer;
  text-decoration: underline;
  padding: 0 4px;
}
.wizard-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.error-banner {
  margin: 0 20px;
  padding: 10px 12px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  font-size: 0.875rem;
}
.generating {
  text-align: center;
  padding: 32px;
}
.alignment-notes,
.sources-used {
  margin-bottom: 16px;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 8px;
  font-size: 0.875rem;
}
.sources-used ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
.preview-page {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.preview-page h4 {
  margin: 0 0 8px;
}
.doc-preview {
  font-size: 0.9rem;
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
}
.preview-quiz {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}
.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-secondary, #64748b);
}
</style>
