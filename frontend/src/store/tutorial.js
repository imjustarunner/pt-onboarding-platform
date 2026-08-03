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

  const getTourStepIndex = (tourId, version) => {
    const st = getTourState(tourId);
    if (!st || st.version !== version) return 0;
    const idx = Number(st.stepIndex);
    return Number.isFinite(idx) && idx >= 0 ? idx : 0;
  };

  const saveTourStepIndex = async (userId, tourId, version, stepIndex) => {
    if (!tourId) return;
    const idx = Number(stepIndex);
    if (!Number.isFinite(idx) || idx < 0) return;
    const tours = { ...(progress.value?.tours || {}) };
    tours[tourId] = {
      ...(tours[tourId] || {}),
      version,
      completed: false,
      stepIndex: idx,
      updatedAt: new Date().toISOString()
    };
    progress.value = { ...(progress.value || {}), tours };
    await saveProgress(userId);
  };

  const markTourComplete = async (userId, tourId, version) => {
    if (!tourId) return;
    const tours = { ...(progress.value?.tours || {}) };
    tours[tourId] = {
      ...(tours[tourId] || {}),
      version,
      completed: true,
      stepIndex: 0,
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

  const getTipsState = () => {
    const tips = progress.value?.tips;
    return tips && typeof tips === 'object' ? tips : {};
  };

  const isTipHidden = (tipId) => {
    if (!tipId) return true;
    const st = getTipsState()[tipId];
    if (!st || typeof st !== 'object') return false;
    if (st.dismissed === true) return true;
    const snoozeUntil = st.snoozeUntil ? new Date(st.snoozeUntil) : null;
    if (snoozeUntil && snoozeUntil > new Date()) return true;
    return false;
  };

  const applyTipAction = async (userId, tipId, action) => {
    if (!tipId) return;
    const tips = { ...getTipsState() };
    const prev = tips[tipId] && typeof tips[tipId] === 'object' ? tips[tipId] : {};
    if (action === 'dismiss') {
      tips[tipId] = { ...prev, dismissed: true, dismissedAt: new Date().toISOString() };
    } else if (action === 'snooze') {
      const until = new Date();
      until.setDate(until.getDate() + 1);
      tips[tipId] = { ...prev, snoozeUntil: until.toISOString() };
    }
    progress.value = { ...(progress.value || {}), tips };
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
    getTourStepIndex,
    saveTourStepIndex,
    markTourComplete,
    resetTour,
    getTipsState,
    isTipHidden,
    applyTipAction
  };
});

