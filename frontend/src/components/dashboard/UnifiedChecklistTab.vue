<template>
  <div class="unified-checklist-tab">
    <div v-if="loading" class="loading">Loading checklist...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <!-- Training Modules Section -->
      <div v-if="checklist.trainingItems.length > 0" class="checklist-section">
        <h2>Training Modules</h2>
        <div class="checklist-items">
          <div
            v-for="item in checklist.trainingItems"
            :key="item.id"
            class="checklist-item"
            @click="goToTraining(item.task_id, item.agency_id)"
          >
            <div class="item-icon training-icon">📚</div>
            <div class="item-content">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <h3 style="margin: 0;">{{ item.title }}</h3>
                <span v-if="item.agency_id && getAgencyName(item.agency_id)" class="agency-badge">
                  {{ getAgencyName(item.agency_id) }}
                </span>
              </div>
              <p v-if="item.description">{{ item.description }}</p>
            </div>
            <div class="item-action">
              <span class="status-badge badge-warning">Incomplete</span>
              <button class="btn btn-primary btn-sm">Complete</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Documents Section -->
      <div v-if="checklist.documentItems.length > 0" class="checklist-section">
        <h2>Documents</h2>
        <div class="checklist-items">
          <div
            v-for="item in checklist.documentItems"
            :key="item.id"
            class="checklist-item"
            :class="{ overdue: isOverdue(item.due_date) }"
            @click="handleDocumentAction(item)"
          >
            <div class="item-icon document-icon">📄</div>
            <div class="item-content">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <h3 style="margin: 0;">{{ item.title }}</h3>
                <span v-if="item.agency_id && getAgencyName(item.agency_id)" class="agency-badge">
                  {{ getAgencyName(item.agency_id) }}
                </span>
              </div>
              <p v-if="item.description">{{ item.description }}</p>
              <p v-if="item.due_date" class="due-date">
                Due: {{ formatDate(item.due_date) }}
                <span v-if="isOverdue(item.due_date)" class="overdue-indicator">Overdue</span>
              </p>
            </div>
            <div class="item-action">
              <span :class="['status-badge', isOverdue(item.due_date) ? 'badge-danger' : 'badge-warning']">
                {{ isOverdue(item.due_date) ? 'Overdue' : 'Incomplete' }}
              </span>
              <button class="btn btn-primary btn-sm">
                {{ item.document_action_type === 'review' ? 'Review' : 'Sign' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Training Focuses with Nested Checklist Items -->
      <div v-if="checklist.trainingFocusesWithItems && checklist.trainingFocusesWithItems.length > 0" class="checklist-section">
        <h2>Training Focuses</h2>
        <div v-for="focus in checklist.trainingFocusesWithItems" :key="focus.trainingFocusId" class="training-focus-group">
          <h3 class="focus-title">{{ focus.trainingFocusName }}</h3>
          <div v-for="module in focus.modules" :key="module.moduleId" class="module-group">
            <h4 v-if="module.moduleTitle" class="module-title">{{ module.moduleTitle }}</h4>
            <div v-if="module.checklistItems && module.checklistItems.length > 0" class="checklist-items nested">
              <div
                v-for="item in module.checklistItems"
                :key="item.id"
                class="checklist-item nested-item"
                :class="{ completed: item.is_completed }"
              >
                <div class="item-checkbox" @click.stop="toggleCustomItem(item)">
                  <span v-if="item.is_completed" class="checkmark">✓</span>
                  <span v-else class="checkbox-empty"></span>
                </div>
                <div class="item-content">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <h3 style="margin: 0;">{{ item.title }}</h3>
                    <span v-if="item.agency_id && getAgencyName(item.agency_id)" class="agency-badge">
                      {{ getAgencyName(item.agency_id) }}
                    </span>
                  </div>
                  <p v-if="item.description">{{ item.description }}</p>
                  <p v-if="item.completed_at" class="completed-date">
                    Completed: {{ formatDate(item.completed_at) }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Standalone Custom Checklist Items Section -->
      <div v-if="checklist.customItems && checklist.customItems.length > 0" class="checklist-section">
        <h2>Custom Checklist Items</h2>
        <div class="checklist-items">
          <div
            v-for="item in checklist.customItems"
            :key="item.id"
            class="checklist-item"
            :class="{ completed: item.is_completed }"
          >
            <div class="item-checkbox" @click.stop="toggleCustomItem(item)">
              <span v-if="item.is_completed" class="checkmark">✓</span>
              <span v-else class="checkbox-empty"></span>
            </div>
            <div class="item-content">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <h3 style="margin: 0;">{{ item.title }}</h3>
                <span v-if="item.agency_id && getAgencyName(item.agency_id)" class="agency-badge">
                  {{ getAgencyName(item.agency_id) }}
                </span>
              </div>
              <p v-if="item.description">{{ item.description }}</p>
              <p v-if="item.completed_at" class="completed-date">
                Completed: {{ formatDate(item.completed_at) }}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="checklist.trainingItems.length === 0 && checklist.documentItems.length === 0 && (!checklist.customItems || checklist.customItems.length === 0) && (!checklist.trainingFocusesWithItems || checklist.trainingFocusesWithItems.length === 0)" class="empty-state">
        <p>All checklist items are complete! 🎉</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const emit = defineEmits(['update-count']);

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const loading = ref(true);
const error = ref('');
const checklist = ref({
  trainingItems: [],
  documentItems: [],
  customItems: [],
  trainingFocusesWithItems: [],
  counts: { total: 0 }
});

const fetchChecklist = async () => {
  try {
    loading.value = true;
    const userId = authStore.user?.id;
    if (!userId) {
      error.value = 'User not found';
      return;
    }
    
    const response = await api.get(`/users/${userId}/unified-checklist`);
    checklist.value = response.data;
    
    emit('update-count', checklist.value.counts.total);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load checklist';
  } finally {
    loading.value = false;
  }
};

const toggleCustomItem = async (item) => {
  if (item.is_completed) {
    // Mark incomplete
    try {
      const userId = authStore.user?.id;
      await api.post(`/users/${userId}/custom-checklist/${item.checklist_item_id}/incomplete`);
      await fetchChecklist();
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to update checklist item';
    }
  } else {
    // Mark complete
    try {
      const userId = authStore.user?.id;
      await api.post(`/users/${userId}/custom-checklist/${item.checklist_item_id}/complete`);
      await fetchChecklist();
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to update checklist item';
    }
  }
};

const isProfileModuleItem = (_item) => false;

const openProfileModule = async (_item) => {};

const getAgencyName = (agencyId) => {
  if (!agencyId) return null;
  const agency = agencyStore.agencies.find(a => a.id === agencyId);
  return agency ? agency.name : null;
};

const switchAgencyIfNeeded = async (itemAgencyId) => {
  if (!itemAgencyId || !agencyStore.currentAgency) return;
  
  // If the item belongs to a different agency, switch to it
  if (itemAgencyId !== agencyStore.currentAgency.id) {
    const targetAgency = agencyStore.agencies.find(a => a.id === itemAgencyId);
    if (targetAgency) {
      agencyStore.setCurrentAgency(targetAgency);
      // Refresh the page data after switching
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
};

const goToTraining = async (taskId, agencyId) => {
  await switchAgencyIfNeeded(agencyId);
  // Go directly to the module start splash instead of the tasks list
  try {
    const taskRes = await api.get(`/tasks/${taskId}`);
    const task = taskRes.data;
    if (task?.reference_id) {
      router.push(`/module/${task.reference_id}`);
      return;
    }
  } catch (err) {
    // Fall back to tasks list if task fetch fails
  }
  router.push(`/tasks?taskType=training&taskId=${taskId}`);
};

const handleDocumentAction = async (item) => {
  await switchAgencyIfNeeded(item.agency_id);
  if (item.document_action_type === 'review') {
    router.push(`/tasks/documents/${item.task_id}/review`);
  } else {
    router.push(`/tasks/documents/${item.task_id}/sign`);
  }
};

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

onMounted(async () => {
  // Agencies are already fetched globally (BrandingProvider). Avoid duplicate fetches/races.
  if (!Array.isArray(agencyStore.userAgencies) || agencyStore.userAgencies.length === 0) {
    await agencyStore.fetchUserAgencies();
  }
  await fetchChecklist();
});
</script>

<style scoped>
.checklist-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.checklist-section:last-child {
  border-bottom: none;
}

.training-focus-group {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.focus-title {
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
}

.module-group {
  margin-left: 16px;
  margin-bottom: 12px;
}

.module-title {
  margin: 0 0 8px 0;
  color: var(--text-secondary);
  font-size: 16px;
  font-weight: 500;
}

.checklist-items.nested {
  margin-left: 16px;
}

.checklist-item.nested-item {
  margin-left: 0;
  padding: 16px;
}

.checklist-section h2 {
  margin: 0 0 20px 0;
  color: var(--text-primary);
  font-size: 20px;
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
  cursor: pointer;
}

.checklist-item:hover {
  border-color: var(--primary);
  background: #f0f4ff;
}

.checklist-item.completed {
  background: #f0fdf4;
  border-color: #22c55e;
}

.checklist-item.overdue {
  border-color: #dc2626;
  background: #fef2f2;
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

.item-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.item-content {
  flex: 1;
}

.item-content h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 16px;
}

.item-content p {
  margin: 4px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.due-date {
  color: var(--text-secondary);
  font-size: 12px;
}

.overdue-indicator {
  margin-left: 8px;
  color: #dc2626;
  font-weight: 600;
}

.completed-date {
  color: #22c55e;
  font-size: 12px;
  font-weight: 500;
}

.item-action {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  flex-shrink: 0;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-warning {
  background: #fef3c7;
  color: #92400e;
}

.badge-danger {
  background: #fee2e2;
  color: #991b1b;
}


.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 18px;
}

.agency-badge {
  padding: 2px 8px;
  background: #e5e7eb;
  border-radius: 12px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}
</style>

