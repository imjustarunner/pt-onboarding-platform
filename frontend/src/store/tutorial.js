import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '../services/api';

const parseJsonMaybe = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const normalizeProgress = (raw) => {
  const obj = parseJsonMaybe(raw) || raw;
  if (!obj || typeof obj !== 'object') return { tours: {} };
  const tours = obj.tours && typeof obj.tours === 'object' ? obj.tours : {};
  return { ...obj, tours };
};

export const useTutorialStore = defineStore('tutorial', () => {
  const ENABLED_STORAGE_KEY = 'tutorial.enabled.v1';
  const loadEnabled = () => {
    try {
      const v = window?.localStorage?.getItem?.(ENABLED_STORAGE_KEY);
      return v === '1';
    } catch {
      return false;
    }
  };

  const enabled = ref(loadEnabled());

  const progress = ref({ tours: {} });
  const loadedForUserId = ref(null);
  const loading = ref(false);
  const saving = ref(false);

  const isLoaded = computed(() => loadedForUserId.value != null);

  const setEnabled = (next) => {
    enabled.value = !!next;
    try {
      window?.localStorage?.setItem?.(ENABLED_STORAGE_KEY, enabled.value ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const ensureLoaded = async (userId) => {
    if (!userId) return;
    if (loadedForUserId.value === userId) return;
    await loadProgress(userId);
  };

  const loadProgress = async (userId) => {
    if (!userId) return;
    try {
      loading.value = true;
      const resp = await api.get(`/users/${userId}/preferences`);
      const tp = resp?.data?.tutorial_progress;
      progress.value = normalizeProgress(tp);
      loadedForUserId.value = userId;
    } catch (e) {
      // Best-effort: tutorial should never block the app.
      progress.value = { tours: {} };
      loadedForUserId.value = userId;
      console.warn('Failed to load tutorial progress:', e?.message || e);
    } finally {
      loading.value = false;
    }
  };

  const saveProgress = async (userId) => {
    if (!userId) return;
    try {
      saving.value = true;
      await api.put(`/users/${userId}/preferences`, {
        tutorial_progress: progress.value
      });
    } catch (e) {
      console.warn('Failed to save tutorial progress:', e?.message || e);
    } finally {
      saving.value = false;
    }
  };

  const getTourState = (tourId) => {
    if (!tourId) return null;
    return progress.value?.tours?.[tourId] || null;
  };

  const isTourComplete = (tourId, version) => {
    const st = getTourState(tourId);
    if (!st) return false;
    if (st.version !== version) return false;
    return st.completed === true;
  };

  const markTourComplete = async (userId, tourId, version) => {
    if (!tourId) return;
    const tours = { ...(progress.value?.tours || {}) };
    tours[tourId] = {
      ...(tours[tourId] || {}),
      version,
      completed: true,
      completedAt: new Date().toISOString()
    };
    progress.value = { ...(progress.value || {}), tours };
    await saveProgress(userId);
  };

  const resetTour = async (userId, tourId) => {
    if (!tourId) return;
    const tours = { ...(progress.value?.tours || {}) };
    delete tours[tourId];
    progress.value = { ...(progress.value || {}), tours };
    await saveProgress(userId);
  };

  return {
    enabled,
    progress,
    loadedForUserId,
    loading,
    saving,
    isLoaded,
    setEnabled,
    ensureLoaded,
    loadProgress,
    saveProgress,
    getTourState,
    isTourComplete,
    markTourComplete,
    resetTour
  };
});

