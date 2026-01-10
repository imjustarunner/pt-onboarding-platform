<template>
  <div class="container">
    <div class="page-header">
      <h1>Onboarding Checklist</h1>
      <div class="progress-indicator">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: completionPercentage + '%' }"></div>
        </div>
        <span class="progress-text">{{ completionPercentage }}% Complete</span>
      </div>
    </div>
    
    <div v-if="loading" class="loading">Loading checklist...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="checklist-content">
      <div v-if="groupedItems.length === 0" class="empty-state">
        <p>No onboarding items found.</p>
      </div>
      
      <div v-else>
        <div v-for="group in groupedItems" :key="group.type" class="checklist-group">
          <h2>{{ group.label }}</h2>
          <div class="checklist-items">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="checklist-item"
              :class="{ completed: item.is_completed }"
            >
              <div class="item-checkbox" @click="toggleItem(item)">
                <span v-if="item.is_completed" class="checkmark">✓</span>
                <span v-else class="checkbox-empty"></span>
              </div>
              <div class="item-content">
                <h3>{{ item.title }}</h3>
                <p v-if="item.description" class="item-description">{{ item.description }}</p>
                <div v-if="item.is_completed && item.completed_at" class="item-meta">
                  Completed: {{ formatDate(item.completed_at) }}
                </div>
              </div>
              <div class="item-actions">
                <button
                  v-if="item.item_type === 'training' && item.item_id"
                  @click="goToTraining(item.item_id)"
                  class="btn btn-primary btn-sm"
                >
                  View Training
                </button>
                <button
                  v-if="item.item_type === 'document' && item.item_id"
                  @click="goToDocument(item.item_id)"
                  class="btn btn-primary btn-sm"
                >
                  View Document
                </button>
                <button
                  v-if="item.item_type === 'account_setup'"
                  @click="goToAccountInfo"
                  class="btn btn-primary btn-sm"
                >
                  Set Up Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { getDashboardRoute } from '../utils/router';

const router = useRouter();
const authStore = useAuthStore();
const userId = computed(() => authStore.user?.id);

const loading = ref(true);
const error = ref('');
const checklist = ref({ items: [], completionPercentage: 0 });
const completionPercentage = computed(() => checklist.value.completionPercentage || 0);

const groupedItems = computed(() => {
  const groups = {
    profile: { type: 'profile', label: 'Profile Setup', items: [] },
    account_setup: { type: 'account_setup', label: 'Account Setup', items: [] },
    training: { type: 'training', label: 'Training', items: [] },
    document: { type: 'document', label: 'Documents', items: [] },
    custom: { type: 'custom', label: 'Other', items: [] }
  };
  
  checklist.value.items.forEach(item => {
    if (groups[item.item_type]) {
      groups[item.item_type].items.push(item);
    } else {
      groups.custom.items.push(item);
    }
  });
  
  // Return only groups that have items
  return Object.values(groups).filter(group => group.items.length > 0);
});

const fetchChecklist = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/users/${userId.value}/onboarding-checklist`);
    checklist.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load checklist';
  } finally {
    loading.value = false;
  }
};

const toggleItem = async (item) => {
  if (item.is_completed) {
    // Don't allow unchecking for now - could add this later if needed
    return;
  }
  
  try {
    await api.post(`/users/${userId.value}/onboarding-checklist/${item.id}/complete`);
    await fetchChecklist();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update checklist item';
  }
};

const goToTraining = (itemId) => {
  // Navigate to training focus or module
  router.push(getDashboardRoute());
};

const goToDocument = (itemId) => {
  // Navigate to document
  router.push(getDashboardRoute());
};

const goToAccountInfo = () => {
  router.push('/account-info');
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

onMounted(() => {
  if (userId.value) {
    fetchChecklist();
  }
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-bar {
  width: 200px;
  height: 24px;
  background: #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s ease;
}

.progress-text {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 16px;
}

.checklist-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
}

.checklist-group {
  margin-bottom: 32px;
}

.checklist-group:last-child {
  margin-bottom: 0;
}

.checklist-group h2 {
  margin: 0 0 20px 0;
  color: var(--text-primary);
  font-size: 20px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 12px;
}

.checklist-items {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.checklist-item:hover {
  border-color: var(--primary);
  background: #f0f4ff;
}

.checklist-item.completed {
  background: #f0fdf4;
  border-color: #22c55e;
}

.item-checkbox {
  width: 32px;
  height: 32px;
  border: 2px solid var(--border);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  background: white;
  transition: all 0.2s;
}

.checklist-item.completed .item-checkbox {
  background: #22c55e;
  border-color: #22c55e;
  color: white;
}

.checkmark {
  font-size: 20px;
  font-weight: bold;
}

.checkbox-empty {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-radius: 4px;
}

.item-content {
  flex: 1;
}

.item-content h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 16px;
}

.checklist-item.completed .item-content h3 {
  text-decoration: line-through;
  color: var(--text-secondary);
}

.item-description {
  margin: 0 0 8px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.item-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.item-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}
</style>

