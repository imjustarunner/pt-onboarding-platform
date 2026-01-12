<template>
  <div class="account-type-management">
    <div class="page-header">
      <h2>Account Type Management</h2>
      <button @click="showCreateModal = true" class="btn btn-primary">Create Account Type</button>
    </div>
    
    <div v-if="loading" class="loading">Loading account types...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <div class="filter-section">
        <label>Filter:</label>
        <select v-model="filterType" @change="fetchAccountTypes">
          <option value="all">All Types</option>
          <option value="platform">Platform Templates</option>
          <option value="agency">Agency Types</option>
        </select>
      </div>
      
      <div v-if="accountTypes.length === 0" class="empty-state">
        <p>No account types found.</p>
      </div>
      
      <div v-else class="account-types-list">
        <div v-for="type in accountTypes" :key="type.id" class="account-type-card">
          <div class="type-header">
            <div>
              <h3>{{ type.name }}</h3>
              <span :class="['badge', type.is_platform_template ? 'badge-success' : 'badge-info']">
                {{ type.is_platform_template ? 'Platform Template' : 'Agency Type' }}
              </span>
            </div>
            <div class="type-actions">
              <button
                v-if="type.is_platform_template"
                @click="openPushModal(type)"
                class="btn btn-secondary btn-sm"
              >
                Push to Agency
              </button>
              <button @click="editType(type)" class="btn btn-secondary btn-sm">Edit</button>
              <button @click="deleteType(type.id)" class="btn btn-danger btn-sm">Delete</button>
            </div>
          </div>
          <p v-if="type.description" class="type-description">{{ type.description }}</p>
        </div>
      </div>
    </div>
    
    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingType" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h3>{{ editingType ? 'Edit Account Type' : 'Create Account Type' }}</h3>
        <form @submit.prevent="saveType">
          <div class="form-group">
            <label>Name *</label>
            <input v-model="typeForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="typeForm.description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>
              <input
                v-model="typeForm.isPlatformTemplate"
                type="checkbox"
                :disabled="editingType && !editingType.is_platform_template"
              />
              Platform Template (Super Admin only)
            </label>
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
const accountTypes = ref([]);
const agencies = ref([]);
const filterType = ref('all');
const showCreateModal = ref(false);
const editingType = ref(null);
const saving = ref(false);
const showPushModal = ref(false);
const pushing = ref(false);
const selectedTypeForPush = ref(null);

const typeForm = ref({
  name: '',
  description: '',
  isPlatformTemplate: false
});

const pushForm = ref({
  agencyId: ''
});

const fetchAccountTypes = async () => {
  try {
    loading.value = true;
    let url = '/account-types';
    if (filterType.value === 'platform') {
      url += '?isPlatformTemplate=true';
    } else if (filterType.value === 'agency') {
      url += '?isPlatformTemplate=false';
    }
    const response = await api.get(url);
    accountTypes.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load account types';
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

const editType = (type) => {
  editingType.value = type;
  typeForm.value = {
    name: type.name,
    description: type.description || '',
    isPlatformTemplate: type.is_platform_template || false
  };
  showCreateModal.value = true;
};

const saveType = async () => {
  try {
    saving.value = true;
    const data = {
      name: typeForm.value.name,
      description: typeForm.value.description,
      isPlatformTemplate: typeForm.value.isPlatformTemplate
    };
    
    if (editingType.value) {
      await api.put(`/account-types/${editingType.value.id}`, data);
    } else {
      await api.post('/account-types', data);
    }
    
    closeModal();
    await fetchAccountTypes();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save account type';
  } finally {
    saving.value = false;
  }
};

const deleteType = async (typeId) => {
  if (!confirm('Are you sure you want to delete this account type?')) {
    return;
  }
  
  try {
    await api.delete(`/account-types/${typeId}`);
    await fetchAccountTypes();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete account type';
  }
};

const openPushModal = (type) => {
  selectedTypeForPush.value = type;
  pushForm.value.agencyId = '';
  showPushModal.value = true;
};

const pushToAgency = async () => {
  try {
    pushing.value = true;
    await api.post(`/account-types/${selectedTypeForPush.value.id}/push-to-agency`, {
      agencyId: parseInt(pushForm.value.agencyId)
    });
    closePushModal();
    await fetchAccountTypes();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to push template to agency';
  } finally {
    pushing.value = false;
  }
};

const closeModal = () => {
  showCreateModal.value = false;
  editingType.value = null;
  typeForm.value = {
    name: '',
    description: '',
    isPlatformTemplate: false
  };
};

const closePushModal = () => {
  showPushModal.value = false;
  selectedTypeForPush.value = null;
  pushForm.value.agencyId = '';
};

onMounted(async () => {
  await fetchAccountTypes();
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

.filter-section {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-section label {
  font-weight: 500;
  color: var(--text-primary);
}

.filter-section select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.account-types-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.account-type-card {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.type-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.type-header h3 {
  margin: 0 8px 0 0;
  color: var(--text-primary);
  font-size: 18px;
  display: inline-block;
}

.type-header > div:first-child {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.type-actions {
  display: flex;
  gap: 8px;
}

.type-description {
  margin: 0 0 8px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.type-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
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

