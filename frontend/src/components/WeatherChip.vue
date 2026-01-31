<template>
  <div class="weather-chip" v-if="isAuthenticated">
    <button
      v-if="weather?.status === 'missing_home_address'"
      class="weather-chip-link"
      type="button"
      @click="goToAccountInfo"
      title="Set your home address to enable local weather"
    >
      Weather: set home address
    </button>

    <button
      v-else-if="weather?.status === 'ok'"
      class="weather-chip-pill"
      :class="{ snow: !!weather?.snow?.snowLikelyNext72h }"
      type="button"
      @click="goToAccountInfo"
      :title="detailTitle + ' (click to view/update home address)'"
    >
      <span class="weather-chip-temp" v-if="typeof weather?.current?.temperatureF === 'number'">
        {{ Math.round(weather.current.temperatureF) }}°F
      </span>
      <span class="weather-chip-sep" v-if="typeof weather?.current?.temperatureF === 'number'">•</span>
      <span class="weather-chip-label">
        {{ weather?.snow?.snowLikelyNext72h ? 'Snow' : 'Weather' }}
      </span>
      <span v-if="weather?.snow?.snowLikelyNext72h && weather?.snow?.nextSnowDate" class="weather-chip-sub">
        {{ prettyDate(weather.snow.nextSnowDate) }}
      </span>
    </button>

    <button
      v-else
      class="weather-chip-link"
      type="button"
      @click="goToAccountInfo"
      title="Weather temporarily unavailable. Click to verify your home address."
    >
      Weather unavailable
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import api from '../services/api';

const authStore = useAuthStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);
const route = useRoute();
const router = useRouter();

const accountInfoLink = computed(() => {
  const slug = route?.params?.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/account-info`;
  return '/account-info';
});

const goToAccountInfo = async () => {
  try {
    await router.push(accountInfoLink.value);
  } catch {
    // ignore
  }
};

const weather = ref(null);
let refreshTimer = null;
const didForceRefresh = ref(false);

const prettyDate = (isoDate) => {
  try {
    const d = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  } catch {
    return isoDate;
  }
};

const detailTitle = computed(() => {
  if (weather.value?.status !== 'ok') return '';
  if (weather.value?.snow?.snowLikelyNext72h) {
    const amt = weather.value?.snow?.maxSnowInchesNext72h;
    const date = weather.value?.snow?.nextSnowDate ? prettyDate(weather.value.snow.nextSnowDate) : null;
    const pieces = [];
    if (typeof amt === 'number' && amt > 0) pieces.push(`Up to ${amt}"`);
    if (date) pieces.push(`starting ${date}`);
    return pieces.length ? pieces.join(' ') : 'Snow forecast in the next 72 hours';
  }
  return 'No snow forecast in the next 72 hours';
});

const fetchWeather = async () => {
  if (!isAuthenticated.value) return;
  try {
    const resp = await api.get('/weather/me', { skipGlobalLoading: true, skipAuthRedirect: true });
    const data = resp?.data || null;
    weather.value = data;

    // Self-heal once: if we get a failure state, force a re-geocode immediately.
    if (!didForceRefresh.value && data && data.status && data.status !== 'ok' && data.status !== 'missing_home_address') {
      didForceRefresh.value = true;
      const resp2 = await api.get('/weather/me?force=1', { skipGlobalLoading: true, skipAuthRedirect: true });
      weather.value = resp2?.data || data;
    }
  } catch {
    // Best-effort: show a stable fallback UI.
    weather.value = { status: 'unavailable' };
  }
};

onMounted(async () => {
  await fetchWeather();
  refreshTimer = window.setInterval(fetchWeather, 15 * 60 * 1000);
});

onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = null;
});
</script>

<style scoped>
.weather-chip {
  display: inline-flex;
  align-items: center;
}

.weather-chip-link {
  appearance: none;
  border: none;
  color: rgba(255, 255, 255, 0.92);
  text-decoration: none;
  font-weight: 700;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
}
.weather-chip-link:hover {
  background: rgba(255, 255, 255, 0.14);
}

.weather-chip-pill {
  appearance: none;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.96);
  font-weight: 800;
  font-size: 13px;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
}

.weather-chip-pill:hover {
  background: rgba(255, 255, 255, 0.14);
}

.weather-chip-pill.snow {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.32);
}

.weather-chip-temp {
  font-variant-numeric: tabular-nums;
}

.weather-chip-sep {
  opacity: 0.8;
}

.weather-chip-sub {
  opacity: 0.9;
  font-weight: 800;
}
</style>

