<template>
  <div class="container">
    <div v-if="loading" class="loading">Loading module...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else-if="module">
      <div class="module-header">
        <button v-if="!route.query.preview" @click="$router.push(getDashboardRoute())" class="btn btn-secondary">← Back to Dashboard</button>
        <div v-else class="preview-banner">
          <span class="preview-badge">👁️ Preview Mode</span>
        </div>
        <h1>{{ module.title }}</h1>
        <p class="module-description">{{ module.description }}</p>
      </div>

      <!-- Start splash (only for real user sessions, not preview, and not completed) -->
      <div v-if="!route.query.preview && !hasStarted && !isCompleted" class="module-start-splash">
        <div class="splash-card">
          <h2>Start Module</h2>
          <p class="splash-subtitle">
            When you click Start, your timer begins. You can leave and come back—your time will be saved.
          </p>
          <div class="splash-actions">
            <button class="btn btn-primary btn-lg" @click="startModule" :disabled="starting">
              {{ starting ? 'Starting...' : 'Start' }}
            </button>
            <button class="btn btn-secondary" @click="$router.push(getDashboardRoute())" :disabled="starting">
              Back to Dashboard
            </button>
          </div>
        </div>
        <PoweredByFooter />
      </div>
      
      <div v-else class="content-container">
        <div class="content-sidebar">
          <h3>Content</h3>
          <ul class="content-list">
            <li
              v-for="(item, index) in content"
              :key="item.id"
              :class="['content-item', { active: currentContentIndex === index }]"
              @click="setCurrentContent(index)"
            >
              <span class="content-icon">{{ getContentIcon(item.content_type) }}</span>
              <span>{{ getContentTitle(item) }}</span>
            </li>
          </ul>
        </div>
        
        <div class="content-main">
          <TimeTracker
            v-if="currentContent && !route.query.preview"
            :module-id="module.id"
            :enabled="hasStarted"
            @time-update="handleTimeUpdate"
          />
          
          <div v-if="currentContent" class="content-viewer">
            <VideoPlayer
              v-if="currentContent.content_type === 'video'"
              :content="currentContent.content_data"
            />
            <SlideViewer
              v-else-if="currentContent.content_type === 'slide'"
              :content="currentContent.content_data"
            />
            <!-- Custom Form (User Info) -->
            <div v-else-if="currentContent.content_type === 'form'" class="form-content-viewer">
              <h2 style="margin-top: 0;">
                {{ currentContent.content_data?.categoryKey ? `Form: ${currentContent.content_data.categoryKey}` : 'Form' }}
              </h2>

              <div v-if="!formDefinition" class="loading" style="margin: 12px 0;">
                Loading form…
              </div>

              <div v-else>
                <div v-if="formPageError" class="error" style="margin-bottom: 12px;">
                  {{ formPageError }}
                </div>

                <div v-if="currentFormFields.length === 0" class="empty-state" style="padding: 16px;">
                  <p style="margin: 0;">No fields configured for this form page.</p>
                </div>

                <div v-else class="form-fields">
                  <div v-for="field in currentFormFields" :key="field.id" class="form-field">
                    <label class="form-label">
                      {{ field.field_label }}
                      <span v-if="isFieldRequiredForModule(field.id)" class="required-indicator">*</span>
                    </label>

                    <input
                      v-if="['text','email','phone'].includes(field.field_type)"
                      v-model="formValues[field.id]"
                      :type="field.field_type === 'email' ? 'email' : (field.field_type === 'phone' ? 'tel' : 'text')"
                      class="form-input"
                    />

                    <input
                      v-else-if="field.field_type === 'number'"
                      v-model="formValues[field.id]"
                      type="number"
                      class="form-input"
                    />

                    <input
                      v-else-if="field.field_type === 'date'"
                      v-model="formValues[field.id]"
                      type="date"
                      class="form-input"
                    />

                    <textarea
                      v-else-if="field.field_type === 'textarea'"
                      v-model="formValues[field.id]"
                      rows="5"
                      class="form-textarea"
                    ></textarea>

                    <select
                      v-else-if="field.field_type === 'select'"
                      v-model="formValues[field.id]"
                      class="form-input"
                    >
                      <option value="">Select…</option>
                      <option v-for="opt in (field.options || [])" :key="String(opt)" :value="opt">
                        {{ opt }}
                      </option>
                    </select>

                    <div v-else-if="field.field_type === 'multi_select'" class="multi-select">
                      <div v-if="(field.options || []).length === 0" style="color: var(--text-secondary); font-size: 13px;">
                        No options configured.
                      </div>
                      <label
                        v-for="opt in (field.options || [])"
                        :key="String(opt)"
                        class="multi-select-option"
                      >
                        <input
                          type="checkbox"
                          :checked="Array.isArray(formValues[field.id]) && formValues[field.id].includes(opt)"
                          @change="toggleMultiSelectValue(field.id, opt)"
                        />
                        <span>{{ opt }}</span>
                      </label>
                    </div>

                    <label v-else-if="field.field_type === 'boolean'" class="boolean-row">
                      <input v-model="formValues[field.id]" type="checkbox" />
                      <span>Yes</span>
                    </label>

                    <input
                      v-else
                      v-model="formValues[field.id]"
                      type="text"
                      class="form-input"
                    />
                  </div>
                </div>

                <div class="form-actions">
                  <button class="btn btn-primary" :disabled="formSaving" @click="saveCurrentFormPage(false)">
                    {{ formSaving ? 'Saving…' : 'Save' }}
                  </button>
                  <span v-if="formSaveMessage" class="form-save-message">{{ formSaveMessage }}</span>
                </div>
              </div>
            </div>
            <!-- Text Content (Documents, Rich Text, Intro, Response) -->
            <div v-else-if="currentContent.content_type === 'text'" class="text-content-viewer">
              <!-- Intro Screen (has title/description, no fileUrl, no content, no prompt) -->
              <div v-if="currentContent.content_data?.title && !currentContent.content_data?.fileUrl && !currentContent.content_data?.content && !currentContent.content_data?.prompt" class="intro-screen">
                <h2>{{ currentContent.content_data.title }}</h2>
                <div v-if="currentContent.content_data.description" class="intro-description" v-html="formatDescription(currentContent.content_data.description)"></div>
              </div>
              <!-- Response Page (has prompt) -->
              <div v-else-if="currentContent.content_data?.prompt" class="response-page">
                <h3>{{ currentContent.content_data.prompt }}</h3>
                <div class="response-input">
                  <textarea
                    v-if="currentContent.content_data.responseType === 'textarea'"
                    v-model="responseAnswers[currentContentIndex]"
                    rows="6"
                    placeholder="Enter your response here..."
                    class="response-textarea"
                  ></textarea>
                  <input
                    v-else
                    v-model="responseAnswers[currentContentIndex]"
                    type="text"
                    placeholder="Enter your response here..."
                    class="response-input-field"
                  />
                </div>
                <button @click="saveResponse(currentContentIndex)" class="btn btn-primary" style="margin-top: 16px;">
                  Save Response
                </button>
              </div>
              <!-- Document (has fileUrl) -->
              <div v-else-if="currentContent.content_data?.fileUrl" class="document-viewer">
                <h3 v-if="currentContent.content_data?.title">{{ currentContent.content_data.title }}</h3>
                <p v-if="currentContent.content_data?.description">{{ currentContent.content_data.description }}</p>
                <!-- Google Workspace Embed -->
                <iframe
                  v-if="isGoogleWorkspace(currentContent.content_data.fileUrl)"
                  :src="currentContent.content_data.fileUrl"
                  frameborder="0"
                  style="width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 8px;"
                  allow="fullscreen"
                />
                <!-- PDF -->
                <iframe
                  v-else-if="isPdf(currentContent.content_data.fileUrl)"
                  :src="currentContent.content_data.fileUrl"
                  frameborder="0"
                  style="width: 100%; height: 500px; border: 1px solid #ddd; border-radius: 8px;"
                />
                <!-- Image -->
                <img
                  v-else-if="isImage(currentContent.content_data.fileUrl)"
                  :src="currentContent.content_data.fileUrl"
                  alt="Document"
                  style="max-width: 100%; border-radius: 8px;"
                />
                <!-- Fallback Link -->
                <a
                  v-else
                  :href="currentContent.content_data.fileUrl"
                  target="_blank"
                  class="btn btn-primary"
                >
                  Open Document
                </a>
              </div>
              <!-- Rich Text (has content) -->
              <div v-else-if="currentContent.content_data?.content" class="rich-text-viewer" v-html="currentContent.content_data.content"></div>
              <!-- Google Form (has formUrl) -->
              <div v-else-if="currentContent.content_data?.formUrl" class="google-form-viewer">
                <h3 v-if="currentContent.content_data?.title">{{ currentContent.content_data.title }}</h3>
                <iframe
                  :src="currentContent.content_data.formUrl"
                  frameborder="0"
                  style="width: 100%; height: 800px; border: 1px solid #ddd; border-radius: 8px;"
                ></iframe>
              </div>
            </div>
                <QuizForm
                  v-else-if="currentContent.content_type === 'quiz'"
                  :module-id="module.id"
                  :content="currentContent.content_data"
                  @quiz-completed="handleQuizCompleted"
                  :disabled="isCompleted"
                />
            <AcknowledgmentForm
              v-else-if="currentContent.content_type === 'acknowledgment'"
              :module-id="module.id"
              :content="currentContent.content_data"
              @acknowledged="handleAcknowledged"
            />
          </div>
          
              <div class="content-navigation" v-if="!isCompleted">
                <button
                  @click="previousContent"
                  :disabled="currentContentIndex === 0"
                  class="btn btn-secondary"
                >
                  Previous
                </button>
                <button
                  @click="nextContent"
                  :disabled="currentContentIndex === content.length - 1"
                  class="btn btn-primary"
                >
                  Next
                </button>
              </div>
              <div v-else class="completed-notice">
                <p>This module has been completed. You cannot navigate through it again.</p>
              </div>
          
          <div v-if="needsSignature && !route.query.preview" class="signature-section">
            <h3>Digital Signature</h3>
            <SignaturePad
              :module-id="module.id"
              @signed="handleSigned"
            />
          </div>
          
          <div v-if="!route.query.preview" class="completion-section">
            <button
              v-if="canComplete"
              @click="completeModule"
              class="btn btn-success"
              :disabled="completing"
            >
              {{ completing ? 'Completing...' : 'Mark as Complete' }}
            </button>
            <div v-if="isCompleted" class="success">
              <div class="completion-message">
                <h3>✓ Module completed successfully!</h3>
                <div v-if="quizResults" class="quiz-results">
                  <p class="quiz-score">
                    Quiz Score: {{ quizResults.correctCount }}/{{ quizResults.totalQuestions }} questions correct 
                    ({{ quizResults.score }}%)
                  </p>
                  <p :class="['quiz-status', quizResults.passed ? 'passed' : 'failed']">
                    {{ quizResults.passed ? '✓ Passed' : '✗ Failed' }} 
                    <span v-if="quizResults.minimumScore">(Minimum: {{ quizResults.minimumScore }}%)</span>
                  </p>
                </div>
                <div v-if="progress?.completed_at" class="completion-date">
                  Completed: {{ formatDate(progress.completed_at) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import VideoPlayer from '../components/VideoPlayer.vue';
import SlideViewer from '../components/SlideViewer.vue';
import QuizForm from '../components/QuizForm.vue';
import SignaturePad from '../components/SignaturePad.vue';
import TimeTracker from '../components/TimeTracker.vue';
import AcknowledgmentForm from '../components/AcknowledgmentForm.vue';
import PoweredByFooter from '../components/PoweredByFooter.vue';
import { getDashboardRoute } from '../utils/router';

const route = useRoute();
const router = useRouter();

const module = ref(null);
const content = ref([]);
const currentContentIndex = ref(0);
const loading = ref(true);
const error = ref('');
const completing = ref(false);
const progress = ref(null);
const signatureSaved = ref(false);
const acknowledgmentSaved = ref(false);
const responseAnswers = ref({});
const quizResults = ref(null);
const hasStarted = ref(false);
const starting = ref(false);

// Form-module runtime
const formDefinition = ref(null); // { pages, fields }
const formValues = ref({}); // { [fieldDefinitionId]: value }
const formSaving = ref(false);
const formSaveMessage = ref('');
const formPageError = ref('');

const currentContent = computed(() => content.value[currentContentIndex.value]);

const hasForm = computed(() => {
  return content.value.some((item) => item.content_type === 'form');
});

const formFieldMap = computed(() => {
  const fields = formDefinition.value?.fields || [];
  return new Map(fields.map((f) => [f.id, f]));
});

const currentFormFieldIds = computed(() => {
  if (currentContent.value?.content_type !== 'form') return [];
  const ids = currentContent.value?.content_data?.fieldDefinitionIds;
  return Array.isArray(ids) ? ids : [];
});

const currentFormFields = computed(() => {
  return currentFormFieldIds.value
    .map((id) => formFieldMap.value.get(id))
    .filter(Boolean);
});

const needsSignature = computed(() => {
  return content.value.some(item => item.content_data?.requiresSignature);
});

const needsAcknowledgment = computed(() => {
  return content.value.some(item => item.content_type === 'acknowledgment');
});

const isFieldRequiredForModule = (fieldId) => {
  if (!formDefinition.value) return false;
  const pages = formDefinition.value.pages || [];
  const defs = formFieldMap.value;
  for (const p of pages) {
    const ids = Array.isArray(p.fieldDefinitionIds) ? p.fieldDefinitionIds : [];
    if (!ids.includes(fieldId)) continue;
    if (p.requireAll === true) return true;
    const def = defs.get(fieldId);
    if (def && (def.is_required === 1 || def.is_required === true)) return true;
  }
  return false;
};

const isMissingFormValue = (val) => {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  // boolean false is valid
  return false;
};

const formsComplete = computed(() => {
  if (!hasForm.value) return true;
  if (!formDefinition.value) return false;
  const pages = formDefinition.value.pages || [];
  const defs = formFieldMap.value;

  const requiredIds = new Set();
  for (const p of pages) {
    const ids = Array.isArray(p.fieldDefinitionIds) ? p.fieldDefinitionIds : [];
    if (p.requireAll === true) {
      ids.forEach((id) => requiredIds.add(id));
    } else {
      ids.forEach((id) => {
        const def = defs.get(id);
        if (def && (def.is_required === 1 || def.is_required === true)) {
          requiredIds.add(id);
        }
      });
    }
  }

  for (const id of requiredIds) {
    if (isMissingFormValue(formValues.value[id])) return false;
  }
  return true;
});

const canComplete = computed(() => {
  if (progress.value?.status === 'completed') return false;
  const allContentViewed = currentContentIndex.value === content.value.length - 1;
  const hasSignature = !needsSignature.value || signatureSaved.value;
  const hasAcknowledgment = !needsAcknowledgment.value || acknowledgmentSaved.value;
  const hasValidForms = !hasForm.value || formsComplete.value;
  return allContentViewed && hasSignature && hasAcknowledgment && hasValidForms;
});

const hasQuiz = computed(() => {
  return content.value.some(item => item.content_type === 'quiz');
});

const isCompleted = computed(() => progress.value?.status === 'completed');

const normalizeBoolean = (v) => {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return null;
};

const fetchFormDefinition = async (moduleId) => {
  try {
    const res = await api.get(`/modules/${moduleId}/form-definition`);
    formDefinition.value = res.data;

    const nextValues = { ...(formValues.value || {}) };
    const fields = res.data?.fields || [];
    fields.forEach((f) => {
      if (f.field_type === 'boolean') {
        const b = normalizeBoolean(f.value);
        nextValues[f.id] = b === null ? false : b;
      } else if (f.field_type === 'multi_select') {
        if (Array.isArray(f.value)) {
          nextValues[f.id] = f.value;
        } else if (typeof f.value === 'string' && f.value.trim()) {
          try {
            const parsed = JSON.parse(f.value);
            nextValues[f.id] = Array.isArray(parsed) ? parsed : [];
          } catch {
            // fall back: comma-separated
            nextValues[f.id] = f.value.split(',').map((s) => s.trim()).filter(Boolean);
          }
        } else {
          nextValues[f.id] = [];
        }
      } else {
        nextValues[f.id] = f.value ?? '';
      }
    });
    formValues.value = nextValues;
  } catch (err) {
    console.error('Failed to load form definition:', err);
    formDefinition.value = null;
  }
};

const toggleMultiSelectValue = (fieldId, option) => {
  const current = Array.isArray(formValues.value[fieldId]) ? formValues.value[fieldId] : [];
  const exists = current.includes(option);
  const next = exists ? current.filter((x) => x !== option) : [...current, option];
  formValues.value = { ...formValues.value, [fieldId]: next };
};

const fetchModule = async () => {
  try {
    loading.value = true;
    const moduleId = route.params.id;
    const isPreview = route.query.preview === 'true';
    
    const [moduleRes, contentRes] = await Promise.all([
      api.get(`/modules/${moduleId}`),
      api.get(`/modules/${moduleId}/content`)
    ]);
    
    module.value = moduleRes.data;
    content.value = contentRes.data;
    
    // Initialize response answers
    responseAnswers.value = {};
    content.value.forEach((item, index) => {
      if (item.content_type === 'text' && item.content_data?.prompt) {
        responseAnswers.value[index] = '';
      }
    });

    if (content.value.some((i) => i.content_type === 'form')) {
      await fetchFormDefinition(moduleId);
    }
    
    // Skip progress tracking and other user-specific operations in preview mode
    if (!isPreview) {
      // Fetch progress
      try {
        const progressRes = await api.get('/progress');
        progress.value = progressRes.data.find(p => p.module_id === parseInt(moduleId)) || null;
        
        // If module is completed, fetch quiz results
        if (progress.value?.status === 'completed') {
          await fetchQuizResults();
        }
      } catch (e) {
        progress.value = null;
      }

      // Only consider the module "started" once progress is in_progress (or completed).
      // We intentionally do NOT auto-start on page load; user must click Start.
      hasStarted.value = progress.value?.status === 'in_progress' || progress.value?.status === 'completed';
      
      // Check for existing signature
      try {
        await api.get(`/signatures/${moduleId}`);
        signatureSaved.value = true;
      } catch (e) {
        // No signature yet
      }
      
      // Check for existing acknowledgment
      try {
        const ackResponse = await api.get(`/acknowledgments/${moduleId}`);
        if (ackResponse.data.acknowledged) {
          acknowledgmentSaved.value = true;
        }
      } catch (e) {
        // No acknowledgment yet
      }
    } else {
      // Preview mode - set defaults
      progress.value = null;
      signatureSaved.value = false;
      acknowledgmentSaved.value = false;
      hasStarted.value = false;
    }
  } catch (err) {
    console.error('Failed to load module:', err);
    error.value = err.response?.data?.error?.message || 'Failed to load module';
  } finally {
    loading.value = false;
  }
};

const startModule = async () => {
  try {
    starting.value = true;
    error.value = '';
    const moduleId = parseInt(route.params.id);
    await api.post('/progress/start', { moduleId });
    progress.value = { ...(progress.value || {}), status: 'in_progress', module_id: moduleId };
    hasStarted.value = true;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to start module';
  } finally {
    starting.value = false;
  }
};

const setCurrentContent = (index) => {
  currentContentIndex.value = index;
};

const nextContent = () => {
  if (currentContentIndex.value < content.value.length - 1) {
    currentContentIndex.value++;
  }
};

const previousContent = () => {
  if (currentContentIndex.value > 0) {
    currentContentIndex.value--;
  }
};

const handleTimeUpdate = (durationMinutes) => {
  // Time is logged by TimeTracker component
};

const handleQuizCompleted = async (quizData) => {
  // Quiz completion handled by QuizForm
  // Store quiz results for display
  if (quizData) {
    quizResults.value = quizData;
  }
};

const fetchQuizResults = async () => {
  try {
    const moduleId = route.params.id;
    // Find quiz content
    const quizContent = content.value.find(item => item.content_type === 'quiz');
    if (!quizContent) return;
    
    // Get quiz attempts
    const attemptsRes = await api.get(`/quizzes/${moduleId}/attempts`);
    if (attemptsRes.data && attemptsRes.data.length > 0) {
      const latestAttempt = attemptsRes.data[0]; // Already sorted by date desc
      const quizData = typeof quizContent.content_data === 'string' 
        ? JSON.parse(quizContent.content_data) 
        : quizContent.content_data;
      
      const totalQuestions = quizData.questions?.length || 0;
      const score = latestAttempt.score || 0;
      const correctCount = Math.round((score / 100) * totalQuestions);
      const minimumScore = quizData.minimumScore || 70;
      const passed = score >= minimumScore;
      
      quizResults.value = {
        score,
        correctCount,
        totalQuestions,
        passed,
        minimumScore,
        completedAt: latestAttempt.completed_at
      };
    }
  } catch (err) {
    console.error('Failed to fetch quiz results:', err);
  }
};

const handleSigned = () => {
  signatureSaved.value = true;
};

const completeModule = async () => {
  // Don't complete module in preview mode
  if (route.query.preview === 'true') {
    return;
  }
  
  // Don't allow completing if already completed
  if (progress.value?.status === 'completed') {
    return;
  }
  
  try {
    completing.value = true;
    error.value = '';

    // If this module contains form pages, save + validate required fields first
    if (hasForm.value) {
      const ok = await saveFormValues(true);
      if (!ok) return;
    }

    await api.post('/progress/complete', { moduleId: module.value.id });
    progress.value = { ...progress.value, status: 'completed' };
    
    // Fetch quiz results after completion
    if (hasQuiz.value) {
      await fetchQuizResults();
    }
    
    // Note: We don't redirect after completion - user stays on module page
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to complete module';
  } finally {
    completing.value = false;
  }
};

const handleAcknowledged = () => {
  acknowledgmentSaved.value = true;
};

const formatDescription = (text) => {
  if (!text) return '';
  // Convert line breaks to <br> tags
  return text.replace(/\n/g, '<br>');
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const saveResponse = async (contentIndex) => {
  const contentItem = content.value[contentIndex];
  if (!contentItem || !responseAnswers.value[contentIndex]) {
    alert('Please enter a response');
    return;
  }
  
  try {
    await api.post(`/modules/${module.value.id}/responses`, {
      contentId: contentItem.id,
      responseText: responseAnswers.value[contentIndex]
    });
    alert('Response saved!');
  } catch (err) {
    console.error('Failed to save response:', err);
    alert('Failed to save response');
  }
};

async function saveFormValues(validate) {
  if (!module.value?.id) return false;
  if (!formDefinition.value) return false;

  formPageError.value = '';
  formSaveMessage.value = '';

  const moduleId = module.value.id;
  const fieldIds = validate
    ? (formDefinition.value.fields || []).map((f) => f.id)
    : currentFormFieldIds.value;

  const values = fieldIds.map((id) => ({
    fieldDefinitionId: id,
    value: Array.isArray(formValues.value[id])
      ? JSON.stringify(formValues.value[id])
      : (typeof formValues.value[id] === 'boolean' ? (formValues.value[id] ? 'true' : 'false') : formValues.value[id])
  }));

  try {
    formSaving.value = true;
    const suffix = validate ? '?validate=true' : '';
    await api.post(`/modules/${moduleId}/form-submit${suffix}`, { values });
    formSaveMessage.value = validate ? 'Validated' : 'Saved';
    return true;
  } catch (err) {
    const msg = err?.response?.data?.error?.message || 'Failed to save form';
    formPageError.value = msg;
    if (err?.response?.data?.error?.missingFields?.length) {
      const missing = err.response.data.error.missingFields.map((f) => f.field_label).join(', ');
      formPageError.value = `Please complete: ${missing}`;
    }
    return false;
  } finally {
    formSaving.value = false;
  }
}

async function saveCurrentFormPage(validate) {
  return await saveFormValues(validate);
}

const isGoogleWorkspace = (url) => {
  if (!url) return false;
  return url.includes('docs.google.com') || url.includes('drive.google.com');
};

const isPdf = (url) => {
  return url?.toLowerCase().endsWith('.pdf') && !isGoogleWorkspace(url);
};

const isImage = (url) => {
  const u = url?.toLowerCase() || '';
  return (u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png')) && !isGoogleWorkspace(url);
};

const getContentIcon = (type) => {
  const icons = {
    video: '🎥',
    slide: '📊',
    quiz: '❓',
    acknowledgment: '✓',
    text: '📄',
    form: '🧩'
  };
  return icons[type] || '📝';
};

const getContentTitle = (item) => {
  if (item.content_data?.title) return item.content_data.title;
  return `${item.content_type.charAt(0).toUpperCase() + item.content_type.slice(1)} ${item.order_index + 1}`;
};

onMounted(() => {
  fetchModule();
});
</script>

<style scoped>
.module-header {
  margin-bottom: 30px;
}

.module-header h1 {
  margin: 20px 0 10px;
  color: var(--text-primary);
  font-weight: 700;
}

.module-description {
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1.7;
}

.module-start-splash {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  min-height: 55vh;
}

.splash-card {
  background: white;
  border-radius: 12px;
  padding: 28px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.splash-card h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.splash-subtitle {
  margin: 0 0 20px 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

.splash-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.btn-lg {
  padding: 12px 18px;
  font-weight: 700;
}

.content-container {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 30px;
  margin-top: 30px;
}

.content-sidebar {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  height: fit-content;
  position: sticky;
  top: 20px;
  border: 1px solid var(--border);
}

.content-sidebar h3 {
  margin-bottom: 15px;
  color: #2c3e50;
}

.content-list {
  list-style: none;
  padding: 0;
}

.content-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.content-item:hover {
  background-color: #f8f9fa;
}

.content-item.active {
  background-color: #e3f2fd;
  font-weight: 600;
}

.content-icon {
  font-size: 20px;
}

.content-main {
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.content-viewer {
  min-height: 400px;
  margin-bottom: 30px;
}

.content-navigation {
  display: flex;
  justify-content: space-between;
  margin-bottom: 30px;
  padding-top: 20px;
  border-top: 1px solid #ecf0f1;
}

.signature-section {
  margin-bottom: 30px;
  padding-top: 20px;
  border-top: 1px solid #ecf0f1;
}

.signature-section h3 {
  margin-bottom: 15px;
  color: #2c3e50;
}

.completion-section {
  padding-top: 20px;
  border-top: 1px solid #ecf0f1;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.intro-screen {
  text-align: center;
  padding: 40px 20px;
}

.intro-screen h2 {
  font-size: 32px;
  color: #2c3e50;
  margin-bottom: 20px;
}

.intro-description {
  font-size: 18px;
  line-height: 1.8;
  color: #495057;
  max-width: 800px;
  margin: 0 auto;
}

.response-page {
  padding: 20px;
}

.response-page h3 {
  font-size: 24px;
  color: #2c3e50;
  margin-bottom: 20px;
}

.response-input {
  margin-bottom: 16px;
}

.response-textarea,
.response-input-field {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  font-family: inherit;
}

.response-textarea {
  resize: vertical;
  min-height: 150px;
}

.google-form-viewer h3 {
  margin-bottom: 16px;
  color: #2c3e50;
}

.preview-banner {
  margin-bottom: 16px;
}

.preview-badge {
  display: inline-block;
  padding: 8px 16px;
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffc107;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
}

.completion-message {
  padding: 16px;
  background: #f0fdf4;
  border: 2px solid #22c55e;
  border-radius: 8px;
}

.completion-message h3 {
  margin: 0 0 12px 0;
  color: #22c55e;
  font-size: 18px;
}

.quiz-results {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #d1fae5;
}

.quiz-score {
  margin: 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.quiz-status {
  margin: 8px 0;
  font-size: 14px;
  font-weight: 600;
}

.quiz-status.passed {
  color: #22c55e;
}

.quiz-status.failed {
  color: #dc2626;
}

.completion-date {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #d1fae5;
  font-size: 14px;
  color: #6b7280;
}

.completed-notice {
  padding: 16px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  text-align: center;
  color: #6b7280;
  margin: 20px 0;
}

.quiz-disabled {
  padding: 24px;
  text-align: center;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  color: #6b7280;
}

.form-content-viewer {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-weight: 700;
  color: var(--text-primary);
}

.required-indicator {
  color: #dc3545;
  margin-left: 4px;
}

.form-input,
.form-textarea {
  width: 100%;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}

.form-textarea {
  resize: vertical;
}

.boolean-row {
  display: flex;
  align-items: center;
  gap: 10px;
  user-select: none;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.form-save-message {
  color: #16a34a;
  font-weight: 600;
}

.multi-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: #fafbfc;
}

.multi-select-option {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .content-container {
    grid-template-columns: 1fr;
  }
  
  .content-sidebar {
    position: static;
  }
}
</style>

