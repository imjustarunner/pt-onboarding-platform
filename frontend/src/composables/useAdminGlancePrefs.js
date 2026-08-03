import { ref, watch, computed, isRef, unref } from 'vue';
import api from '../services/api';

export const DEFAULT_TENANT_GLANCE_ORDER = Object.freeze([
  'support_tickets',
  'tasks',
  'messages',
  'late_notes',
  'applications',
  'payroll',
  'escalations'
]);

export const DEFAULT_OPERATIONS_GLANCE_ORDER = Object.freeze([
  'office_requests',
  'new_hires',
  'in_onboarding',
  'completed_onboarding',
  'messages',
  'training'
]);

export const GLANCE_CARD_LABELS = Object.freeze({
  support_tickets: 'Support Tickets',
  tasks: 'Tasks',
  messages: 'Messages',
  late_notes: 'Late Notes',
  applications: 'New Applications',
  payroll: 'Payroll Submissions',
  escalations: 'Escalations',
  office_requests: 'Office Approvals',
  new_hires: 'New Applications',
  in_onboarding: 'In Onboarding',
  completed_onboarding: 'Completed Onboarding',
  training: 'Training Modules'
});

const sanitizeKey = (value) => String(value || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');

const mergeOrderWithDefaults = (order, defaults) => {
  const allowed = new Set(defaults);
  const seen = new Set();
  const merged = [];
  for (const key of order || []) {
    const k = String(key);
    if (!allowed.has(k) || seen.has(k)) continue;
    merged.push(k);
    seen.add(k);
  }
  for (const key of defaults) {
    if (!seen.has(key)) merged.push(key);
  }
  return merged;
};

const scopedPart = (namespace, agencyId) => {
  const agencyPart = agencyId ? `agency-${sanitizeKey(agencyId)}` : 'platform';
  return `${namespace}:${agencyPart}`;
};

const buildStorageKey = (namespace, agencyId, userId) => {
  return `adminDashboardGlanceOrder:${scopedPart(namespace, agencyId)}:${sanitizeKey(userId)}`;
};

const legacyStorageKeys = (namespace, agencyId, userId) => {
  const uid = sanitizeKey(userId);
  const keys = [];
  if (agencyId) {
    keys.push(`adminDashboardGlanceOrder:${namespace}:platform:${uid}`);
  }
  keys.push(`adminDashboardGlanceOrder:${namespace}:${uid}`);
  return keys;
};

const loadOrderFromRaw = (raw, defaults) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return mergeOrderWithDefaults(parsed.map(String), defaults);
  } catch {
    return null;
  }
};

const loadOrderFromLocal = (namespace, agencyId, userId, defaults) => {
  if (typeof window === 'undefined') return [...defaults];
  const primaryKey = buildStorageKey(namespace, agencyId, userId);
  try {
    let loaded = loadOrderFromRaw(window.localStorage.getItem(primaryKey), defaults);
    if (loaded) return loaded;

    for (const legacyKey of legacyStorageKeys(namespace, agencyId, userId)) {
      const legacy = loadOrderFromRaw(window.localStorage.getItem(legacyKey), defaults);
      if (legacy) {
        try {
          window.localStorage.setItem(primaryKey, JSON.stringify(legacy));
        } catch {
          // ignore
        }
        return legacy;
      }
    }
  } catch {
    // ignore
  }
  return [...defaults];
};

const saveOrderToLocal = (namespace, agencyId, userId, order) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      buildStorageKey(namespace, agencyId, userId),
      JSON.stringify(order)
    );
  } catch {
    // ignore
  }
};

const parseRemoteGlanceMap = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return {};
};

const resolveApiUserId = (userId) => {
  if (userId == null || userId === '') return null;
  const n = Number(userId);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * @param {{
 *   userId?: import('vue').Ref|string|number|null,
 *   agencyId?: import('vue').Ref|string|number|null,
 *   namespace?: string,
 *   defaults?: readonly string[]
 * }} opts
 */
export function useAdminGlancePrefs({
  userId = null,
  agencyId = null,
  namespace = 'tenant',
  defaults = DEFAULT_TENANT_GLANCE_ORDER
} = {}) {
  const userIdRef = isRef(userId) ? userId : ref(userId);
  const agencyIdRef = isRef(agencyId) ? agencyId : ref(agencyId);
  const namespaceRef = ref(namespace);
  const defaultsRef = [...defaults];

  const storageKey = computed(() => {
    const ns = String(unref(namespaceRef) || 'tenant');
    const agency = unref(agencyIdRef);
    const uid = unref(userIdRef);
    return buildStorageKey(ns, agency, uid);
  });

  const scopeKey = computed(() => {
    const ns = String(unref(namespaceRef) || 'tenant');
    const agency = unref(agencyIdRef);
    return scopedPart(ns, agency);
  });

  const order = ref([...defaultsRef]);
  const ready = ref(false);
  const loading = ref(false);
  const saving = ref(false);
  let saveTimer = null;
  let remoteGlanceMap = {};

  const persistRemote = async (nextOrder) => {
    const apiUserId = resolveApiUserId(unref(userIdRef));
    if (!apiUserId) return;
    saving.value = true;
    const merged = { ...remoteGlanceMap, [scopeKey.value]: [...nextOrder] };
    try {
      await api.put(`/users/${apiUserId}/preferences`, {
        dashboard_glance_order_json: merged
      });
      remoteGlanceMap = merged;
    } catch (err) {
      console.warn('Failed to save At a Glance order', err);
    } finally {
      saving.value = false;
    }
  };

  const scheduleRemoteSave = (nextOrder) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistRemote(nextOrder), 400);
  };

  const loadPrefs = async () => {
    const uid = unref(userIdRef);
    const agency = unref(agencyIdRef);
    const ns = String(unref(namespaceRef) || 'tenant');
    ready.value = false;
    loading.value = true;

    order.value = loadOrderFromLocal(ns, agency, uid, defaultsRef);

    const apiUserId = resolveApiUserId(uid);
    if (apiUserId) {
      try {
        const res = await api.get(`/users/${apiUserId}/preferences`, { skipGlobalLoading: true });
        remoteGlanceMap = parseRemoteGlanceMap(res.data?.dashboard_glance_order_json);
        const remoteOrder = remoteGlanceMap[scopeKey.value];
        if (Array.isArray(remoteOrder) && remoteOrder.length) {
          order.value = mergeOrderWithDefaults(remoteOrder.map(String), defaultsRef);
          saveOrderToLocal(ns, agency, uid, order.value);
        }
      } catch {
        /* keep local/default */
      }
    }

    loading.value = false;
    ready.value = true;
  };

  watch([userIdRef, agencyIdRef, namespaceRef], () => {
    loadPrefs();
  }, { immediate: true });

  watch(order, (next) => {
    if (!ready.value) return;
    const uid = unref(userIdRef);
    const agency = unref(agencyIdRef);
    const ns = String(unref(namespaceRef) || 'tenant');
    saveOrderToLocal(ns, agency, uid, next);
    scheduleRemoteSave(next);
  }, { deep: true });

  const applyOrder = (cards, { includeEscalations = true } = {}) => {
    const byKey = new Map((cards || []).map((card) => [card.key, card]));
    const allowed = new Set([...byKey.keys()]);
    if (!includeEscalations) allowed.delete('escalations');

    const next = [];
    const seen = new Set();
    for (const key of order.value || []) {
      if (!allowed.has(key) || seen.has(key)) continue;
      next.push(byKey.get(key));
      seen.add(key);
    }
    for (const card of cards || []) {
      if (!seen.has(card.key) && allowed.has(card.key)) next.push(card);
    }
    return next;
  };

  const syncAvailableKeys = (keys) => {
    if (!ready.value) return;
    const allowed = new Set((keys || []).map(String));
    const merged = [];
    const seen = new Set();
    for (const key of order.value || []) {
      if (!allowed.has(key) || seen.has(key)) continue;
      merged.push(key);
      seen.add(key);
    }
    for (const key of keys || []) {
      const k = String(key);
      if (!seen.has(k)) {
        merged.push(k);
        seen.add(k);
      }
    }
    if (merged.join('|') !== (order.value || []).join('|')) {
      order.value = merged;
    }
  };

  const moveUp = (key) => {
    const idx = order.value.indexOf(key);
    if (idx <= 0) return;
    const next = [...order.value];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    order.value = next;
  };

  const moveDown = (key) => {
    const idx = order.value.indexOf(key);
    if (idx < 0 || idx >= order.value.length - 1) return;
    const next = [...order.value];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    order.value = next;
  };

  const resetOrder = () => {
    order.value = [...defaultsRef];
  };

  const isFirst = (key) => order.value.indexOf(key) <= 0;
  const isLast = (key) => {
    const idx = order.value.indexOf(key);
    return idx < 0 || idx >= order.value.length - 1;
  };

  const labelsForOrder = computed(() =>
    (order.value || []).map((key) => ({
      key,
      label: GLANCE_CARD_LABELS[key] || key
    }))
  );

  return {
    order,
    ready,
    loading,
    saving,
    applyOrder,
    syncAvailableKeys,
    moveUp,
    moveDown,
    resetOrder,
    isFirst,
    isLast,
    labelsForOrder,
    reload: loadPrefs
  };
}
