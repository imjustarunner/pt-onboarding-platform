import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../services/api';
const cache = new Map(), ttl = 10 * 60 * 1000;
export function useScheduleWeather(userId, rangeKey) {
  const weather = ref(null);
  let generation = 0;
  async function load() {
    const id = userId(), current = ++generation;
    if (!id) { weather.value = null; return; }
    let entry = cache.get(id);
    if (!entry || Date.now() - entry.at >= ttl) {
      entry = { at: Date.now(), promise: api.get('/weather/me', { params: { view: 'schedule' }, skipGlobalLoading: true, skipAuthRedirect: true })
        .then(response => response.data).catch(() => ({ status: 'unavailable' })) };
      cache.set(id, entry);
      if (cache.size > 64) cache.delete(cache.keys().next().value);
    }
    const result = await entry.promise;
    if (current === generation) weather.value = result;
  }
  watch(() => [userId(), rangeKey()], load, { immediate: true });
  const timer = setInterval(load, ttl);
  onBeforeUnmount(() => { generation++; clearInterval(timer); });
  return weather;
}
