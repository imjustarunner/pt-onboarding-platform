<template>
  <div v-if="show" class="modal-overlay" @click.self="handleClose">
    <div class="modal-content xlarge">
      <div class="modal-header">
        <h2>Preview Splash Page</h2>
        <button @click="handleClose" class="btn-close" aria-label="Close">×</button>
      </div>
      
      <div class="modal-body">
        <div class="preview-container" ref="previewContainer">
          <div v-if="loading" class="loading">Loading preview...</div>
          <div v-else class="preview-content">
            <SplashPagePreview 
              :organization-slug="organizationSlug"
              :organization-id="organizationId"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import SplashPagePreview from './preview/SplashPagePreview.vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  organizationSlug: {
    type: String,
    required: true
  },
  organizationId: {
    type: Number,
    default: null
  }
});

const emit = defineEmits(['close']);

const previewContainer = ref(null);
const loading = ref(false);

const handleClose = () => {
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  padding: 20px;
}

.modal-content.xlarge {
  background: white;
  border-radius: 12px;
  max-width: 1400px;
  width: 100%;
  max-height: 95vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 2px solid var(--border);
  background: var(--bg-alt);
}

.modal-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--border);
  color: var(--text-primary);
}

.modal-body {
  flex: 1;
  overflow: auto;
  padding: 0;
}

.preview-container {
  width: 100%;
  height: 100%;
  min-height: 600px;
}

.preview-content {
  width: 100%;
  height: 100%;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: var(--text-secondary);
  font-size: 16px;
}

/* Ensure the preview content is properly contained */
.preview-content :deep(.school-splash) {
  min-height: auto;
  padding: 40px 20px;
  background: var(--bg-alt);
}

.preview-content :deep(.splash-container) {
  max-width: 1200px;
  margin: 0 auto;
}
</style>
