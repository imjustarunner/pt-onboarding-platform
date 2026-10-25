import { computed, ref, unref, watch } from 'vue';

// Store layout choices only; never store dashboard records or counts.
export function useDashboardCardState({ kind, userId, agencyId, cardIds, persist = true }) {
  const scope = computed(() => `${unref(userId) || ''}:${unref(agencyId) || ''}`);
  const collapsedCards = ref([]), hiddenCards = ref([]);
  const key = type => `${unref(kind)}-${type}:${scope.value}`;
  function read(type) {
    try {
      const saved = JSON.parse(localStorage.getItem(key(type)) || '[]');
      return Array.isArray(saved) ? [...new Set(saved.filter(id => cardIds.includes(id)))] : [];
    } catch { return []; }
  }
  watch([scope, () => unref(kind), () => unref(persist)], () => {
    collapsedCards.value = unref(persist) ? read('collapsed') : [];
    hiddenCards.value = unref(persist) ? read('hidden') : [];
  }, { immediate: true });
  function save(type, values) {
    if (!unref(persist)) return;
    try { localStorage.setItem(key(type), JSON.stringify(values)); } catch { /* Optional browser preferences. */ }
  }
  function setCollapsed(id, collapsed) {
    if (!cardIds.includes(id)) return;
    collapsedCards.value = collapsed ? [...new Set([...collapsedCards.value, id])] : collapsedCards.value.filter(key => key !== id);
    save('collapsed', collapsedCards.value);
  }
  function toggleCard(id) {
    if (!cardIds.includes(id)) return;
    hiddenCards.value = hiddenCards.value.includes(id) ? hiddenCards.value.filter(key => key !== id) : [...hiddenCards.value, id];
    save('hidden', hiddenCards.value);
  }
  function resetCards() {
    collapsedCards.value = []; hiddenCards.value = [];
    save('collapsed', []); save('hidden', []);
  }
  return { collapsedCards, hiddenCards, setCollapsed, toggleCard, resetCards };
}
