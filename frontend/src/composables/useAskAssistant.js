import { ref } from 'vue';

/** Shared open state so nav launcher + mobile menu can open the same assistant drawer. */
const open = ref(false);
/** True after click or composer focus — keeps hover-open from collapsing while typing. */
const pinned = ref(false);

export function useAskAssistant() {
  function show() {
    open.value = true;
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
  }

  function toggle() {
    if (open.value) {
      close();
    } else {
      pin();
    }
  }

  return { open, pinned, show, pin, interact, close, toggle };
}
