<template>
  <div class="custom-checklist-item-management">
    <div class="page-header">
      <h2>Custom Checklist Item Templates</h2>
      <button @click="showCreateModal = true" class="btn btn-primary">Create Item Template</button>
    </div>
    
    <div class="filter-section">
      <label>Filter:</label>
      <select v-model="filterType" @change="fetchItems" class="filter-select">
        <option value="all">All Items</option>
        <option value="platform">Platform Templates</option>
        <option value="agency">Agency Items</option>
      </select>
    </div>
    
    <div v-if="loading" class="loading">Loading checklist items...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <div v-if="items.length === 0" class="empty-state">
        <p>No checklist items found{{ filterType !== 'all' ? ` (filtered by ${filterType === 'platform' ? 'platform templates' : 'agency items'})` : '' }}.</p>
      </div>
      
      <div v-else class="items-list">
        <div v-for="item in items" :key="item.id" class="item-card">
          <div class="item-header">
            <div>
              <h3>{{ item.item_label }}</h3>
              <div class="item-meta">
                <span :class="['badge', item.is_platform_template ? 'badge-success' : 'badge-info']">
                  {{ item.is_platform_template ? 'Platform Template' : 'Agency Item' }}
                </span>
                <span v-if="item.agency_id && getAgencyName(item.agency_id)" class="badge badge-secondary">
                  {{ getAgencyName(item.agency_id) }}
                </span>
                <span class="item-key">Key: {{ item.item_key }}</span>
              </div>
            </div>
            <div class="item-actions">
              <button @click="editItem(item)" class="btn btn-secondary btn-sm">Edit</button>
              <button @click="deleteItem(item.id)" class="btn btn-danger btn-sm">Delete</button>
            </div>
          </div>
          <p v-if="item.description" class="item-description">{{ item.description }}</p>
          <div class="item-props">
            <span class="prop-badge">Order: {{ item.order_index }}</span>
            <span v-if="item.training_focus_id || item.module_id" class="prop-badge badge-info">
              Nested: {{ item.module_id ? 'Module' : 'Training Focus' }}
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingItem" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h3>{{ editingItem ? 'Edit Checklist Item' : 'Create Checklist Item Template' }}</h3>
        <form @submit.prevent="saveItem">
          <div class="form-group">
            <label>Item Label *</label>
            <input v-model="itemForm.itemLabel" type="text" required @input="generateItemKey" />
            <small>Display name for this item (e.g., "Create and verify payroll account")</small>
          </div>
          <div class="form-group">
            <label>Item Key</label>
            <input v-model="itemForm.itemKey" type="text" />
            <small>Unique identifier (auto-generated from label if not provided)</small>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="itemForm.description" rows="3"></textarea>
            <small>Optional description or instructions for this checklist item</small>
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
    
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const loading = ref(true);
const error = ref('');
const items = ref([]);
const agencies = ref([]);
const trainingFocuses = ref([]);
const availableModules = ref([]);
const loadingModules = ref(false);
const filterType = ref('platform'); // 'all', 'platform', 'agency'
const showCreateModal = ref(false);
const editingItem = ref(null);
const saving = ref(false);

const itemForm = ref({
  itemKey: '',
  itemLabel: '',
  description: '',
  isPlatformTemplate: true,
  autoAssign: false,
  orderIndex: 0,
  trainingFocusId: null,
  moduleId: null
});

const generateItemKey = () => {
  if (!editingItem.value && itemForm.value.itemLabel) {
    const key = itemForm.value.itemLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    itemForm.value.itemKey = key;
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
  try {
    loading.value = true;
    let url = '/custom-checklist-items';
    
    if (filterType.value === 'platform') {
      url += '?isPlatformTemplate=true';
    } else if (filterType.value === 'agency') {
      url += '?isPlatformTemplate=false';
    }
    // 'all' shows everything, no query params needed
    
    const response = await api.get(url);
    items.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load checklist items';
  } finally {
    loading.value = false;
  }
};

const getAgencyName = (agencyId) => {
  const agency = agencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : null;
};


const editItem = async (item) => {
  editingItem.value = item;
  itemForm.value = {
    itemKey: item.item_key,
    itemLabel: item.item_label,
    description: item.description || '',
    isPlatformTemplate: item.is_platform_template || false,
    agencyId: item.agency_id || null,
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
    
    const data = {
      itemKey: itemForm.value.itemKey?.trim() || undefined,
      itemLabel: itemForm.value.itemLabel?.trim(),
      description: itemForm.value.description?.trim() || undefined,
      isPlatformTemplate: editingItem.value ? editingItem.value.is_platform_template : true,
      agencyId: editingItem.value && editingItem.value.agency_id ? editingItem.value.agency_id : null,
      autoAssign: false,
      orderIndex: itemForm.value.orderIndex,
      trainingFocusId: itemForm.value.trainingFocusId || null,
      moduleId: itemForm.value.moduleId || null
    };
    
    if (editingItem.value) {
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
  if (!confirm('Are you sure you want to delete this checklist item template? This will also delete all user assignments for this item.')) {
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
    isPlatformTemplate: true,
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
  await fetchItems();
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

.filter-section {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-section label {
  font-weight: 500;
  color: var(--text-primary);
}

.filter-select {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  min-width: 200px;
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

.item-header h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 18px;
}

.item-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.item-key {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
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

