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
      
      <div class="content-container">
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

const currentContent = computed(() => content.value[currentContentIndex.value]);

const needsSignature = computed(() => {
  return content.value.some(item => item.content_data?.requiresSignature);
});

const needsAcknowledgment = computed(() => {
  return content.value.some(item => item.content_type === 'acknowledgment');
});

const canComplete = computed(() => {
  if (progress.value?.status === 'completed') return false;
  const allContentViewed = currentContentIndex.value === content.value.length - 1;
  const hasSignature = !needsSignature.value || signatureSaved.value;
  const hasAcknowledgment = !needsAcknowledgment.value || acknowledgmentSaved.value;
  return allContentViewed && hasSignature && hasAcknowledgment;
});

const hasQuiz = computed(() => {
  return content.value.some(item => item.content_type === 'quiz');
});

const isCompleted = computed(() => progress.value?.status === 'completed');

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
      
      // Start module if not started (but not if already completed)
      if (!progress.value || progress.value.status === 'not_started') {
        // Don't restart if already completed
        if (progress.value?.status !== 'completed') {
          try {
            await api.post('/progress/start', { moduleId: parseInt(moduleId) });
            progress.value = { status: 'in_progress', module_id: parseInt(moduleId) };
          } catch (e) {
            // Ignore errors starting progress in preview
          }
        }
      }
      
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
    }
  } catch (err) {
    console.error('Failed to load module:', err);
    error.value = err.response?.data?.error?.message || 'Failed to load module';
  } finally {
    loading.value = false;
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
    text: '📄'
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

@media (max-width: 768px) {
  .content-container {
    grid-template-columns: 1fr;
  }
  
  .content-sidebar {
    position: static;
  }
}
</style>

