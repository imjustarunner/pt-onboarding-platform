<template>
  <div class="agency-custom-checklist-items">
    <div class="page-header">
      <h2>Custom Checklist Items</h2>
      <button v-if="!assignOnly" @click="showCreateModal = true" class="btn btn-primary">Add Custom Item</button>
    </div>
    
    <div v-if="loading" class="loading">Loading checklist items...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <!-- Agency Selection (if multiple agencies) -->
      <div v-if="agencies.length > 1" class="agency-selector">
        <label>Select Agency:</label>
        <select v-model="selectedAgencyId" @change="fetchItems">
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>
      
      <!-- Platform Templates Section -->
      <div class="items-section">
        <h3>Platform Items</h3>
        <p class="section-description">These are platform-wide checklist items. Toggle them on/off to control which items appear for all employees in this agency.</p>
        
        <div v-if="platformTemplates.length === 0" class="empty-state">
          <p>No platform templates available</p>
        </div>
        <div v-else class="items-list">
          <div v-for="template in platformTemplates" :key="template.id" class="item-card">
            <div class="item-header">
              <div class="item-content">
                <div class="item-title-row">
                  <h4>{{ template.item_label }}</h4>
                  <label class="toggle-switch">
                    <input 
                      type="checkbox" 
                      :checked="template.enabled" 
                      @change="togglePlatformItem(template.id, $event.target.checked)"
                      :disabled="togglingItems.has(template.id)"
                    />
                    <span class="slider"></span>
                  </label>
                </div>
                <div class="item-meta">
                  <span class="badge badge-info">Platform Template</span>
                  <span :class="['badge', template.enabled ? 'badge-success' : 'badge-secondary']">
                    {{ template.enabled ? 'Enabled' : 'Disabled' }}
                  </span>
                </div>
              </div>
            </div>
            <p v-if="template.description" class="item-description">{{ template.description }}</p>
          </div>
        </div>
      </div>
      
      <!-- Agency Items Section -->
      <div class="items-section">
        <h3>Agency-Specific Items</h3>
        <p class="section-description">Custom checklist items for this agency. These automatically appear for all employees in this agency.</p>
        
        <div v-if="agencyItems.length === 0" class="empty-state">
          <p>No agency-specific items. Create custom items or override platform templates.</p>
        </div>
        <div v-else class="items-list">
          <div v-for="item in agencyItems" :key="item.id" class="item-card">
            <div class="item-header">
              <div>
                <h4>{{ item.item_label }}</h4>
                <div class="item-meta">
                  <span class="badge badge-success">Custom</span>
                </div>
              </div>
              <div class="item-actions">
                <button v-if="!assignOnly" @click="editItem(item)" class="btn btn-secondary btn-sm">Edit</button>
                <button v-if="!assignOnly" @click="deleteItem(item.id)" class="btn btn-danger btn-sm">Delete</button>
              </div>
            </div>
            <p v-if="item.description" class="item-description">{{ item.description }}</p>
            <div class="item-props">
              <span class="prop-badge">Order: {{ item.order_index }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingItem" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h3>{{ editingItem ? 'Edit Checklist Item' : 'Add Custom Item' }}</h3>
        <form @submit.prevent="saveItem">
          <div class="form-group">
            <label>Item Label *</label>
            <input v-model="itemForm.itemLabel" type="text" required @input="generateItemKey" />
          </div>
          <div class="form-group">
            <label>Item Key</label>
            <input v-model="itemForm.itemKey" type="text" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="itemForm.description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Nest Under (Optional)</label>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div>
                <label style="font-size: 13px; font-weight: 500;">Training Focus</label>
                <select v-model="itemForm.trainingFocusId" @change="onTrainingFocusChange" class="form-select">
                  <option :value="null">None (Standalone)</option>
                  <option v-for="focus in trainingFocuses" :key="focus.id" :value="focus.id">
                    {{ focus.name }}
                  </option>
                </select>
                <small>Optional: Nest this item under a training focus</small>
              </div>
              <div v-if="itemForm.trainingFocusId">
                <label style="font-size: 13px; font-weight: 500;">Module (Optional)</label>
                <select v-model="itemForm.moduleId" class="form-select" :disabled="!itemForm.trainingFocusId || loadingModules">
                  <option :value="null">None (Nest under training focus only)</option>
                  <optgroup v-if="availableModules.filter(m => m.is_active === true || m.is_active === 1).length > 0" label="Active Modules">
                    <option v-for="module in availableModules.filter(m => m.is_active === true || m.is_active === 1)" :key="module.id" :value="module.id">
                      {{ module.title }}
                    </option>
                  </optgroup>
                  <optgroup v-if="availableModules.filter(m => !(m.is_active === true || m.is_active === 1)).length > 0" label="Inactive Modules">
                    <option v-for="module in availableModules.filter(m => !(m.is_active === true || m.is_active === 1))" :key="module.id" :value="module.id">
                      {{ module.title }} (Inactive)
                    </option>
                  </optgroup>
                </select>
                <small>Optional: Nest under a specific module (implies training focus). All modules linked to this training focus are shown.</small>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>Order Index</label>
            <input v-model.number="itemForm.orderIndex" type="number" min="0" />
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

const props = defineProps({
  assignOnly: {
    type: Boolean,
    default: false
  }
});

const authStore = useAuthStore();
const loading = ref(true);
const error = ref('');
const platformTemplates = ref([]);
const agencyItems = ref([]);
const agencies = ref([]);
const trainingFocuses = ref([]);
const availableModules = ref([]);
const loadingModules = ref(false);
const selectedAgencyId = ref(null);
const showCreateModal = ref(false);
const editingItem = ref(null);
const saving = ref(false);
const togglingItems = ref(new Set());

const itemForm = ref({
  itemKey: '',
  itemLabel: '',
  description: '',
  isPlatformTemplate: false,
  agencyId: null,
  parentItemId: null,
  autoAssign: false,
  orderIndex: 0,
  trainingFocusId: null,
  moduleId: null
});

const fetchAgencies = async () => {
  try {
    const response = await api.get('/users/me/agencies');
    agencies.value = response.data;
    if (agencies.value.length > 0) {
      selectedAgencyId.value = agencies.value[0].id;
      await fetchItems();
    }
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const fetchTrainingFocuses = async () => {
  try {
    const response = await api.get('/training-focuses');
    trainingFocuses.value = response.data || [];
  } catch (err) {
    console.error('Failed to load training focuses:', err);
    trainingFocuses.value = [];
  }
};

const onTrainingFocusChange = async () => {
  itemForm.value.moduleId = null;
  availableModules.value = [];
  
  if (!itemForm.value.trainingFocusId) {
    return;
  }
  
  try {
    loadingModules.value = true;
    // Use the modules endpoint directly to get all modules (not filtered by status)
    // This shows all modules linked to the training focus, including inactive ones
    const response = await api.get(`/training-focuses/${itemForm.value.trainingFocusId}/modules`);
    const allModules = response.data || [];
    
    // Group modules by active status for better UX
    const activeModules = allModules.filter(m => m.is_active === true || m.is_active === 1);
    const inactiveModules = allModules.filter(m => !(m.is_active === true || m.is_active === 1));
    
    // Show active modules first, then inactive ones
    availableModules.value = [...activeModules, ...inactiveModules];
  } catch (err) {
    console.error('Failed to load modules for training focus:', err);
    availableModules.value = [];
  } finally {
    loadingModules.value = false;
  }
};

const fetchItems = async () => {
  if (!selectedAgencyId.value) return;
  
  try {
    loading.value = true;
    const response = await api.get(`/custom-checklist-items/agencies/${selectedAgencyId.value}/items`);
    platformTemplates.value = response.data.platformTemplates;
    agencyItems.value = response.data.agencyItems;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load checklist items';
  } finally {
    loading.value = false;
  }
};

const generateItemKey = () => {
  if (!editingItem.value && itemForm.value.itemLabel) {
    const key = itemForm.value.itemLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    itemForm.value.itemKey = key;
  }
};

const togglePlatformItem = async (itemId, enabled) => {
  if (!selectedAgencyId.value) return;
  
  try {
    togglingItems.value.add(itemId);
    await api.post(`/custom-checklist-items/${itemId}/toggle-agency/${selectedAgencyId.value}`, {
      enabled: enabled
    });
    
    // Update local state
    const template = platformTemplates.value.find(t => t.id === itemId);
    if (template) {
      template.enabled = enabled;
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to toggle checklist item';
    // Revert the toggle on error
    const template = platformTemplates.value.find(t => t.id === itemId);
    if (template) {
      template.enabled = !enabled;
    }
  } finally {
    togglingItems.value.delete(itemId);
  }
};

const editItem = async (item) => {
  editingItem.value = item;
  itemForm.value = {
    itemKey: item.item_key,
    itemLabel: item.item_label,
    description: item.description || '',
    isPlatformTemplate: false,
    agencyId: item.agency_id,
    parentItemId: null,
    autoAssign: false,
    orderIndex: item.order_index,
    trainingFocusId: item.training_focus_id || null,
    moduleId: item.module_id || null
  };
  
  // Load modules if training focus is set
  if (itemForm.value.trainingFocusId) {
    await onTrainingFocusChange();
  }
  
  showCreateModal.value = true;
};

const saveItem = async () => {
  try {
    saving.value = true;
    
    if (!selectedAgencyId.value) {
      error.value = 'Please select an agency first';
      saving.value = false;
      return;
    }
    
    const data = {
      itemKey: itemForm.value.itemKey?.trim() || undefined,
      itemLabel: itemForm.value.itemLabel?.trim(),
      description: itemForm.value.description?.trim() || undefined,
      isPlatformTemplate: false,
      agencyId: selectedAgencyId.value,
      parentItemId: null,
      autoAssign: false,
      orderIndex: itemForm.value.orderIndex,
      trainingFocusId: itemForm.value.trainingFocusId || null,
      moduleId: itemForm.value.moduleId || null
    };
    
    if (editingItem.value && editingItem.value.id) {
      await api.put(`/custom-checklist-items/${editingItem.value.id}`, data);
    } else {
      await api.post('/custom-checklist-items', data);
    }
    
    closeModal();
    await fetchItems();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save checklist item';
  } finally {
    saving.value = false;
  }
};

const deleteItem = async (itemId) => {
  if (!confirm('Are you sure you want to delete this checklist item? This will also delete all user assignments for this item.')) {
    return;
  }
  
  try {
    await api.delete(`/custom-checklist-items/${itemId}`);
    await fetchItems();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete checklist item';
  }
};

const closeModal = () => {
  showCreateModal.value = false;
  editingItem.value = null;
  itemForm.value = {
    itemKey: '',
    itemLabel: '',
    description: '',
    isPlatformTemplate: false,
    agencyId: selectedAgencyId.value,
    parentItemId: null,
    autoAssign: false,
    orderIndex: 0,
    trainingFocusId: null,
    moduleId: null
  };
  availableModules.value = [];
};

onMounted(async () => {
  await fetchAgencies();
  await fetchTrainingFocuses();
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

.items-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.items-section:last-child {
  border-bottom: none;
}

.items-section h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.section-description {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.item-card {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.item-content {
  flex: 1;
}

.item-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

.toggle-switch input:checked + .slider {
  background-color: var(--primary);
}

.toggle-switch input:checked + .slider:before {
  transform: translateX(26px);
}

.toggle-switch input:disabled + .slider {
  opacity: 0.6;
  cursor: not-allowed;
}

.item-header h4 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 16px;
}

.item-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.item-description {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.item-props {
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
.form-group textarea,
.form-group select {
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

