import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../services/api';

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref([]);
  const taskCounts = ref({ training: 0, document: 0 });
  const loading = ref(false);
  const error = ref('');

  const fetchTasks = async (filters = {}) => {
    try {
      loading.value = true;
      error.value = '';
      const params = new URLSearchParams();
      if (filters.taskType) params.append('taskType', filters.taskType);
      if (filters.status) params.append('status', filters.status);
      
      const response = await api.get(`/tasks?${params.toString()}`);
      tasks.value = response.data;
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to fetch tasks';
      console.error('Error fetching tasks:', err);
    } finally {
      loading.value = false;
    }
  };

  const fetchTaskCounts = async () => {
    try {
      const response = await api.get('/tasks/counts');
      taskCounts.value = response.data;
    } catch (err) {
      console.error('Error fetching task counts:', err);
    }
  };

  const completeTask = async (taskId) => {
    try {
      await api.put(`/tasks/${taskId}/complete`);
      await fetchTasks(); // Refresh tasks
      await fetchTaskCounts(); // Refresh counts
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to complete task';
      throw err;
    }
  };

  const assignTask = async (taskData) => {
    try {
      await api.post('/tasks', taskData);
      await fetchTaskCounts(); // Refresh counts
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
    fetchTasks,
    fetchTaskCounts,
    completeTask,
    assignTask
  };
});

