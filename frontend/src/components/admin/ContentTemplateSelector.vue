<template>
  <div class="template-selector-overlay">
    <div class="template-selector-modal">
      <div class="modal-header">
        <h2>Choose a Template</h2>
        <p>Select a template to get started, or start from scratch</p>
      </div>
      
      <div class="templates-grid">
        <div
          v-for="template in templates"
          :key="template.id"
          class="template-card"
          @click="selectTemplate(template)"
        >
          <div class="template-icon">{{ getTemplateIcon(template.id) }}</div>
          <h3>{{ template.name }}</h3>
          <p>{{ template.description }}</p>
        </div>
      </div>
      
      <div class="modal-actions">
        <button @click="$emit('skip')" class="btn btn-secondary">
          Start Blank
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { contentTemplates } from '../../config/contentTemplates';

const emit = defineEmits(['template-selected', 'skip']);

const templates = contentTemplates;

const selectTemplate = (template) => {
  emit('template-selected', template);
};

const getTemplateIcon = (id) => {
  const icons = {
    'document-quiz': '📄❓',
    'video-quiz': '🎥❓',
    'rich-text-quiz': '📝❓',
    'sequential': '📋',
    'blank': '📄'
  };
  return icons[id] || '📄';
};
</script>

<style scoped>
.template-selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.template-selector-modal {
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  text-align: center;
  margin-bottom: 32px;
}

.modal-header h2 {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-size: 28px;
}

.modal-header p {
  margin: 0;
  color: #7f8c8d;
  font-size: 16px;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.template-card {
  padding: 24px;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.template-card:hover {
  border-color: #2196f3;
  background: #f8f9fa;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.template-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.template-card h3 {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-size: 18px;
}

.template-card p {
  margin: 0;
  color: #7f8c8d;
  font-size: 13px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: center;
  padding-top: 24px;
  border-top: 1px solid #e9ecef;
}
</style>

