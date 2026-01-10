<template>
  <div class="content-editor">
    <div class="content-list">
      <h3>Content Items</h3>
      <button @click="showAddModal = true" class="btn btn-primary">Add Content</button>
      
      <div v-if="loading" class="loading">Loading content...</div>
      <div v-else-if="contentItems.length === 0" class="empty-state">
        <p>No content items yet. Add your first content item.</p>
      </div>
      <div v-else class="content-items">
        <div
          v-for="(item, index) in contentItems"
          :key="item.id"
          class="content-item"
        >
          <div class="content-item-header">
            <span class="content-type-badge">{{ item.content_type }}</span>
            <span class="content-order">Order: {{ item.order_index }}</span>
          </div>
          <div class="content-item-body">
            <h4>{{ getContentTitle(item) }}</h4>
            <p v-if="getContentDescription(item)">{{ getContentDescription(item) }}</p>
          </div>
          <div class="content-item-actions">
            <button @click="editContent(item)" class="btn btn-primary btn-sm">Edit</button>
            <button @click="deleteContent(item.id)" class="btn btn-danger btn-sm">Delete</button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Add/Edit Content Modal -->
    <div v-if="showAddModal || editingContent" class="modal-overlay" @click="closeContentModal">
      <div class="modal-content large" @click.stop>
        <h3>{{ editingContent ? 'Edit Content' : 'Add Content' }}</h3>
        <form @submit.prevent="saveContent">
          <div class="form-group">
            <label>Content Type *</label>
            <select v-model="contentForm.contentType" required @change="resetContentData">
              <option value="">Select type</option>
              <option value="video">Video</option>
              <option value="slide">Slide</option>
              <option value="quiz">Quiz</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Order Index</label>
            <input v-model.number="contentForm.orderIndex" type="number" min="0" />
          </div>
          
          <!-- Video Content -->
          <div v-if="contentForm.contentType === 'video'" class="content-type-form">
            <div class="form-group">
              <label>Video URL *</label>
              <input v-model="contentForm.data.videoUrl" type="url" required />
            </div>
            <div class="form-group">
              <label>Title</label>
              <input v-model="contentForm.data.title" type="text" />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea v-model="contentForm.data.description" rows="3"></textarea>
            </div>
          </div>
          
          <!-- Slide Content -->
          <div v-if="contentForm.contentType === 'slide'" class="content-type-form">
            <div class="form-group">
              <label>Slide Title</label>
              <input v-model="contentForm.data.title" type="text" />
            </div>
            <div class="form-group">
              <label>Slides (HTML content)</label>
              <div v-for="(slide, index) in contentForm.data.slides" :key="index" class="slide-item">
                <label>Slide {{ index + 1 }}</label>
                <textarea v-model="slide.content" rows="5" placeholder="Enter HTML content for this slide"></textarea>
                <button v-if="contentForm.data.slides.length > 1" @click="removeSlide(index)" type="button" class="btn btn-danger btn-sm">Remove</button>
              </div>
              <button @click="addSlide" type="button" class="btn btn-secondary">Add Slide</button>
            </div>
          </div>
          
          <!-- Quiz Content -->
          <div v-if="contentForm.contentType === 'quiz'" class="content-type-form">
            <div class="form-group">
              <label>Quiz Title *</label>
              <input v-model="contentForm.data.title" type="text" required />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea v-model="contentForm.data.description" rows="2"></textarea>
            </div>
            <div class="form-group">
              <label>Minimum Score (%)</label>
              <input v-model.number="contentForm.data.minimumScore" type="number" min="0" max="100" />
            </div>
            <div class="form-group">
              <label>
                <input v-model="contentForm.data.allowRetake" type="checkbox" />
                Allow Retake
              </label>
            </div>
            <div class="form-group">
              <label>Questions</label>
              <div v-for="(question, index) in contentForm.data.questions" :key="index" class="question-item">
                <div class="question-header">
                  <label>Question {{ index + 1 }}</label>
                  <button @click="removeQuestion(index)" type="button" class="btn btn-danger btn-sm">Remove</button>
                </div>
                <input v-model="question.question" type="text" placeholder="Question text" required />
                <select v-model="question.type" required>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True/False</option>
                  <option value="text">Text Answer</option>
                </select>
                <div v-if="question.type === 'multiple_choice'">
                  <label>Options (one per line, first is correct)</label>
                  <textarea v-model="question.optionsText" rows="4" placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
                </div>
                <div v-if="question.type === 'true_false'">
                  <label>Correct Answer</label>
                  <select v-model="question.correctAnswer">
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </div>
                <div v-if="question.type === 'text'">
                  <label>Correct Answer</label>
                  <input v-model="question.correctAnswer" type="text" required />
                </div>
              </div>
              <button @click="addQuestion" type="button" class="btn btn-secondary">Add Question</button>
            </div>
          </div>
          
          <div class="modal-actions">
            <button type="button" @click="closeContentModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  moduleId: {
    type: [String, Number],
    required: true
  }
});

const emit = defineEmits(['close']);

const contentItems = ref([]);
const loading = ref(true);
const showAddModal = ref(false);
const editingContent = ref(null);
const saving = ref(false);

const contentForm = ref({
  contentType: '',
  orderIndex: 0,
  data: {}
});

const fetchContent = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/modules/${props.moduleId}/content`);
    contentItems.value = response.data;
  } catch (err) {
    console.error('Failed to load content:', err);
  } finally {
    loading.value = false;
  }
};

const resetContentData = () => {
  const type = contentForm.value.contentType;
  if (type === 'video') {
    contentForm.value.data = { videoUrl: '', title: '', description: '' };
  } else if (type === 'slide') {
    contentForm.value.data = { slides: [{ content: '' }] };
  } else if (type === 'quiz') {
    contentForm.value.data = {
      title: '',
      description: '',
      minimumScore: 70,
      allowRetake: true,
      questions: []
    };
  }
};

const addSlide = () => {
  contentForm.value.data.slides.push({ content: '' });
};

const removeSlide = (index) => {
  contentForm.value.data.slides.splice(index, 1);
};

const addQuestion = () => {
  contentForm.value.data.questions.push({
    question: '',
    type: 'multiple_choice',
    optionsText: '',
    correctAnswer: ''
  });
};

const removeQuestion = (index) => {
  contentForm.value.data.questions.splice(index, 1);
};

const editContent = (item) => {
  editingContent.value = item;
  contentForm.value = {
    contentType: item.content_type,
    orderIndex: item.order_index,
    data: { ...item.content_data }
  };
  
  // Convert questions options to text for editing
  if (item.content_type === 'quiz' && contentForm.value.data.questions) {
    contentForm.value.data.questions = contentForm.value.data.questions.map(q => ({
      ...q,
      optionsText: q.options ? q.options.join('\n') : ''
    }));
  }
};

const saveContent = async () => {
  try {
    saving.value = true;
    
    // Process form data
    const data = { ...contentForm.value.data };
    
    // Process quiz questions
    if (contentForm.value.contentType === 'quiz') {
      data.questions = data.questions.map(q => {
        const processed = { ...q };
        if (q.type === 'multiple_choice') {
          processed.options = q.optionsText.split('\n').filter(o => o.trim());
          processed.correctAnswer = processed.options[0];
          delete processed.optionsText;
        }
        return processed;
      });
    }
    
    const payload = {
      contentType: contentForm.value.contentType,
      contentData: data,
      orderIndex: contentForm.value.orderIndex
    };
    
    if (editingContent.value) {
      await api.put(`/modules/${props.moduleId}/content/${editingContent.value.id}`, payload);
    } else {
      await api.post(`/modules/${props.moduleId}/content`, payload);
    }
    
    closeContentModal();
    fetchContent();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to save content');
  } finally {
    saving.value = false;
  }
};

const deleteContent = async (contentId) => {
  if (!confirm('Are you sure you want to delete this content item?')) {
    return;
  }
  
  try {
    await api.delete(`/modules/${props.moduleId}/content/${contentId}`);
    fetchContent();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to delete content');
  }
};

const closeContentModal = () => {
  showAddModal.value = false;
  editingContent.value = null;
  contentForm.value = {
    contentType: '',
    orderIndex: 0,
    data: {}
  };
};

const getContentTitle = (item) => {
  if (item.content_data?.title) return item.content_data.title;
  return `${item.content_type.charAt(0).toUpperCase() + item.content_type.slice(1)} ${item.order_index + 1}`;
};

const getContentDescription = (item) => {
  return item.content_data?.description || '';
};

onMounted(() => {
  fetchContent();
});
</script>

<style scoped>
.content-editor {
  width: 100%;
}

.content-list h3 {
  margin-bottom: 15px;
  color: #2c3e50;
}

.content-items {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 20px;
}

.content-item {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 5px;
  border: 1px solid #dee2e6;
}

.content-item-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.content-type-badge {
  background: #007bff;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.content-order {
  color: #7f8c8d;
  font-size: 14px;
}

.content-item-body h4 {
  margin: 0 0 5px;
  color: #2c3e50;
}

.content-item-body p {
  margin: 0;
  color: #7f8c8d;
  font-size: 14px;
}

.content-item-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}

.content-type-form {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #dee2e6;
}

.slide-item {
  margin-bottom: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 5px;
}

.question-item {
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 5px;
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.question-item input,
.question-item select,
.question-item textarea {
  width: 100%;
  margin-bottom: 10px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content.large {
  max-width: 1000px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #dee2e6;
}
</style>

