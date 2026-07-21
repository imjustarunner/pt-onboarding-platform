import { ref } from 'vue';

/** Shared open state so nav launcher + mobile menu can open the same assistant drawer. */
const open = ref(false);

export function useAskAssistant() {
  function show() {
    open.value = true;
  }

  function close() {
    open.value = false;
  }

  function toggle() {
    open.value = !open.value;
  }

  return { open, show, close, toggle };
}
