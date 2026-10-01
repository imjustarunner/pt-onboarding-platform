import { ref, onMounted, onBeforeUnmount } from 'vue';

export function usePortalIdle({ timeoutMs = 15 * 60 * 1000 } = {}) {
  const locked = ref(false);
  let lastActivity = Date.now(), timer;
  const events = ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart'];
  const documents = new Set();
  const touch = () => { if (!locked.value) lastActivity = Date.now(); };
  const attach = doc => {
    if (!doc || documents.has(doc)) return;
    events.forEach(event => doc.addEventListener(event, touch, { capture: true, passive: true }));
    documents.add(doc);
  };
  onMounted(() => {
    attach(document);
    timer = setInterval(() => {
      for (const frame of document.querySelectorAll('iframe')) {
        try { attach(frame.contentDocument); } catch { /* Third-party frames remain isolated. */ }
      }
      if (document.visibilityState === 'visible' && document.hasFocus() && [...document.querySelectorAll('video')].some(video => !video.paused && !video.ended)) touch();
      if (Date.now() - lastActivity >= timeoutMs) locked.value = true;
    }, 10000);
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    for (const doc of documents) events.forEach(event => doc.removeEventListener(event, touch, true));
  });
  return { locked, resume: () => { lastActivity = Date.now(); locked.value = false; } };
}
