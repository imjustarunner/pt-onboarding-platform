import { ref, watch, computed, unref, isRef } from 'vue';
import api from '../services/api';
import {
  DEFAULT_DOCUMENT_CATEGORY_ORDER,
  sanitizeCategoryOrder,
} from '../config/documentDisplayCategories';

const STORAGE_PREFIX = 'documentsCategoryOrder';

const loadLocal = (userId) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizeCategoryOrder(parsed) : null;
  } catch {
    return null;
  }
};

const saveLocal = (userId, order) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}:${userId}`, JSON.stringify(order));
  } catch {
    /* ignore */
  }
};

/**
 * Per-user document hub category order (persisted in user_preferences + localStorage fallback).
 */
export function useDocumentCategoryOrder(userId) {
  const userIdRef = isRef(userId) ? userId : ref(userId);
  const order = ref([...DEFAULT_DOCUMENT_CATEGORY_ORDER]);
  const loading = ref(false);
  const saving = ref(false);
  const editMode = ref(false);
  let saveTimer = null;

  const persist = async (nextOrder) => {
    const uid = unref(userIdRef);
    if (!uid) return;
    saving.value = true;
    saveLocal(uid, nextOrder);
    try {
      await api.put(`/users/${uid}/preferences`, {
        documents_category_order_json: nextOrder,
      });
    } catch (err) {
      console.warn('Failed to save document category order', err);
    } finally {
      saving.value = false;
    }
  };

  const scheduleSave = (nextOrder) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(nextOrder), 400);
  };

  const load = async () => {
    const uid = unref(userIdRef);
    if (!uid) {
      order.value = [...DEFAULT_DOCUMENT_CATEGORY_ORDER];
      return;
    }
    loading.value = true;
    const local = loadLocal(uid);
    if (local) order.value = local;

    try {
      const res = await api.get(`/users/${uid}/preferences`, { skipGlobalLoading: true });
      const remote = res.data?.documents_category_order_json;
      if (Array.isArray(remote) && remote.length) {
        order.value = sanitizeCategoryOrder(remote);
        saveLocal(uid, order.value);
      }
    } catch {
      /* keep local/default */
    } finally {
      loading.value = false;
    }
  };

  watch(
    userIdRef,
    () => {
      load();
    },
    { immediate: true }
  );

  watch(order, (next) => scheduleSave(next), { deep: true });

  const moveUp = (categoryId) => {
    const idx = order.value.indexOf(categoryId);
    if (idx <= 0) return;
    const next = [...order.value];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    order.value = next;
  };

  const moveDown = (categoryId) => {
    const idx = order.value.indexOf(categoryId);
    if (idx === -1 || idx >= order.value.length - 1) return;
    const next = [...order.value];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    order.value = next;
  };

  const resetOrder = () => {
    order.value = [...DEFAULT_DOCUMENT_CATEGORY_ORDER];
  };

  const isFirst = (id) => order.value.indexOf(id) === 0;
  const isLast = (id) => order.value.indexOf(id) === order.value.length - 1;

  const orderedCategoryIds = computed(() => order.value);

  return {
    order,
    orderedCategoryIds,
    loading,
    saving,
    editMode,
    moveUp,
    moveDown,
    resetOrder,
    isFirst,
    isLast,
    reload: load,
  };
}

export default useDocumentCategoryOrder;
