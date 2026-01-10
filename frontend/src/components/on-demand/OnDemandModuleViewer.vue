<template>
  <div class="container">
    <div class="module-viewer">
      <div class="module-header">
        <button @click="$router.back()" class="btn btn-secondary">← Back</button>
        <h1>{{ module?.title }}</h1>
        <button @click="generateCertificate" class="btn btn-primary" :disabled="generatingCert">
          {{ generatingCert ? 'Generating...' : 'Print Certificate' }}
        </button>
      </div>

      <div v-if="loading" class="loading">Loading module...</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else-if="module" class="module-content">
        <div v-if="module.description" class="module-description">
          {{ module.description }}
        </div>

        <div v-for="(content, index) in module.content" :key="content.id" class="content-item">
          <!-- Video Content -->
          <div v-if="content.content_type === 'video'" class="video-content">
            <h3>Video: {{ getContentTitle(content) }}</h3>
            <div v-if="getVideoUrl(content)" class="video-container">
              <iframe
                :src="getVideoUrl(content)"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                class="video-iframe"
              ></iframe>
            </div>
          </div>

          <!-- Slide Content -->
          <div v-else-if="content.content_type === 'slide'" class="slide-content">
            <h3>Slide: {{ getContentTitle(content) }}</h3>
            <div class="slide-content-text" v-html="getSlideContent(content)"></div>
          </div>

          <!-- Text Content -->
          <div v-else-if="content.content_type === 'text'" class="text-content">
            <h3>{{ getContentTitle(content) }}</h3>
            <div class="text-content-body" v-html="getTextContent(content)"></div>
          </div>

          <!-- Quiz Content (read-only) -->
          <div v-else-if="content.content_type === 'quiz'" class="quiz-content">
            <h3>Quiz: {{ getContentTitle(content) }}</h3>
            <p class="quiz-note">Note: Quiz results are not saved for on-demand training. This is for viewing only.</p>
            <div v-if="getQuizQuestions(content)" class="quiz-questions">
              <div
                v-for="(question, qIndex) in getQuizQuestions(content)"
                :key="qIndex"
                class="question-item"
              >
                <p class="question-text">{{ question.question }}</p>
                <ul class="answer-options">
                  <li v-for="(option, oIndex) in question.options" :key="oIndex">
                    {{ option }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Acknowledgment (read-only) -->
          <div v-else-if="content.content_type === 'acknowledgment'" class="acknowledgment-content">
            <h3>Acknowledgment: {{ getContentTitle(content) }}</h3>
            <div class="acknowledgment-text" v-html="getAcknowledgmentContent(content)"></div>
            <p class="acknowledgment-note">Note: Acknowledgments are not saved for on-demand training.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const module = ref(null);
const loading = ref(true);
const error = ref('');
const generatingCert = ref(false);

const fetchModule = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/on-demand-training/modules/${route.params.id}`);
    module.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load module';
  } finally {
    loading.value = false;
  }
};

const generateCertificate = async () => {
  try {
    generatingCert.value = true;
    const response = await api.post('/certificates/generate', {
      certificateType: 'module',
      referenceId: module.value.id
    });
    
    // Download the certificate
    const certResponse = await api.get(`/certificates/${response.data.id}/download`, {
      responseType: 'blob'
    });
    
    const blob = new Blob([certResponse.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `certificate-${response.data.certificate_number}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to generate certificate';
  } finally {
    generatingCert.value = false;
  }
};

const getContentTitle = (content) => {
  const data = typeof content.content_data === 'string' 
    ? JSON.parse(content.content_data) 
    : content.content_data;
  return data?.title || 'Untitled';
};

const getVideoUrl = (content) => {
  const data = typeof content.content_data === 'string' 
    ? JSON.parse(content.content_data) 
    : content.content_data;
  return data?.url || null;
};

const getSlideContent = (content) => {
  const data = typeof content.content_data === 'string' 
    ? JSON.parse(content.content_data) 
    : content.content_data;
  return data?.content || '';
};

const getTextContent = (content) => {
  const data = typeof content.content_data === 'string' 
    ? JSON.parse(content.content_data) 
    : content.content_data;
  return data?.content || '';
};

const getQuizQuestions = (content) => {
  const data = typeof content.content_data === 'string' 
    ? JSON.parse(content.content_data) 
    : content.content_data;
  return data?.questions || [];
};

const getAcknowledgmentContent = (content) => {
  const data = typeof content.content_data === 'string' 
    ? JSON.parse(content.content_data) 
    : content.content_data;
  return data?.text || '';
};

onMounted(() => {
  fetchModule();
});
</script>

<style scoped>
.module-viewer {
  max-width: 1200px;
  margin: 0 auto;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  gap: 16px;
}

.module-header h1 {
  flex: 1;
  margin: 0;
  color: var(--text-primary);
}

.module-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
}

.module-description {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.6;
}

.content-item {
  margin-bottom: 48px;
}

.content-item:last-child {
  margin-bottom: 0;
}

.content-item h3 {
  margin-bottom: 16px;
  color: var(--text-primary);
  font-size: 20px;
}

.video-container {
  position: relative;
  padding-bottom: 56.25%; /* 16:9 aspect ratio */
  height: 0;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: var(--shadow);
}

.video-iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.slide-content-text,
.text-content-body,
.acknowledgment-text {
  padding: 24px;
  background: var(--bg-alt);
  border-radius: 8px;
  line-height: 1.8;
}

.quiz-note,
.acknowledgment-note {
  padding: 12px;
  background: #fff3cd;
  border-left: 4px solid #ffc107;
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #856404;
}

.quiz-questions {
  margin-top: 16px;
}

.question-item {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.question-text {
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.answer-options {
  list-style: none;
  padding: 0;
  margin: 0;
}

.answer-options li {
  padding: 8px 0;
  color: var(--text-secondary);
}
</style>

