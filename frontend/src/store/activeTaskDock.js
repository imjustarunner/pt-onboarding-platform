import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../services/api';

const STORAGE_KEY = 'activeTaskDock.taskId';

export const useActiveTaskDockStore = defineStore('activeTaskDock', () => {
  const task = ref(null);
  const projectLists = ref([]);
  const expanded = ref(false);
  const saving = ref(false);
  const error = ref('');

  const isPinned = () => !!task.value;

  async function loadProjectLists(projectId) {
    projectLists.value = [];
    if (!projectId) return;
    try {
      const { data } = await api.get(`/task-projects/${projectId}`, { skipGlobalLoading: true });
      projectLists.value = Array.isArray(data?.overview?.lists) ? data.overview.lists : [];
    } catch {
      projectLists.value = [];
    }
  }

  async function pinTask(t) {
    if (!t) return;
    task.value = { ...t };
    expanded.value = false;
    error.value = '';
    try {
      localStorage.setItem(STORAGE_KEY, String(t.id));
    } catch {
      /* ignore storage errors */
    }
    if (t.project_id) await loadProjectLists(t.project_id);
  }

  function unpin() {
    task.value = null;
    projectLists.value = [];
    expanded.value = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
  }

  function toggleExpanded() {
    expanded.value = !expanded.value;
  }

  async function markComplete() {
    if (!task.value) return;
    saving.value = true;
    error.value = '';
    try {
      await api.put(`/tasks/${task.value.id}/complete`, {}, { skipGlobalLoading: true });
      unpin();
    } catch (e) {
      error.value = e?.response?.data?.error?.message || 'Could not mark task complete';
    } finally {
      saving.value = false;
    }
  }

  async function moveToList(listId) {
    if (!task.value) return;
    saving.value = true;
    error.value = '';
    try {
      const { data } = await api.put(
        `/me/tasks/${task.value.id}`,
        { task_list_id: listId ? Number(listId) : null },
        { skipGlobalLoading: true }
      );
      task.value = { ...task.value, ...data, task_list_id: listId ? Number(listId) : null };
    } catch (e) {
      error.value = e?.response?.data?.error?.message || 'Could not move task';
    } finally {
      saving.value = false;
    }
  }

  async function restoreFromStorage() {
    let id = null;
    try {
      id = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (!id) return;
    try {
      const { data } = await api.get(`/tasks/${id}`, { skipGlobalLoading: true });
      if (data && data.status !== 'completed' && data.status !== 'overridden') {
        await pinTask(data);
      } else {
        unpin();
      }
    } catch {
      unpin();
    }
  }

  return {
    task,
    projectLists,
    expanded,
    saving,
    error,
    isPinned,
    pinTask,
    unpin,
    toggleExpanded,
    markComplete,
    moveToList,
    restoreFromStorage
  };
});
