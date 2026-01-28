import { computed, ref } from 'vue';

// A tiny global loading manager that works anywhere (stores, services, components).
// - Use `begin()`/`end()` for manual tracking (e.g., image preloads).
// - Axios interceptor hooks into this so the global overlay stays up until API calls finish.

let _seq = 0;
const _pendingIds = ref(new Set());

const loadingText = ref('Loading…');

export const isLoading = computed(() => _pendingIds.value.size > 0);

export function setLoadingText(text) {
  const t = String(text || '').trim();
  if (t) loadingText.value = t;
}

export function begin(text) {
  if (text) setLoadingText(text);
  const id = ++_seq;
  const next = new Set(_pendingIds.value);
  next.add(id);
  _pendingIds.value = next;
  return id;
}

export function end(id) {
  const next = new Set(_pendingIds.value);
  next.delete(id);
  _pendingIds.value = next;
}

export function trackPromise(promise, text) {
  const id = begin(text);
  return Promise.resolve(promise).finally(() => {
    end(id);
  });
}

export function getLoadingTextRef() {
  return loadingText;
}

