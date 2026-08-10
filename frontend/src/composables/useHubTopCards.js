/**
 * Rank hub orbit cards by the current user's page-visit activity.
 */
import { computed, ref, unref, watch } from 'vue';
import api from '../services/api.js';
import { rankHubCards } from '../utils/hubCardVisitMatch.js';

let _visitCache = null;
let _visitPending = null;

export function useHubTopCards(cardsSource, { limit = 5 } = {}) {
  const visitRows = ref(_visitCache ? [..._visitCache] : []);
  const loading = ref(!_visitCache);

  async function loadVisits() {
    if (_visitCache) {
      visitRows.value = [..._visitCache];
      loading.value = false;
      return;
    }
    if (_visitPending) {
      await _visitPending;
      visitRows.value = [...(_visitCache || [])];
      loading.value = false;
      return;
    }

    loading.value = true;
    _visitPending = api
      .get('/user-nav/path-visits', { params: { limit: 150 }, skipGlobalLoading: true })
      .then((res) => {
        _visitCache = res.data?.visits || [];
        visitRows.value = [..._visitCache];
      })
      .catch((err) => {
        console.warn('[useHubTopCards] failed to load path visits:', err);
        _visitCache = [];
        visitRows.value = [];
      })
      .finally(() => {
        loading.value = false;
        _visitPending = null;
      });
    await _visitPending;
  }

  loadVisits();

  const rankedCards = computed(() => rankHubCards(unref(cardsSource) || [], visitRows.value));

  const topCards = computed(() =>
    rankedCards.value.filter((c) => c.visitCount > 0).slice(0, limit)
  );

  const visitCountByCardId = computed(() => {
    const map = new Map();
    for (const card of rankedCards.value) {
      map.set(card.id, card.visitCount || 0);
    }
    return map;
  });

  function sortCardsByVisits(cards = []) {
    const order = visitCountByCardId.value;
    return [...cards].sort((a, b) => {
      const diff = (order.get(b.id) || 0) - (order.get(a.id) || 0);
      if (diff !== 0) return diff;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  }

  watch(
    () => unref(cardsSource)?.length,
    () => {
      /* re-rank when visible hub cards change */
    }
  );

  return {
    rankedCards,
    topCards,
    visitCountByCardId,
    sortCardsByVisits,
    loading,
    reload: () => {
      _visitCache = null;
      return loadVisits();
    },
  };
}
