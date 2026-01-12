<template>
  <div v-if="show" class="modal-overlay" @click="$emit('close')">
    <div class="modal-content email-template-modal" @click.stop>
      <div class="modal-header">
        <h2>Email Template</h2>
        <button @click="$emit('close')" class="btn-close" aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="loading">Loading templates...</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else>
          <div class="template-selector">
            <label for="template-select">Select Template:</label>
            <select 
              id="template-select" 
              v-model="selectedTemplateId" 
              @change="generateEmail"
              class="form-select"
            >
              <option value="">-- Select a template --</option>
              <option 
                v-for="template in templates" 
                :key="template.id" 
                :value="template.id"
              >
                {{ template.name }} ({{ template.agency_name || 'Platform' }})
              </option>
            </select>
          </div>

          <div v-if="generatedEmail" class="generated-email-section">
            <div class="email-preview">
              <div class="email-field">
                <label>Subject:</label>
                <div class="field-value">
                  <input 
                    type="text" 
                    :value="generatedEmail.subject" 
                    readonly 
                    class="email-input" 
                    ref="subjectInput"
                  />
                  <button @click="copySubject" class="btn btn-sm btn-secondary">Copy</button>
                </div>
              </div>

              <div class="email-field">
                <label>Body:</label>
                <div class="field-value">
                  <textarea 
                    :value="generatedEmail.body" 
                    readonly 
                    class="email-textarea" 
                    ref="bodyInput"
                    rows="15"
                  ></textarea>
                  <button @click="copyBody" class="btn btn-sm btn-secondary">Copy</button>
                </div>
              </div>

              <div class="email-actions">
                <button @click="copyFullEmail" class="btn btn-primary">Copy Full Email</button>
                <button @click="regenerateEmail" class="btn btn-secondary" :disabled="!selectedTemplateId">
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button @click="$emit('close')" class="btn btn-secondary">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  userId: {
    type: Number,
    required: true
  },
  templateType: {
    type: String,
    required: true
  },
  defaultTemplateId: {
    type: Number,
    default: null
  },
  show: {
    type: Boolean,
    default: false
  },
  userData: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close', 'emailGenerated']);

const agencyStore = useAgencyStore();
const templates = ref([]);
const selectedTemplateId = ref(null);
const generatedEmail = ref(null);
const loading = ref(false);
const error = ref('');
const subjectInput = ref(null);
const bodyInput = ref(null);

const fetchTemplates = async () => {
  try {
    loading.value = true;
    error.value = '';
    
    // Get user's agencies to determine which templates to show
    const userAgencies = agencyStore.userAgencies || [];
    const agencyId = userAgencies.length > 0 ? userAgencies[0].id : null;
    
    // Fetch templates for the template type
    const params = { templateType: props.templateType };
    if (agencyId) {
      params.agencyId = agencyId;
    }
    
    const response = await api.get('/email-templates', { params });
    templates.value = response.data || [];
    
    // Set default template if provided
    if (props.defaultTemplateId) {
      selectedTemplateId.value = props.defaultTemplateId;
      await generateEmail();
    } else if (templates.value.length > 0) {
      // Auto-select first template and generate
      selectedTemplateId.value = templates.value[0].id;
      await generateEmail();
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load templates';
    console.error('Error fetching templates:', err);
  } finally {
    loading.value = false;
  }
};

const generateEmail = async () => {
  if (!selectedTemplateId.value) {
    generatedEmail.value = null;
    return;
  }
  
  try {
    loading.value = true;
    error.value = '';
    
    const response = await api.post(`/users/${props.userId}/generate-email`, {
      templateId: selectedTemplateId.value,
      templateType: props.templateType
    });
    
    generatedEmail.value = {
      subject: response.data.subject,
      body: response.data.body,
      template: response.data.template
    };
    
    emit('emailGenerated', generatedEmail.value);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to generate email';
    console.error('Error generating email:', err);
  } finally {
    loading.value = false;
  }
};

const regenerateEmail = async () => {
  await generateEmail();
};

const copySubject = async () => {
  if (subjectInput.value && generatedEmail.value) {
    subjectInput.value.select();
    try {
      await navigator.clipboard.writeText(generatedEmail.value.subject);
      alert('Subject copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
};

const copyBody = async () => {
  if (bodyInput.value && generatedEmail.value) {
    bodyInput.value.select();
    try {
      await navigator.clipboard.writeText(generatedEmail.value.body);
      alert('Body copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
};

const copyFullEmail = async () => {
  if (generatedEmail.value) {
    const fullEmail = `Subject: ${generatedEmail.value.subject}\n\n${generatedEmail.value.body}`;
    try {
      await navigator.clipboard.writeText(fullEmail);
      alert('Full email copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
};

watch(() => props.show, (newValue) => {
  if (newValue) {
    fetchTemplates();
  } else {
    // Reset when modal closes
    selectedTemplateId.value = null;
    generatedEmail.value = null;
    error.value = '';
  }
});

onMounted(() => {
  if (props.show) {
    fetchTemplates();
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.email-template-modal {
  min-width: 600px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 2px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.btn-close:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.template-selector {
  margin-bottom: 24px;
}

.template-selector label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-select {
  width: 100%;
  padding: 10px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.generated-email-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.email-field {
  margin-bottom: 20px;
}

.email-field label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.field-value {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.email-input {
  flex: 1;
  padding: 10px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.email-textarea {
  flex: 1;
  padding: 10px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  font-family: monospace;
  resize: vertical;
  min-height: 200px;
}

.email-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 2px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.loading, .error {
  text-align: center;
  padding: 40px;
}

.error {
  color: var(--error);
}
</style>
