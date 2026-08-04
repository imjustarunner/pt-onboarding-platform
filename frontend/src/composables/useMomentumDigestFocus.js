import { ref, computed } from 'vue';
import api from '../services/api';

const DIGEST_SNOOZED_KEY = 'momentum_digest_snoozed';
const MAX_FOCUS_ITEMS = 5;

/**
 * Lightweight Today’s Focus digest for Overview (and reusable snooze/act helpers).
 */
export function useMomentumDigestFocus({ userId, agencyId } = {}) {
  const loading = ref(false);
  const items = ref([]);
  const actingKey = ref(null);
  const snoozed = ref(new Set(JSON.parse(sessionStorage.getItem(DIGEST_SNOOZED_KEY) || '[]')));

  const visibleItems = computed(() =>
    (items.value || []).filter((i) => i?.label && !snoozed.value.has(i.label))
  );

  const displayItems = computed(() => visibleItems.value.slice(0, MAX_FOCUS_ITEMS));

  const moreCount = computed(() =>
    Math.max(0, visibleItems.value.length - MAX_FOCUS_ITEMS)
  );

  const progressPct = computed(() => {
    const total = items.value.length;
    if (!total) return 100;
    const done = items.value.filter((i) => i._done || snoozed.value.has(i.label)).length;
    return Math.round((done / total) * 100);
  });

  function snooze(label) {
    const next = new Set(snoozed.value);
    next.add(label);
    snoozed.value = next;
    sessionStorage.setItem(DIGEST_SNOOZED_KEY, JSON.stringify([...next]));
  }

  function canAct(item) {
    if (!item) return false;
    if (item.source === 'task' && item.task_id && item.task_type === 'custom') return true;
    if (item.source === 'sticky' && item.entry_id && item.sticky_id) return true;
    return false;
  }

  async function act(item) {
    if (!canAct(item)) return;
    const uid = typeof userId === 'function' ? userId() : userId?.value ?? userId;
    actingKey.value = item.label;
    try {
      if (item.source === 'task') {
        await api.delete(`/me/tasks/${item.task_id}`, { skipGlobalLoading: true });
      } else if (item.source === 'sticky') {
        await api.patch(
          `/users/${uid}/momentum-stickies/${item.sticky_id}/entries/${item.entry_id}`,
          { is_checked: true },
          { skipGlobalLoading: true }
        );
      }
      item._done = true;
      await fetch();
    } catch (e) {
      console.error('Focus act failed', e);
    } finally {
      actingKey.value = null;
    }
  }

  async function fetch() {
    const uid = typeof userId === 'function' ? userId() : userId?.value ?? userId;
    if (!uid) return;
    loading.value = true;
    try {
      const aid = typeof agencyId === 'function' ? agencyId() : agencyId?.value ?? agencyId;
      const [tasksRes, digestRes, stickiesRes] = await Promise.all([
        api.get('/tasks', { params: { view: 'assigned' }, skipGlobalLoading: true }).catch(() => ({ data: [] })),
        api.get(`/users/${uid}/momentum-digest`, {
          params: { agencyId: aid || undefined },
          skipGlobalLoading: true
        }).catch(() => ({ data: null })),
        api.get(`/users/${uid}/momentum-stickies`, { skipGlobalLoading: true }).catch(() => ({ data: [] }))
      ]);

      const out = [];
      const digest = digestRes?.data || {};
      for (const label of digest.topFocus || []) {
        const text = typeof label === 'string' ? label : label?.label;
        if (text) out.push({ label: text, source: 'gemini', tags: ['Focus', 'Today'] });
      }
      for (const label of digest.alsoOnRadar || []) {
        const text = typeof label === 'string' ? label : label?.label;
        if (text && !out.some((i) => i.label === text)) {
          out.push({ label: text, source: 'gemini', tags: ['Focus', 'Today'] });
        }
      }

      const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      for (const t of tasks) {
        if (t.status === 'completed' || t.status === 'overridden') continue;
        if (out.length >= MAX_FOCUS_ITEMS) break;
        const label = t.title || 'Task';
        if (out.some((i) => i.label === label)) continue;
        out.push({
          label,
          source: 'task',
          task_id: t.id,
          task_type: t.task_type,
          tags: [String(t.task_type || 'Task'), 'Today']
        });
      }

      const stickies = Array.isArray(stickiesRes.data) ? stickiesRes.data : [];
      for (const s of stickies) {
        for (const e of s.entries || s.Entries || []) {
          if (e.is_checked || e.isChecked) continue;
          if (out.length >= MAX_FOCUS_ITEMS) break;
          const label = e.text || e.content || e.title;
          if (!label || out.some((i) => i.label === label)) continue;
          out.push({
            label,
            source: 'sticky',
            sticky_id: s.id,
            entry_id: e.id,
            tags: ['Sticky', 'Today']
          });
        }
      }

      items.value = out.slice(0, MAX_FOCUS_ITEMS);
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    items,
    visibleItems,
    displayItems,
    moreCount,
    progressPct,
    actingKey,
    snooze,
    canAct,
    act,
    fetch
  };
}
