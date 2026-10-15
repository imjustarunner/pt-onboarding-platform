import { shallowRef } from 'vue';

// One player in App.vue; inline buttons can launch it without navigating away.
const request = shallowRef(null);
const modalHost = shallowRef(null);

export function useHowToVideo() {
  return {
    request,
    modalHost,
    openVideo: (id, opener) => { request.value = { id, opener }; }
  };
}
