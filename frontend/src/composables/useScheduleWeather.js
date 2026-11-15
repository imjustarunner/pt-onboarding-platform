import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import api from '../services/api';

const cache = new Map(), ttl = 10 * 60_000, retryMs = 60_000;
export function useWeatherForecast(identity, rangeKey = () => '') {
  const selected = shallowRef(null);
  let alive = true;
  const weather = computed(() => selected.value?.data.value || null);
  const refreshing = computed(() => selected.value?.refreshing.value || false);
  async function refresh({ force = false } = {}) {
    const entry = selected.value;
    if (!entry || !alive) return;
    if (entry.pending) return entry.pending;
    if (!force && entry.lastAttempt != null && Date.now() - entry.lastAttempt < (entry.retry ? retryMs : ttl)) return;
    entry.lastAttempt = Date.now();
    entry.refreshing.value = true;
    entry.pending = (async () => {
      let result;
      try {
        result = (await api.get('/weather/me', { params: { view: 'schedule', ...(force ? { force: 1 } : {}) }, skipGlobalLoading: true, skipAuthRedirect: true, timeout: 40_000 })).data;
      } catch { result = { status: 'unavailable' }; }
      entry.retry = result?.status !== 'ok' || !!result.stale;
      if (result?.status === 'ok') { entry.data.value = result; entry.at = Date.parse(result.fetchedAt) || Date.now(); }
      else if (entry.data.value?.status === 'ok' && Date.now() - entry.at < 6 * 60 * 60_000 && !['unauthenticated', 'missing_home_address'].includes(result?.status)) entry.data.value = { ...entry.data.value, stale: true };
      else entry.data.value = result || { status: 'unavailable' };
      entry.refreshing.value = false;
      entry.pending = null;
    })();
    return entry.pending;
  }
  watch(() => identity(), value => {
    if (!value) { selected.value = null; return; }
    let entry = cache.get(value);
    if (!entry) {
      entry = { data: ref(null), refreshing: ref(false), pending: null, lastAttempt: null, retry: false };
      cache.set(value, entry);
      if (cache.size > 64) cache.delete(cache.keys().next().value);
    }
    selected.value = entry;
    void refresh();
  }, { immediate: true });
  watch(rangeKey, () => void refresh());
  const onVisible = () => { if (!document.hidden) void refresh(); };
  const timer = setInterval(() => void refresh(), retryMs);
  if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  onBeforeUnmount(() => {
    alive = false; clearInterval(timer);
    if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  });
  return { weather, refreshing, refresh };
}

export function useScheduleWeather(identity, rangeKey) {
  return useWeatherForecast(identity, rangeKey).weather;
}
