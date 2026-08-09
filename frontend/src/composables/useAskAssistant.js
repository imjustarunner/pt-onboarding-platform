import { ref } from 'vue';

/** Shared open state so nav launcher + mobile menu can open the same assistant drawer. */
const open = ref(false);
/** True after click or composer focus — keeps hover-open from collapsing while typing. */
const pinned = ref(false);
/** 'nav' | 'ask' | null — which surface the assistant should emphasize */
const surfaceMode = ref(null);
const seedPrompt = ref('');

export function useAskAssistant() {
  function show(opts = {}) {
    if (opts.mode) surfaceMode.value = opts.mode;
    if (opts.prompt) seedPrompt.value = String(opts.prompt);
    open.value = true;
    pinned.value = true;
  }

  function pin() {
    pinned.value = true;
    open.value = true;
  }

  function interact() {
    pinned.value = true;
  }

  function close() {
    pinned.value = false;
    open.value = false;
    surfaceMode.value = null;
    seedPrompt.value = '';
  }

  function toggle() {
    if (open.value) {
      close();
    } else {
      pin();
    }
  }

  function openAsk(prompt = '', mode = 'ask') {
    surfaceMode.value = mode;
    seedPrompt.value = String(prompt || '');
    pinned.value = true;
    open.value = true;
  }

  function clearSeed() {
    seedPrompt.value = '';
  }

  return {
    open,
    pinned,
    surfaceMode,
    seedPrompt,
    show,
    pin,
    interact,
    close,
    toggle,
    openAsk,
    clearSeed
  };
}
