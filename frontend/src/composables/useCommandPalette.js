import { ref } from 'vue';

/** @typedef {'nav' | 'ask' | null} CommandPaletteMode */

const open = ref(false);
/** @type {import('vue').Ref<CommandPaletteMode>} */
const mode = ref(null);
const seedQuery = ref('');
// Unsubmitted text lives only in this tab's memory. Keep it through normal
// timedown/resume and component remounts, never across an actor/tenant/login.
const draftQuery = ref('');
let boundContext = null;

export function useCommandPalette() {
  function openPalette(nextMode = null, query) {
    mode.value = nextMode;
    seedQuery.value = query === undefined ? '' : String(query || '');
    if (query !== undefined) draftQuery.value = seedQuery.value;
    open.value = true;
  }

  function closePalette({discardQuery=false}={}) {
    open.value = false;
    mode.value = null;
    seedQuery.value = '';
    if (discardQuery) draftQuery.value = '';
  }

  function bindContext(actorId,agencyId,credential) {
    const key=`${Number(actorId)||0}:${Number(agencyId)||0}`;
    if (!Number(actorId) || !boundContext || boundContext.key!==key || boundContext.credential!==credential) {
      closePalette({discardQuery:true});
    }
    // Private equality marker only: never exposed as a Vue prop/key or persisted.
    boundContext={key,credential};
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
    draftQuery,
    bindContext,
    openPalette,
    closePalette,
    togglePalette,
    setMode
  };
}
