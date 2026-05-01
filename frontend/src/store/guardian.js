import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'guardian_selected_child_id';

export const useGuardianStore = defineStore('guardian', () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  const selectedChildId = ref(raw ? Number(raw) : null);

  function setSelectedChild(clientId) {
    const id = clientId ? Number(clientId) : null;
    selectedChildId.value = id;
    if (id) {
      localStorage.setItem(STORAGE_KEY, String(id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function clearSelectedChild() {
    setSelectedChild(null);
  }

  // Sync to storage whenever it changes (covers any direct assignments)
  watch(selectedChildId, (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, String(id));
    else localStorage.removeItem(STORAGE_KEY);
  });

  return { selectedChildId, setSelectedChild, clearSelectedChild };
});
