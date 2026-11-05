import { onBeforeUnmount, onMounted, watch } from 'vue';
import api from '../services/api';

// Record only content visible for a moment in a focused window. Keep this
// independent of unread state: sends, bulk reads, and hides are not views.
export function useMessageViews({ threadId, container, messages, enabled }) {
  let observer;
  let generation = 0;
  let batchTimer;
  let retryTimer;
  let mounted = false;
  const observed = new Set();
  const visible = new Set();
  const timers = new Map();
  const recorded = new Set();
  const queued = new Set();
  const inFlight = new Set();
  const active = () => enabled.value && document.visibilityState === 'visible' && document.hasFocus()
    && !document.querySelector('[aria-modal="true"]');

  function cancelDwell(element) {
    clearTimeout(timers.get(element)); timers.delete(element);
  }
  function schedule(element) {
    const id = Number(element.dataset.pulseMessageId);
    if (!active() || !visible.has(element) || timers.has(element) || recorded.has(id) || inFlight.has(id) || queued.has(id)) return;
    timers.set(element, setTimeout(() => {
      timers.delete(element);
      if (!active() || !visible.has(element) || !element.isConnected) return;
      queued.add(id);
      clearTimeout(batchTimer); batchTimer = setTimeout(flush, 100);
    }, 800));
  }
  async function flush() {
    if (!active() || !threadId.value || !queued.size) return;
    const version = generation;
    const ids = [...queued].slice(0, 200);
    ids.forEach(id => { queued.delete(id); inFlight.add(id); });
    try {
      await api.post(`/chat/threads/${threadId.value}/views`, { messageIds: ids }, { skipGlobalLoading: true });
      if (version === generation) ids.forEach(id => recorded.add(id));
    } catch {
      // Retry later while visible. A missing migration must not interrupt chat.
      if (version === generation) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => visible.forEach(schedule), 15000);
      }
    } finally {
      if (version === generation) {
        ids.forEach(id => inFlight.delete(id));
        if (queued.size) { clearTimeout(batchTimer); batchTimer = setTimeout(flush, 100); }
      }
    }
  }
  function onActivityChange() {
    if (!active()) {
      timers.forEach(clearTimeout); timers.clear();
      queued.clear(); clearTimeout(batchTimer);
    } else visible.forEach(schedule);
  }
  function sync() {
    if (!mounted || !observer) return;
    const ids = new Set(messages.value.map(message => Number(message.id)));
    const elements = new Set(enabled.value ? [...(container.value?.querySelectorAll('[data-pulse-message-id]') || [])].filter(element => ids.has(Number(element.dataset.pulseMessageId))) : []);
    for (const element of observed) {
      if (!elements.has(element)) { observer.unobserve(element); observed.delete(element); visible.delete(element); cancelDwell(element); }
    }
    for (const element of elements) if (!observed.has(element)) { observed.add(element); observer.observe(element); }
  }
  function reset() {
    generation++;
    observer?.disconnect(); observed.clear(); visible.clear(); recorded.clear(); queued.clear(); inFlight.clear();
    timers.forEach(clearTimeout); timers.clear(); clearTimeout(batchTimer); clearTimeout(retryTimer);
    sync();
  }
  watch([threadId, enabled], reset, { flush: 'post' });
  watch([container, messages], sync, { flush: 'post' });
  onMounted(() => {
    mounted = true;
    if (typeof IntersectionObserver === 'undefined') return;
    // Use the viewport so an offscreen or clipped chat rail cannot register a view.
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!observed.has(entry.target)) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.1) { visible.add(entry.target); schedule(entry.target); }
        else { visible.delete(entry.target); cancelDwell(entry.target); }
      }
    }, { threshold: [0, 0.1] });
    document.addEventListener('visibilitychange', onActivityChange);
    document.addEventListener('focusin', onActivityChange);
    window.addEventListener('focus', onActivityChange);
    window.addEventListener('blur', onActivityChange);
    sync();
  });
  onBeforeUnmount(() => {
    mounted = false; reset();
    document.removeEventListener('visibilitychange', onActivityChange);
    document.removeEventListener('focusin', onActivityChange);
    window.removeEventListener('focus', onActivityChange);
    window.removeEventListener('blur', onActivityChange);
  });
}
