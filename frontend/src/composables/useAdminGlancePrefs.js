import { ref, watch, computed, isRef, unref } from 'vue';

export const DEFAULT_TENANT_GLANCE_ORDER = Object.freeze([
  'support_tickets',
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

const loadOrder = (storageKey, defaults) => {
  if (typeof window === 'undefined') return [...defaults];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [...defaults];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...defaults];
    return parsed.map(String);
  } catch {
    return [...defaults];
  }
};

const saveOrder = (storageKey, order) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // ignore
  }
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
  const defaultsRef = [...defaults];

  const storageKey = computed(() => {
    const agencyPart = unref(agencyIdRef) ? `agency-${sanitizeKey(unref(agencyIdRef))}` : 'platform';
    return `adminDashboardGlanceOrder:${namespace}:${agencyPart}:${sanitizeKey(unref(userIdRef))}`;
  });

  const order = ref(loadOrder(storageKey.value, defaultsRef));

  watch([userIdRef, agencyIdRef], () => {
    order.value = loadOrder(storageKey.value, defaultsRef);
  });

  watch(order, (next) => {
    saveOrder(storageKey.value, next);
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
    order.value = merged;
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
    applyOrder,
    syncAvailableKeys,
    moveUp,
    moveDown,
    resetOrder,
    isFirst,
    isLast,
    labelsForOrder
  };
}
