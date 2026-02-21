import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Store for Momentum Stickies add-to-sticky requests from context menu or other UI.
 * The MomentumStickiesOverlay watches pendingAddText and handles creation.
 */
export const useMomentumStickiesStore = defineStore('momentumStickies', () => {
  const stickies = ref([]);
  const pendingAddText = ref(null);
  const pendingAddToSticky = ref(null); // { text: string, stickyId: number | null }
  const expandOverlayRequest = ref(0);
  const createNewStickyRequest = ref(0);
  const pendingConvertList = ref(null);

  function triggerAddToSticky(text, stickyId = null) {
    const t = String(text || '').trim();
    if (!t) return;
    pendingAddToSticky.value = { text: t, stickyId };
  }

  const pendingAddMultipleToSticky = ref(null); // { items: string[], stickyId: number | null }

  function triggerAddMultipleToSticky(items, stickyId = null) {
    if (!Array.isArray(items) || items.length === 0) return;
    const trimmed = items.map((t) => String(t || '').trim()).filter(Boolean);
    if (trimmed.length === 0) return;
    pendingAddMultipleToSticky.value = { items: trimmed, stickyId };
  }

  function clearPendingAddMultiple() {
    pendingAddMultipleToSticky.value = null;
  }

  function clearPendingAdd() {
    pendingAddText.value = null;
    pendingAddToSticky.value = null;
  }

  function requestExpandOverlay() {
    expandOverlayRequest.value += 1;
  }

  function requestCreateNewSticky() {
    createNewStickyRequest.value += 1;
  }

  function convertListToSticky(items) {
    if (Array.isArray(items) && items.length > 0) {
      pendingConvertList.value = items;
    }
  }

  function clearPendingConvertList() {
    pendingConvertList.value = null;
  }

  function setStickies(list) {
    stickies.value = Array.isArray(list) ? list : [];
  }

  return {
    stickies,
    setStickies,
    pendingAddText,
    pendingAddToSticky,
    pendingAddMultipleToSticky,
    expandOverlayRequest,
    createNewStickyRequest,
    pendingConvertList,
    triggerAddToSticky,
    triggerAddMultipleToSticky,
    clearPendingAdd,
    clearPendingAddMultiple,
    requestExpandOverlay,
    requestCreateNewSticky,
    convertListToSticky,
    clearPendingConvertList
  };
});
