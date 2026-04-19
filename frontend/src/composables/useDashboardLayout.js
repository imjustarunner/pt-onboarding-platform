// Per-user persistent reordering for dashboard cards/sections.
// Reads/writes the order array in localStorage under a stable key,
// keyed by both the dashboard kind and the current user id so different
// users on the same browser keep their own preferences.
//
// Usage:
//   const layout = useDashboardLayout({
//     kind: 'season',
//     userId: computed(() => authStore.user?.id),
//     defaultOrder: ['activity', 'leaderboard', ...],
//   });
//   layout.editMode.value = true;
//   layout.moveUp('leaderboard');
//   <div :style="layout.orderStyle('leaderboard')"> ... </div>

import { ref, watch, computed, isRef, unref } from 'vue';

const STORAGE_PREFIX = 'sstcDashboardOrder';

const sanitizeKey = (value) => String(value || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');

const loadOrderFromStorage = (storageKey, fallback) => {
  if (typeof window === 'undefined') return [...fallback];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [...fallback];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...fallback];
    const seen = new Set();
    const merged = [];
    parsed.forEach((id) => {
      if (typeof id === 'string' && fallback.includes(id) && !seen.has(id)) {
        merged.push(id);
        seen.add(id);
      }
    });
    fallback.forEach((id) => {
      if (!seen.has(id)) merged.push(id);
    });
    return merged;
  } catch {
    return [...fallback];
  }
};

const saveOrderToStorage = (storageKey, order) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // Quota / privacy mode — best effort.
  }
};

export function useDashboardLayout({ kind = 'default', userId = null, defaultOrder = [] } = {}) {
  const fallback = Array.isArray(defaultOrder) ? [...defaultOrder] : [];
  const userIdRef = isRef(userId) ? userId : ref(userId);

  const storageKey = computed(() => `${STORAGE_PREFIX}:${sanitizeKey(kind)}:${sanitizeKey(unref(userIdRef))}`);

  const order = ref(loadOrderFromStorage(storageKey.value, fallback));
  const editMode = ref(false);

  watch(userIdRef, () => {
    order.value = loadOrderFromStorage(storageKey.value, fallback);
  });

  watch(
    order,
    (next) => {
      saveOrderToStorage(storageKey.value, next);
    },
    { deep: true }
  );

  const orderOf = (id) => {
    const idx = order.value.indexOf(id);
    return idx === -1 ? order.value.length + fallback.indexOf(id) : idx;
  };

  const orderStyle = (id) => ({ order: orderOf(id) });

  const moveUp = (id) => {
    const idx = order.value.indexOf(id);
    if (idx <= 0) return;
    const next = [...order.value];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    order.value = next;
  };

  const moveDown = (id) => {
    const idx = order.value.indexOf(id);
    if (idx === -1 || idx >= order.value.length - 1) return;
    const next = [...order.value];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    order.value = next;
  };

  const resetOrder = () => {
    order.value = [...fallback];
  };

  const isFirst = (id) => order.value.indexOf(id) === 0;
  const isLast = (id) => order.value.indexOf(id) === order.value.length - 1;

  return {
    order,
    editMode,
    orderOf,
    orderStyle,
    moveUp,
    moveDown,
    resetOrder,
    isFirst,
    isLast,
  };
}

export default useDashboardLayout;
