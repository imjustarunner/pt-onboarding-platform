import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import api from '../services/api';

// Estimated engagement only. Independent of payroll and course completion.
export function useDocumentAnalytics(context, { http = api, root = ref(null), activeElement = () => root.value } = {}) {
  let current = null, interval, lastInteraction = Date.now(), mounted = false;
  const status = ref('off');
  const visible = () => {
    const element = activeElement(), rect = element?.getBoundingClientRect?.();
    const inView = !rect || (rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight);
    return inView && document.visibilityState === 'visible' && document.hasFocus() && Date.now() - lastInteraction < 60000;
  };
  function send(type = 'heartbeat', extra = {}, forceInactive = false) {
    const session = current;
    if (!session) return Promise.resolve(false);
    const payload = { agencyId: session.agencyId, sessionId: session.id, sequence: ++session.sequence, type, active: !forceInactive && visible(), sectionSlug: session.section, ...extra };
    session.queue = session.queue.then(async () => {
      if (!session.started) return false;
      try { await http.post(`${session.base}/events`, payload, { skipGlobalLoading: true }); return true; }
      catch { status.value = 'unavailable'; return false; }
    });
    return session.queue;
  }
  function interact(event) { if (!root.value || root.value.contains(event.target)) lastInteraction = Date.now(); }
  function visibility() { send('heartbeat', {}, !visible()); }
  function link(event) {
    const a = event.target.closest?.('a[href]');
    if (!a || a.closest('.document-stats-control') || (root.value && !root.value.contains(a))) return;
    lastInteraction = Date.now();
    let href = a.getAttribute('href');
    try { const u = new URL(href, location.origin); if (u.origin === location.origin) href = `${u.pathname}${u.search}${u.hash}`; } catch { return; }
    send('link', { href, label: a.textContent.trim().slice(0, 250) });
  }
  function section(slug) {
    if (!current || current.section === slug) return;
    current.section = slug || '';
    send('section');
  }
  async function start() {
    if (!mounted) return;
    if (current) send('heartbeat', {}, true);
    current = null;
    const c = context();
    if (!c?.agencyId || !c.documentKey || !c.versionId || c.enabled === false) { status.value = 'off'; return; }
    const session = { ...c, id: crypto.randomUUID(), sequence: 0, section: c.sectionSlug || '', base: c.apiBase || '/document-analytics', started: false, queue: Promise.resolve() };
    current = session; lastInteraction = Date.now(); status.value = 'connecting';
    session.queue = Promise.resolve().then(() => http.post(`${session.base}/sessions`, { agencyId: c.agencyId, sessionId: session.id, documentKey: c.documentKey, versionId: c.versionId, surface: c.surface || 'library', deviceClass: innerWidth < 700 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop' }, { skipGlobalLoading: true })).then(() => { session.started = true; if (current === session) status.value = 'active'; }).catch(() => { if (current === session) status.value = 'unavailable'; });
    send('section');
  }
  const stopWatch = watch(() => JSON.stringify(context() || null), start);
  onMounted(() => {
    mounted = true; start();
    for (const name of ['pointerdown', 'keydown', 'wheel', 'scroll']) document.addEventListener(name, interact, { passive: true, capture: true });
    document.addEventListener('click', link, true); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', visibility); window.addEventListener('focus', visibility);
    interval = setInterval(() => send(), 15000);
  });
  onBeforeUnmount(() => {
    send('heartbeat', {}, true); current = null; clearInterval(interval); stopWatch();
    for (const name of ['pointerdown', 'keydown', 'wheel', 'scroll']) document.removeEventListener(name, interact, true);
    document.removeEventListener('click', link, true); document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('blur', visibility); window.removeEventListener('focus', visibility);
  });
  return { status, section, feedback: helpful => send(helpful ? 'helpful' : 'not_helpful') };
}
