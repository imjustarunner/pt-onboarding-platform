import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Store for Momentum Stickies add-to-sticky requests from context menu or other UI.
 * The MomentumStickiesOverlay watches pendingAddText and handles creation.
 */
export const useMomentumStickiesStore = defineStore('momentumStickies', () => {
  const pendingAddText = ref(null);
  const expandOverlayRequest = ref(0);
  const createNewStickyRequest = ref(0);
  const pendingConvertList = ref(null);

  function triggerAddToSticky(text) {
    const t = String(text || '').trim();
    if (t) pendingAddText.value = t;
  }

  function clearPendingAdd() {
    pendingAddText.value = null;
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

  return {
    pendingAddText,
    expandOverlayRequest,
    createNewStickyRequest,
    pendingConvertList,
    triggerAddToSticky,
    clearPendingAdd,
    requestExpandOverlay,
    requestCreateNewSticky,
    convertListToSticky,
    clearPendingConvertList
  };
});
