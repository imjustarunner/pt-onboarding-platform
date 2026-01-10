<template>
  <div class="agency-user-info-fields">
    <div class="page-header">
      <h2>User Information Fields</h2>
      <button @click="showCreateModal = true" class="btn btn-primary">Add Custom Field</button>
    </div>
    
    <div v-if="loading" class="loading">Loading fields...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <!-- Agency Selection (if multiple agencies) -->
      <div v-if="agencies.length > 1" class="agency-selector">
        <label>Select Agency:</label>
        <select v-model="selectedAgencyId" @change="fetchFields">
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>
      
      <!-- Platform Templates Section -->
      <div class="fields-section">
        <h3>Platform Templates</h3>
        <p class="section-description">These are platform-wide field templates. You can override them to customize for your agency.</p>
        
        <div v-if="platformTemplates.length === 0" class="empty-state">
          <p>No platform templates available</p>
        </div>
        <div v-else class="fields-list">
          <div v-for="template in platformTemplates" :key="template.id" class="field-card">
            <div class="field-header">
              <div>
                <h4>{{ template.field_label }}</h4>
                <div class="field-meta">
                  <span class="badge badge-info">Platform Template</span>
                  <span class="field-type">{{ template.field_type }}</span>
                </div>
              </div>
              <div class="field-actions">
                <button @click="overrideTemplate(template)" class="btn btn-secondary btn-sm">Override</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Agency Fields Section -->
      <div class="fields-section">
        <h3>Agency-Specific Fields</h3>
        <p class="section-description">Custom fields and overrides for this agency.</p>
        
        <div v-if="agencyFields.length === 0" class="empty-state">
          <p>No agency-specific fields. Create custom fields or override platform templates.</p>
        </div>
        <div v-else class="fields-list">
          <div v-for="field in agencyFields" :key="field.id" class="field-card">
            <div class="field-header">
              <div>
                <h4>{{ field.field_label }}</h4>
                <div class="field-meta">
                  <span :class="['badge', field.parent_field_id ? 'badge-warning' : 'badge-success']">
                    {{ field.parent_field_id ? 'Override' : 'Custom' }}
                  </span>
                  <span class="field-type">{{ field.field_type }}</span>
                </div>
              </div>
              <div class="field-actions">
                <button @click="editField(field)" class="btn btn-secondary btn-sm">Edit</button>
                <button @click="deleteField(field.id)" class="btn btn-danger btn-sm">Delete</button>
              </div>
            </div>
            <div class="field-details">
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
    </div>
    
    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingField" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h3>{{ editingField ? 'Edit Field' : editingField?.parent_field_id ? 'Override Template' : 'Add Custom Field' }}</h3>
        <form @submit.prevent="saveField">
          <div class="form-group">
            <label>Field Label *</label>
            <input v-model="fieldForm.fieldLabel" type="text" required @input="generateFieldKey" />
          </div>
          <div class="form-group">
            <label>Field Key</label>
            <input v-model="fieldForm.fieldKey" type="text" />
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
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const authStore = useAuthStore();
const loading = ref(true);
const error = ref('');
const platformTemplates = ref([]);
const agencyFields = ref([]);
const agencies = ref([]);
const selectedAgencyId = ref(null);
const showCreateModal = ref(false);
const editingField = ref(null);
const saving = ref(false);
const optionsText = ref('');

const fieldForm = ref({
  fieldKey: '',
  fieldLabel: '',
  fieldType: 'text',
  options: null,
  isRequired: false,
  isPlatformTemplate: false,
  agencyId: null,
  parentFieldId: null,
  orderIndex: 0
});

const fetchAgencies = async () => {
  try {
    const response = await api.get('/users/me/agencies');
    agencies.value = response.data;
    if (agencies.value.length > 0) {
      selectedAgencyId.value = agencies.value[0].id;
      await fetchFields();
    }
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const fetchFields = async () => {
  if (!selectedAgencyId.value) return;
  
  try {
    loading.value = true;
    const response = await api.get(`/user-info-fields/agencies/${selectedAgencyId.value}/fields`);
    platformTemplates.value = response.data.platformTemplates;
    agencyFields.value = response.data.agencyFields;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load fields';
  } finally {
    loading.value = false;
  }
};

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

const overrideTemplate = (template) => {
  editingField.value = { ...template, parent_field_id: template.id };
  fieldForm.value = {
    fieldKey: template.field_key,
    fieldLabel: template.field_label,
    fieldType: template.field_type,
    options: template.options,
    isRequired: template.is_required,
    isPlatformTemplate: false,
    agencyId: selectedAgencyId.value,
    parentFieldId: template.id,
    orderIndex: template.order_index
  };
  
  if (template.options && Array.isArray(template.options)) {
    optionsText.value = template.options.join('\n');
  } else {
    optionsText.value = '';
  }
  
  showCreateModal.value = true;
};

const editField = (field) => {
  editingField.value = field;
  fieldForm.value = {
    fieldKey: field.field_key,
    fieldLabel: field.field_label,
    fieldType: field.field_type,
    options: field.options,
    isRequired: field.is_required,
    isPlatformTemplate: false,
    agencyId: field.agency_id,
    parentFieldId: field.parent_field_id,
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
      const lines = optionsText.value.split(/[,\n]/).map(s => s.trim()).filter(s => s);
      options = lines;
    }
    
    const data = {
      fieldKey: fieldForm.value.fieldKey || undefined,
      fieldLabel: fieldForm.value.fieldLabel,
      fieldType: fieldForm.value.fieldType,
      options: options,
      isRequired: fieldForm.value.isRequired,
      isPlatformTemplate: false,
      agencyId: selectedAgencyId.value,
      parentFieldId: fieldForm.value.parentFieldId,
      orderIndex: fieldForm.value.orderIndex
    };
    
    if (editingField.value && editingField.value.id) {
      await api.put(`/user-info-fields/${editingField.value.id}`, data);
    } else {
      await api.post('/user-info-fields', data);
    }
    
    closeModal();
    await fetchFields();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save field';
  } finally {
    saving.value = false;
  }
};

const deleteField = async (fieldId) => {
  if (!confirm('Are you sure you want to delete this field? This will also delete all user values for this field.')) {
    return;
  }
  
  try {
    await api.delete(`/user-info-fields/${fieldId}`);
    await fetchFields();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete field';
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
    isPlatformTemplate: false,
    agencyId: selectedAgencyId.value,
    parentFieldId: null,
    orderIndex: 0
  };
  optionsText.value = '';
};

onMounted(async () => {
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

.agency-selector {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.agency-selector label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.agency-selector select {
  width: 100%;
  max-width: 300px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.fields-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.fields-section:last-child {
  border-bottom: none;
}

.fields-section h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.section-description {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 14px;
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

.field-header h4 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 16px;
}

.field-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
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
  padding: 24px;
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

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}
</style>

