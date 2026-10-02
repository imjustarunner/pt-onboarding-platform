import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import api from '../services/api';
import { collectRenderedSearchTargets, destinationKey, searchProfileContent } from '../navigation/profileContentSearch.js';

export function useProfileContentSearch({ root, scopeKey, userId, activeTarget, baseTargets, canLoadFields }) {
  const fields = ref([]), categories = ref([]), loading = ref(false), loadError = ref('');
  const snapshots = ref(new Map());
  let generation = 0, loaded = false, observer, timer, disposed = false;
  const scan = () => {
    if (!root.value || disposed) return;
    const route = activeTarget.value;
    if (!route?.tabId) return;
    const next = new Map(snapshots.value);
    next.set(destinationKey({tabId:route.tabId,mySection:route.mySection,clinicalSubTab:route.clinicalSubTab}), collectRenderedSearchTargets(root.value, route));
    snapshots.value = next;
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 180); };
  watch(scopeKey, () => { generation++; loaded = false; fields.value = []; categories.value = []; snapshots.value = new Map(); loadError.value = ''; loading.value = false; }, { immediate: true });
  watch([root, activeTarget], async () => {
    observer?.disconnect();
    await nextTick();
    if (disposed || !root.value) return;
    observer = new MutationObserver(records => {
      if (records.some(r => !(r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('[data-profile-search]'))) schedule();
    });
    observer.observe(root.value, { subtree: true, childList: true, characterData: true });
    schedule();
  }, { flush: 'post', immediate: true });
  async function load() {
    scan();
    if (!canLoadFields.value || !userId.value || loaded || loading.value) return;
    const request = generation;
    loading.value = true; loadError.value = '';
    try {
      const [f,c] = await Promise.allSettled([
        api.get(`/users/${userId.value}/user-info`, { params: { assignedOrHasValueOnly: true }, skipGlobalLoading: true }),
        api.get('/user-info-categories', { skipGlobalLoading: true })
      ]);
      if (request !== generation || disposed) return;
      if (f.status === 'fulfilled') { fields.value = Array.isArray(f.value.data) ? f.value.data : []; loaded = true; }
      else loadError.value = 'Some profile content could not be loaded. Page and section search is still available.';
      categories.value = c.status === 'fulfilled' && Array.isArray(c.value.data) ? c.value.data : [];
    } finally { if (request === generation) loading.value = false; }
  }
  const targets = computed(() => {
    const allowed = new Set(baseTargets.value.map(t => t.tabId));
    const mySections = new Set(baseTargets.value.filter(t => t.tabId === 'my').map(t => t.mySection).filter(Boolean));
    return [...baseTargets.value, ...[...snapshots.value.values()].flat().filter(t => allowed.has(t.tabId) && (!t.mySection || mySections.has(t.mySection)))];
  });
  onBeforeUnmount(() => { disposed = true; generation++; observer?.disconnect(); clearTimeout(timer); });
  return { fields, categories, targets, loading, loadError, load, scan };
}

// Wait for lazy tabs, reveal collapsed details, then focus the actual matching section.
export async function revealProfileSearchTarget(root, hit, { isCurrent = () => true, userId = null } = {}) {
  await nextTick();
  const findContent = !hit.sectionId && hit.matchKind === 'Content match' && hit.matchedQuery;
  if (!hit.sectionId && !hit.fieldId && !hit.categoryKey && !findContent) { root.value?.querySelector('.tab-content, .my-panel')?.scrollIntoView({behavior:'smooth',block:'start'}); return true; }
  for (let attempt = 0; attempt < 50 && isCurrent(); attempt++) {
    if (hit.fieldId || hit.categoryKey) window.dispatchEvent(new CustomEvent('profile-search-field', { detail: { ...hit, userId } }));
    const found = findContent ? searchProfileContent(hit.matchedQuery, collectRenderedSearchTargets(root.value, hit)).find(t=>t.sectionId) : null;
    const sectionId = found?.sectionId || hit.sectionId || '';
    const el = root.value?.querySelector(`[id="${CSS.escape(sectionId)}"]`);
    if (el) {
      for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      if (el.getClientRects().length) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true });
        el.classList.add('profile-search-highlight');
        setTimeout(() => el.classList.remove('profile-search-highlight'), 2200);
        return true;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  return false;
}
