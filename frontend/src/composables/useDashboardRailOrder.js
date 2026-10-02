import { ref, unref, watch } from 'vue';
import api from '../services/api';

const normalize = (value) => {
  try {
    const rows = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(rows) ? [...new Set(rows.filter((id) => typeof id === 'string'))] : [];
  } catch { return []; }
};

export function useDashboardRailOrder(userId) {
  const order = ref([]);
  const editing = ref(false);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');
  let savedOrder = [];
  let generation = 0;
  const localKey = (id) => `dashboard.railOrder.v1:${id}`;

  watch(userId, async (id) => {
    const run = ++generation;
    editing.value = false;
    error.value = '';
    try { order.value = id ? normalize(localStorage.getItem(localKey(id))) : []; }
    catch { order.value = []; }
    savedOrder = [...order.value];
    loading.value = !!id;
    if (!id) return;
    try {
      const res = await api.get(`/users/${id}/preferences`, { skipGlobalLoading: true });
      if (run !== generation) return;
      if (res.data?.dashboard_rail_order_json != null) {
        order.value = normalize(res.data.dashboard_rail_order_json);
        savedOrder = [...order.value];
      }
    } catch {
      // Keep this person's cached order if preferences are temporarily unavailable.
    } finally {
      if (run === generation) loading.value = false;
    }
  }, { immediate: true });

  const applyOrder = (cards) => {
    const byId = new Map(cards.map((card) => [String(card.id), card]));
    const sorted = [];
    for (const id of order.value) {
      if (byId.has(id)) { sorted.push(byId.get(id)); byId.delete(id); }
    }
    return [...sorted, ...byId.values()];
  };

  const move = (id, delta, siblings) => {
    if (!editing.value || saving.value) return;
    const ids = siblings.map((card) => String(card.id));
    const index = ids.indexOf(String(id));
    const adjacent = ids[index + delta];
    if (index < 0 || !adjacent) return;
    // Preserve entries hidden by role/tenant and move only within this group.
    const next = [...new Set([...order.value, ...ids])];
    const a = next.indexOf(String(id));
    const b = next.indexOf(adjacent);
    [next[a], next[b]] = [next[b], next[a]];
    order.value = next;
  };

  const start = () => { if (!loading.value) { editing.value = true; error.value = ''; } };
  const cancel = () => { if (!saving.value) { order.value = [...savedOrder]; editing.value = false; error.value = ''; } };
  const reset = () => { if (!saving.value) order.value = []; };
  const save = async () => {
    const id = unref(userId);
    if (!id || saving.value) return;
    const run = generation;
    const next = [...order.value];
    saving.value = true;
    error.value = '';
    try {
      await api.put(`/users/${id}/preferences`, { dashboard_rail_order_json: next }, { skipGlobalLoading: true });
      try { localStorage.setItem(localKey(id), JSON.stringify(next)); } catch { /* optional cache */ }
      if (run !== generation) return;
      savedOrder = next;
      editing.value = false;
    } catch {
      if (run === generation) error.value = 'Could not save your layout. Please try again.';
    } finally {
      saving.value = false;
    }
  };

  return { editing, loading, saving, error, applyOrder, move, start, cancel, reset, save };
}
