import { computed, onUnmounted, ref } from 'vue';

/**
 * Show virtual join for modality virtual|hybrid when now is within [start-10m, end].
 * @param {import('vue').Ref|import('vue').ComputedRef} sessionRef session with startsAt, endsAt, modality, joinUrl
 */
export function useSessionJoinWindow(sessionRef) {
  const nowMs = ref(Date.now());
  let timer = null;
  if (typeof window !== 'undefined') {
    timer = window.setInterval(() => {
      nowMs.value = Date.now();
    }, 15000);
  }
  onUnmounted(() => {
    if (timer) window.clearInterval(timer);
  });

  const joinVisible = computed(() => {
    const s = sessionRef?.value ?? sessionRef;
    if (!s) return false;
    const url = String(s.joinUrl || '').trim();
    if (!url) return false;
    const mod = String(s.modality || '').toLowerCase();
    if (!mod || (mod !== 'virtual' && mod !== 'hybrid')) return false;
    const st = new Date(s.startsAt || s.starts_at || 0);
    const en = new Date(s.endsAt || s.ends_at || 0);
    if (!Number.isFinite(st.getTime()) || !Number.isFinite(en.getTime())) return false;
    const startMs = st.getTime() - 10 * 60 * 1000;
    const t = nowMs.value;
    return t >= startMs && t <= en.getTime();
  });

  return { joinVisible, nowMs };
}
