import { ref } from 'vue';

/** @typedef {'nav' | 'ask' | null} CommandPaletteMode */

const open = ref(false);
/** @type {import('vue').Ref<CommandPaletteMode>} */
const mode = ref(null);
const seedQuery = ref('');

export function useCommandPalette() {
  function openPalette(nextMode = null, query = '') {
    mode.value = nextMode;
    seedQuery.value = String(query || '');
    open.value = true;
  }

  function closePalette() {
    open.value = false;
    mode.value = null;
    seedQuery.value = '';
  }

  function togglePalette() {
    if (open.value) closePalette();
    else openPalette(null);
  }

  function setMode(nextMode) {
    mode.value = nextMode;
  }

  return {
    open,
    mode,
    seedQuery,
    openPalette,
    closePalette,
    togglePalette,
    setMode
  };
}
