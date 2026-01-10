<template>
  <div class="user-info-field-management">
    <div class="page-header">
      <h2>User Information Field Templates</h2>
      <button @click="showCreateModal = true" class="btn btn-primary">Create Field Template</button>
    </div>
    
    <div v-if="loading" class="loading">Loading field templates...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <div v-if="fields.length === 0" class="empty-state">
        <p>No field templates found. Create your first template to get started.</p>
      </div>
      
      <div v-else class="fields-list">
        <div v-for="field in fields" :key="field.id" class="field-card">
          <div class="field-header">
            <div>
              <h3>{{ field.field_label }}</h3>
              <div class="field-meta">
                <span class="badge badge-success">Platform Template</span>
                <span class="field-key">Key: {{ field.field_key }}</span>
                <span class="field-type">{{ field.field_type }}</span>
              </div>
            </div>
            <div class="field-actions">
              <button @click="openPushModal(field)" class="btn btn-secondary btn-sm">Push to Agency</button>
              <button @click="editField(field)" class="btn btn-secondary btn-sm">Edit</button>
              <button @click="deleteField(field.id)" class="btn btn-danger btn-sm">Delete</button>
            </div>
          </div>
          <div class="field-details">
            <p v-if="field.options && Array.isArray(field.options)" class="field-options">
              <strong>Options:</strong> {{ field.options.join(', ') }}
            </p>
            <div class="field-props">
              <span :class="['prop-badge', field.is_required ? 'required' : 'optional']">
                {{ field.is_required ? 'Required' : 'Optional' }}
              </span>
              <span class="prop-badge">Order: {{ field.order_index }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingField" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h3>{{ editingField ? 'Edit Field Template' : 'Create Field Template' }}</h3>
        <form @submit.prevent="saveField">
          <div class="form-group">
            <label>Field Label *</label>
            <input v-model="fieldForm.fieldLabel" type="text" required @input="generateFieldKey" />
            <small>Display name for this field (e.g., "Full Legal Name")</small>
          </div>
          <div class="form-group">
            <label>Field Key</label>
            <input v-model="fieldForm.fieldKey" type="text" />
            <small>Unique identifier (auto-generated from label if not provided)</small>
          </div>
          <div class="form-group">
            <label>Field Type *</label>
            <select v-model="fieldForm.fieldType" required @change="handleTypeChange">
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="select">Select (Dropdown)</option>
              <option value="textarea">Textarea</option>
              <option value="boolean">Boolean (Yes/No)</option>
            </select>
          </div>
          <div v-if="fieldForm.fieldType === 'select'" class="form-group">
            <label>Options *</label>
            <textarea
              v-model="optionsText"
              rows="4"
              placeholder="Enter options, one per line or comma-separated"
              required
            ></textarea>
            <small>Enter options one per line or separated by commas</small>
          </div>
          <div class="form-group">
            <label>
              <input v-model="fieldForm.isRequired" type="checkbox" />
              Required Field
            </label>
          </div>
          <div class="form-group">
            <label>Order Index</label>
            <input v-model.number="fieldForm.orderIndex" type="number" min="0" />
            <small>Lower numbers appear first</small>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Push to Agency Modal -->
    <div v-if="showPushModal" class="modal-overlay" @click="closePushModal">
      <div class="modal-content" @click.stop>
        <h3>Push Template to Agency</h3>
        <form @submit.prevent="pushToAgency">
          <div class="form-group">
            <label>Select Agency *</label>
            <select v-model="pushForm.agencyId" required>
              <option value="">Select an agency</option>
              <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closePushModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="pushing">
              {{ pushing ? 'Pushing...' : 'Push Template' }}
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

const loading = ref(true);
const error = ref('');
const fields = ref([]);
const agencies = ref([]);
const showCreateModal = ref(false);
const editingField = ref(null);
const saving = ref(false);
const showPushModal = ref(false);
const pushing = ref(false);
const selectedFieldForPush = ref(null);
const optionsText = ref('');

const fieldForm = ref({
  fieldKey: '',
  fieldLabel: '',
  fieldType: 'text',
  options: null,
  isRequired: false,
  isPlatformTemplate: true,
  orderIndex: 0
});

const pushForm = ref({
  agencyId: ''
});

const generateFieldKey = () => {
  if (!editingField.value && fieldForm.value.fieldLabel) {
    const key = fieldForm.value.fieldLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    fieldForm.value.fieldKey = key;
  }
};

const handleTypeChange = () => {
  if (fieldForm.value.fieldType !== 'select') {
    optionsText.value = '';
    fieldForm.value.options = null;
  }
};

const fetchFields = async () => {
  try {
    loading.value = true;
    const response = await api.get('/user-info-fields/platform-templates');
    fields.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load field templates';
  } finally {
    loading.value = false;
  }
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    agencies.value = response.data;
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const editField = (field) => {
  editingField.value = field;
  fieldForm.value = {
    fieldKey: field.field_key,
    fieldLabel: field.field_label,
    fieldType: field.field_type,
    options: field.options,
    isRequired: field.is_required,
    isPlatformTemplate: true,
    orderIndex: field.order_index
  };
  
  if (field.options && Array.isArray(field.options)) {
    optionsText.value = field.options.join('\n');
  } else {
    optionsText.value = '';
  }
  
  showCreateModal.value = true;
};

const saveField = async () => {
  try {
    saving.value = true;
    
    // Parse options for select type
    let options = null;
    if (fieldForm.value.fieldType === 'select' && optionsText.value.trim()) {
      // Try to parse as array (one per line or comma-separated)
      const lines = optionsText.value.split(/[,\n]/).map(s => s.trim()).filter(s => s);
      options = lines;
    }
    
    const data = {
      fieldKey: fieldForm.value.fieldKey || undefined,
      fieldLabel: fieldForm.value.fieldLabel,
      fieldType: fieldForm.value.fieldType,
      options: options,
      isRequired: fieldForm.value.isRequired,
      isPlatformTemplate: true,
      orderIndex: fieldForm.value.orderIndex
    };
    
    if (editingField.value) {
      await api.put(`/user-info-fields/${editingField.value.id}`, data);
    } else {
      await api.post('/user-info-fields', data);
    }
    
    closeModal();
    await fetchFields();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save field template';
  } finally {
    saving.value = false;
  }
};

const deleteField = async (fieldId) => {
  if (!confirm('Are you sure you want to delete this field template? This will also delete all user values for this field.')) {
    return;
  }
  
  try {
    await api.delete(`/user-info-fields/${fieldId}`);
    await fetchFields();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete field template';
  }
};

const openPushModal = (field) => {
  selectedFieldForPush.value = field;
  pushForm.value.agencyId = '';
  showPushModal.value = true;
};

const pushToAgency = async () => {
  try {
    pushing.value = true;
    await api.post(`/user-info-fields/${selectedFieldForPush.value.id}/push-to-agency`, {
      agencyId: parseInt(pushForm.value.agencyId)
    });
    closePushModal();
    // Show success message
    alert('Template pushed to agency successfully!');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to push template to agency';
  } finally {
    pushing.value = false;
  }
};

const closeModal = () => {
  showCreateModal.value = false;
  editingField.value = null;
  fieldForm.value = {
    fieldKey: '',
    fieldLabel: '',
    fieldType: 'text',
    options: null,
    isRequired: false,
    isPlatformTemplate: true,
    orderIndex: 0
  };
  optionsText.value = '';
};

const closePushModal = () => {
  showPushModal.value = false;
  selectedFieldForPush.value = null;
  pushForm.value.agencyId = '';
};

onMounted(async () => {
  await fetchFields();
  await fetchAgencies();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.fields-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-card {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.field-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.field-header h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 18px;
}

.field-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.field-key {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

.field-type {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.field-actions {
  display: flex;
  gap: 8px;
}

.field-details {
  margin-top: 12px;
}

.field-options {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.field-props {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.prop-badge {
  padding: 4px 8px;
  background: #e5e7eb;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.prop-badge.required {
  background: #fee2e2;
  color: #991b1b;
}

.prop-badge.optional {
  background: #dbeafe;
  color: #1e40af;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
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
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.form-group input[type="checkbox"] {
  width: auto;
  margin-right: 8px;
}

.form-group small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}
</style>

