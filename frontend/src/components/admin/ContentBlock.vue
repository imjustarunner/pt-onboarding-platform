<template>
  <div
    class="content-block"
    :class="{ selected: isSelected }"
    :data-block-id="block.id"
    @click="$emit('select', block)"
  >
    <div class="block-header">
      <div class="block-handle">
        <span class="drag-icon">☰</span>
        <span class="block-order">#{{ index + 1 }}</span>
        <span class="block-type-badge">{{ getTypeLabel(block.content_type) }}</span>
      </div>
      <div class="block-actions">
        <button @click.stop="$emit('duplicate', block)" class="btn-icon" title="Duplicate">
          📋
        </button>
        <button @click.stop="$emit('delete', block.id)" class="btn-icon" title="Delete">
          🗑️
        </button>
      </div>
    </div>

    <div class="block-content">
      <!-- Document Editor -->
      <DocumentViewer
        v-if="block.content_type === 'document'"
        :content="block.content_data"
        @update="handleUpdate"
      />

      <!-- Video Editor -->
      <VideoEmbedder
        v-else-if="block.content_type === 'video'"
        :content="block.content_data"
        @update="handleUpdate"
      />

      <!-- Rich Text Editor -->
      <RichTextEditor
        v-else-if="block.content_type === 'rich-text'"
        :content="block.content_data"
        @update="handleUpdate"
      />

      <!-- Quiz Builder -->
      <QuizBuilder
        v-else-if="block.content_type === 'quiz'"
        :content="block.content_data"
        @update="handleUpdate"
      />

      <!-- Slide Editor -->
      <div v-else-if="block.content_type === 'slide'" class="slide-editor">
        <div class="form-group">
          <label>Slide Title</label>
          <input
            v-model="localData.title"
            type="text"
            @input="handleUpdate"
            placeholder="Enter slide title"
          />
        </div>
        
        <div class="form-group">
          <label>Slide Source</label>
          <select v-model="slideSource" @change="handleSlideSourceChange" class="source-select">
            <option value="google">Google Slides (Recommended)</option>
            <option value="html">HTML Slides</option>
          </select>
        </div>

        <!-- Google Slides -->
        <div v-if="slideSource === 'google'" class="form-group">
          <label>Google Slides Share Link *</label>
          <input
            v-model="googleSlidesUrl"
            type="url"
            @input="handleGoogleSlidesInput"
            placeholder="Paste Google Slides share link"
          />
          <small class="help-text">
            Paste the share link from Google Slides. Make sure the presentation is set to "Anyone with the link can view".
          </small>
          <div v-if="googleSlidesEmbedUrl" class="slide-preview" style="margin-top: 16px;">
            <h4>Preview</h4>
            <iframe
              :src="googleSlidesEmbedUrl"
              frameborder="0"
              style="width: 100%; height: 500px; border: 1px solid #ddd; border-radius: 8px;"
              allow="fullscreen"
            />
          </div>
        </div>

        <!-- HTML Slides -->
        <div v-if="slideSource === 'html'" class="form-group">
          <label>Slides</label>
          <div v-for="(slide, idx) in localData.slides" :key="idx" class="slide-item">
            <label>Slide {{ idx + 1 }}</label>
            <textarea
              v-model="slide.content"
              rows="5"
              @input="handleUpdate"
              placeholder="Enter HTML content for this slide"
            />
            <button
              v-if="localData.slides.length > 1"
              @click="removeSlide(idx)"
              class="btn btn-danger btn-sm"
            >
              Remove
            </button>
          </div>
          <button @click="addSlide" class="btn btn-secondary">Add Slide</button>
        </div>
      </div>

      <!-- Acknowledgment Editor -->
      <div v-else-if="block.content_type === 'acknowledgment'" class="acknowledgment-editor">
        <div class="form-group">
          <label>Title</label>
          <input
            v-model="localData.title"
            type="text"
            @input="handleUpdate"
            placeholder="Enter acknowledgment title"
          />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea
            v-model="localData.description"
            rows="3"
            @input="handleUpdate"
            placeholder="Enter acknowledgment description"
          />
        </div>
        <div class="form-group">
          <label>
            <input
              v-model="localData.requiresSignature"
              type="checkbox"
              @change="handleUpdate"
            />
            Requires Digital Signature
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import DocumentViewer from './DocumentViewer.vue';
import VideoEmbedder from './VideoEmbedder.vue';
import RichTextEditor from './RichTextEditor.vue';
import QuizBuilder from './QuizBuilder.vue';

const props = defineProps({
  block: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  isSelected: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select', 'update', 'delete', 'duplicate']);

const localData = ref({ ...props.block.content_data });
const slideSource = ref('google');
const googleSlidesUrl = ref('');

// Initialize slide source based on content
if (props.block.content_type === 'slide') {
  if (localData.value.googleSlidesUrl || (localData.value.slidesUrl && localData.value.slidesUrl.includes('docs.google.com'))) {
    slideSource.value = 'google';
    googleSlidesUrl.value = localData.value.googleSlidesUrl || localData.value.slidesUrl || '';
  } else {
    slideSource.value = 'html';
    if (!localData.value.slides || localData.value.slides.length === 0) {
      localData.value.slides = [{ content: '' }];
    }
  }
}

const convertGoogleSlidesUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return `https://docs.google.com/presentation/d/${match[1]}/preview`;
  }
  return url;
};

const googleSlidesEmbedUrl = computed(() => {
  if (googleSlidesUrl.value) {
    return convertGoogleSlidesUrl(googleSlidesUrl.value);
  }
  return null;
});

const handleSlideSourceChange = () => {
  if (slideSource.value === 'google') {
    // Clear HTML slides when switching to Google
    localData.value.slides = [];
  } else {
    // Clear Google Slides URL when switching to HTML
    googleSlidesUrl.value = '';
    localData.value.googleSlidesUrl = '';
    localData.value.slidesUrl = '';
    if (!localData.value.slides || localData.value.slides.length === 0) {
      localData.value.slides = [{ content: '' }];
    }
  }
  handleUpdate();
};

const handleGoogleSlidesInput = () => {
  if (googleSlidesUrl.value) {
    localData.value.googleSlidesUrl = googleSlidesUrl.value;
    localData.value.slidesUrl = convertGoogleSlidesUrl(googleSlidesUrl.value);
    handleUpdate();
  }
};

watch(() => props.block.content_data, (newData) => {
  localData.value = { ...newData };
  
  // Update slide source if content changes
  if (props.block.content_type === 'slide') {
    if (localData.value.googleSlidesUrl || (localData.value.slidesUrl && localData.value.slidesUrl.includes('docs.google.com'))) {
      slideSource.value = 'google';
      googleSlidesUrl.value = localData.value.googleSlidesUrl || localData.value.slidesUrl || '';
    } else {
      slideSource.value = 'html';
    }
  }
}, { deep: true });

const handleUpdate = () => {
  emit('update', props.block.id, localData.value);
};

const getTypeLabel = (type) => {
  const labels = {
    'document': 'Document',
    'video': 'Video',
    'rich-text': 'Rich Text',
    'quiz': 'Quiz',
    'slide': 'Slides',
    'acknowledgment': 'Acknowledgment'
  };
  return labels[type] || type;
};

const addSlide = () => {
  if (!localData.value.slides) {
    localData.value.slides = [];
  }
  localData.value.slides.push({ content: '' });
  handleUpdate();
};

const removeSlide = (index) => {
  if (localData.value.slides && localData.value.slides.length > 1) {
    localData.value.slides.splice(index, 1);
    handleUpdate();
  }
};
</script>

<style scoped>
.content-block {
  background: white;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  padding: 20px;
  transition: all 0.2s;
  cursor: pointer;
}

.content-block:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.content-block.selected {
  border-color: #2196f3;
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.2);
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e9ecef;
}

.block-handle {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drag-icon {
  font-size: 18px;
  color: #7f8c8d;
  cursor: grab;
}

.drag-icon:active {
  cursor: grabbing;
}

.block-order {
  font-weight: 600;
  color: #2196f3;
  font-size: 14px;
}

.block-type-badge {
  background: #e3f2fd;
  color: #1976d2;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.block-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: #f5f5f5;
}

.block-content {
  margin-top: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.form-group input[type="text"],
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}

.form-group textarea {
  resize: vertical;
  min-height: 100px;
}

.slide-item {
  margin-bottom: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.acknowledgment-editor {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}
</style>

