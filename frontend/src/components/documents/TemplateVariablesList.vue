<template>
  <div class="template-variables-list">
    <div class="variables-header">
      <h4>Available Template Variables</h4>
      <p class="help-text">Click any variable to copy it to your clipboard. Use these in HTML templates to personalize documents.</p>
    </div>
    <div class="variables-grid">
      <div
        v-for="variable in variables"
        :key="variable.variable"
        class="variable-item"
        @click="copyToClipboard(variable.variable)"
        :title="`${variable.description} - Click to copy`"
      >
        <code class="variable-code">{{ variable.variable }}</code>
        <span class="variable-description">{{ variable.description }}</span>
        <span class="variable-example">Example: {{ variable.example }}</span>
        <span class="copy-hint">Click to copy</span>
      </div>
    </div>
    <div v-if="copied" class="copy-feedback">
      ✓ Copied to clipboard!
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const variables = ref([]);
const copied = ref(false);

const fetchVariables = async () => {
  try {
    const response = await api.get('/document-templates/variables');
    variables.value = response.data;
  } catch (err) {
    console.error('Failed to fetch template variables:', err);
  }
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2000);
    } catch (e) {
      console.error('Fallback copy failed:', e);
    }
    document.body.removeChild(textarea);
  }
};

onMounted(() => {
  fetchVariables();
});
</script>

<style scoped>
.template-variables-list {
  margin: 20px 0;
  padding: 20px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  border: 1px solid var(--border-color, #dee2e6);
}

.variables-header {
  margin-bottom: 16px;
}

.variables-header h4 {
  margin: 0 0 8px 0;
  color: var(--text-primary, #212529);
  font-size: 16px;
  font-weight: 600;
}

.help-text {
  margin: 0;
  color: var(--text-secondary, #6c757d);
  font-size: 14px;
}

.variables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.variable-item {
  padding: 12px;
  background: white;
  border: 1px solid var(--border-color, #dee2e6);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.variable-item:hover {
  border-color: var(--primary, #007bff);
  box-shadow: 0 2px 4px rgba(0, 123, 255, 0.1);
  transform: translateY(-2px);
}

.variable-code {
  display: block;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary, #007bff);
  margin-bottom: 6px;
  word-break: break-all;
}

.variable-description {
  display: block;
  font-size: 13px;
  color: var(--text-primary, #212529);
  margin-bottom: 4px;
}

.variable-example {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #6c757d);
  font-style: italic;
}

.copy-hint {
  display: block;
  font-size: 11px;
  color: var(--text-secondary, #6c757d);
  margin-top: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.variable-item:hover .copy-hint {
  opacity: 1;
}

.copy-feedback {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--success, #28a745);
  color: white;
  border-radius: 4px;
  text-align: center;
  font-size: 14px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

