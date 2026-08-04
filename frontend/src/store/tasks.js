import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../services/api';

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref([]);
  const taskCounts = ref({
    training: 0,
    document: 0,
    assigned: 0,
    mine: 0,
    watchlist: 0,
    action_items: 0,
    all: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    overdue: 0,
    open: 0
  });
  const loading = ref(false);
  const error = ref('');
  const lastFilters = ref({});

  const fetchTasks = async (filters = {}) => {
    try {
      loading.value = true;
      error.value = '';
      lastFilters.value = { ...filters };
      const params = new URLSearchParams();
      if (filters.taskType) params.append('taskType', filters.taskType);
      if (filters.status) params.append('status', filters.status);
      if (filters.view) params.append('view', filters.view);
      if (filters.urgency) params.append('urgency', filters.urgency);
      if (filters.departmentId) params.append('departmentId', filters.departmentId);
      if (filters.due) params.append('due', filters.due);
      if (filters.q) params.append('q', filters.q);
      if (filters.limit != null) params.append('limit', String(filters.limit));
      if (filters.offset != null) params.append('offset', String(filters.offset));
      if (filters.agencyId) params.append('agencyId', String(filters.agencyId));
      if (filters.hiddenAgencyIds?.length) {
        params.append('hiddenAgencyIds', filters.hiddenAgencyIds.join(','));
      }
      if (filters.assignedToUserId) params.append('assignedToUserId', String(filters.assignedToUserId));
      if (filters.taskListId) params.append('taskListId', String(filters.taskListId));
      if (filters.projectId) params.append('projectId', String(filters.projectId));
      if (filters.tenantId) params.append('tenantId', String(filters.tenantId));
      if (filters.onSharedList === '1' || filters.onSharedList === '0') {
        params.append('onSharedList', filters.onSharedList);
      }

      const qs = params.toString();
      const response = await api.get(`/tasks${qs ? `?${qs}` : ''}`);
      tasks.value = Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to fetch tasks';
      console.error('Error fetching tasks:', err);
    } finally {
      loading.value = false;
    }
  };

  const fetchTaskCounts = async (agencyId = null, hiddenAgencyIds = [], extra = {}) => {
    try {
      const params = new URLSearchParams();
      if (agencyId) params.append('agencyId', String(agencyId));
      if (hiddenAgencyIds?.length) params.append('hiddenAgencyIds', hiddenAgencyIds.join(','));
      if (extra.tenantId) params.append('tenantId', String(extra.tenantId));
      if (extra.assignedToUserId) params.append('assignedToUserId', String(extra.assignedToUserId));
      if (extra.taskListId) params.append('taskListId', String(extra.taskListId));
      if (extra.projectId) params.append('projectId', String(extra.projectId));
      const qs = params.toString();
      const response = await api.get(`/tasks/counts${qs ? `?${qs}` : ''}`);
      taskCounts.value = { ...taskCounts.value, ...(response.data || {}) };
    } catch (err) {
      console.error('Error fetching task counts:', err);
    }
  };

  const completeTask = async (taskId) => {
    try {
      await api.put(`/tasks/${taskId}/complete`);
      await fetchTasks(lastFilters.value);
      await fetchTaskCounts(lastFilters.value.agencyId || null);
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to complete task';
      throw err;
    }
  };

  const incompleteTask = async (taskId) => {
    try {
      await api.put(`/tasks/${taskId}/incomplete`);
      await fetchTasks(lastFilters.value);
      await fetchTaskCounts(lastFilters.value.agencyId || null);
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to reopen task';
      throw err;
    }
  };

  const assignTask = async (taskData) => {
    try {
      await api.post('/tasks', taskData);
      await fetchTaskCounts(lastFilters.value.agencyId || null);
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to assign task';
      throw err;
    }
  };

  return {
    tasks,
    taskCounts,
    loading,
    error,
    lastFilters,
    fetchTasks,
    fetchTaskCounts,
    completeTask,
    incompleteTask,
    assignTask
  };
});
