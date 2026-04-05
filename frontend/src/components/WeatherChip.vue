<template>
  <div
    v-if="isAuthenticated"
    class="weather-chip-wrap"
    @mouseleave="onWrapLeave"
  >
    <button
      v-if="weather?.status === 'missing_home_address'"
      class="weather-chip-link"
      type="button"
      @click="openModal"
      title="Set your home address to enable local weather"
    >
      Weather: set home address
    </button>

    <button
      v-else-if="weather?.status === 'ok'"
      class="weather-chip-pill"
      :class="{ snow: !!weather?.snow?.snowLikelyNext72h }"
      type="button"
      @click="openModal"
      @mouseenter="onPillEnter"
      @focus="onPillEnter"
      :aria-expanded="modalOpen ? 'true' : 'false'"
      aria-haspopup="dialog"
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
      @click="openModal"
      :title="unavailableTitle"
    >
      Weather unavailable
    </button>

    <!-- Quick hover: snow / no-snow summary (desktop pointer) -->
    <div
      v-if="showHoverCard && weather?.status === 'ok'"
      class="weather-hover-card"
      role="tooltip"
      @mouseenter="hoverLocked = true"
      @mouseleave="hoverLocked = false; showHoverCard = false"
    >
      <div class="weather-hover-title">{{ hoverCardTitle }}</div>
      <p class="weather-hover-body">{{ hoverCardBody }}</p>
    </div>

    <Teleport to="body">
      <div
        v-if="modalOpen"
        class="weather-modal-backdrop"
        @click.self="closeModal"
      >
        <div
          class="weather-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="weather-modal-title"
          @keydown.escape.prevent="closeModal"
        >
          <div class="weather-modal-head">
            <h2 id="weather-modal-title">Weather at home</h2>
            <button type="button" class="weather-modal-close" @click="closeModal" aria-label="Close">×</button>
          </div>

          <div class="weather-modal-body">
            <template v-if="weather?.status === 'missing_home_address'">
              <p class="muted">
                Add a complete home address (including city/state or ZIP) on your account so we can show local weather and snow outlooks.
              </p>
            </template>

            <template v-else-if="weather?.status === 'ok'">
              <div class="weather-modal-hero" v-if="typeof weather?.current?.temperatureF === 'number'">
                <span class="weather-modal-temp">{{ Math.round(weather.current.temperatureF) }}°F</span>
                <span class="weather-modal-sub">Current (home location)</span>
              </div>

              <section class="weather-modal-section">
                <h3>Snow (next 72 hours)</h3>
                <p v-if="weather?.snow?.snowLikelyNext72h" class="weather-modal-snow">
                  Snow in the forecast — up to
                  <strong v-if="typeof weather.snow.maxSnowInchesNext72h === 'number'">
                    {{ weather.snow.maxSnowInchesNext72h }}"
                  </strong>
                  <span v-if="weather.snow.nextSnowDate">
                    · next likelihood around <strong>{{ prettyDateLong(weather.snow.nextSnowDate) }}</strong>
                  </span>
                  <span v-if="typeof weather.snow.precipProbAtNextSnow === 'number'">
                    · precip chance {{ Math.round(weather.snow.precipProbAtNextSnow) }}%
                  </span>
                </p>
                <p v-else class="muted">No meaningful snow in the next 72 hours at your home location.</p>
              </section>

              <section v-if="forecastRows.length" class="weather-modal-section">
                <h3>7-day outlook</h3>
                <ul class="weather-modal-days">
                  <li v-for="(row, idx) in forecastRows" :key="idx">
                    <span class="day-name">{{ prettyDateLong(row.date) }}</span>
                    <span class="day-temps">
                      <template v-if="row.tempMaxF != null && row.tempMinF != null">
                        {{ Math.round(row.tempMaxF) }}° / {{ Math.round(row.tempMinF) }}°
                      </template>
                      <template v-else>—</template>
                    </span>
                    <span v-if="row.snowfallInches != null && row.snowfallInches > 0" class="day-snow">
                      Snow ~{{ row.snowfallInches }}"
                    </span>
                  </li>
                </ul>
              </section>
            </template>

            <template v-else>
              <p class="muted">
                {{ unavailableTitle }}
              </p>
            </template>
          </div>

          <div class="weather-modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">Close</button>
            <button type="button" class="btn btn-primary" @click="goToAccountInfo">Update home address</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
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
  closeModal();
  try {
    await router.push(accountInfoLink.value);
  } catch {
    // ignore
  }
};

const weather = ref(null);
let refreshTimer = null;
const didForceRefresh = ref(false);

const modalOpen = ref(false);
const showHoverCard = ref(false);
const hoverLocked = ref(false);
const hoverTimer = ref(null);
const leaveTimer = ref(null);
const forecastRows = computed(() => {
  const rows = weather.value?.forecastDays;
  return Array.isArray(rows) ? rows : [];
});

const prettyDate = (isoDate) => {
  try {
    const d = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  } catch {
    return isoDate;
  }
};

const prettyDateLong = (isoDate) => {
  try {
    const d = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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

const hoverCardTitle = computed(() => {
  if (weather.value?.status !== 'ok') return '';
  return weather.value?.snow?.snowLikelyNext72h ? 'Snow ahead' : 'No snow (72h)';
});

const hoverCardBody = computed(() => detailTitle.value);

const unavailableTitle = computed(() => {
  const s = String(weather.value?.status || '').trim();
  const base = s ? `Weather status: ${s}` : 'Weather temporarily unavailable.';
  const devDebug = weather.value?.debug ? ' (see response debug payload)' : '';
  return `${base}${devDebug} Open for details or verify your home address.`;
});

const onPillEnter = () => {
  if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(pointer: fine)').matches) {
    return;
  }
  if (leaveTimer.value) {
    window.clearTimeout(leaveTimer.value);
    leaveTimer.value = null;
  }
  if (hoverTimer.value) window.clearTimeout(hoverTimer.value);
  hoverTimer.value = window.setTimeout(() => {
    if (weather.value?.status === 'ok') showHoverCard.value = true;
  }, 160);
};

const onWrapLeave = () => {
  if (leaveTimer.value) window.clearTimeout(leaveTimer.value);
  leaveTimer.value = window.setTimeout(() => {
    if (!hoverLocked.value) showHoverCard.value = false;
    leaveTimer.value = null;
  }, 200);
  if (hoverTimer.value) window.clearTimeout(hoverTimer.value);
  hoverTimer.value = null;
};

const openModal = () => {
  showHoverCard.value = false;
  modalOpen.value = true;
};

const closeModal = () => {
  modalOpen.value = false;
};

const onKeydown = (e) => {
  if (e.key === 'Escape' && modalOpen.value) closeModal();
};

watch(modalOpen, (open) => {
  if (typeof document === 'undefined') return;
  if (open) {
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
  } else {
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
  }
});

const fetchWeather = async () => {
  if (!isAuthenticated.value) return;
  try {
    const resp = await api.get('/weather/me', { skipGlobalLoading: true, skipAuthRedirect: true });
    const data = resp?.data || null;
    weather.value = data;

    if (!didForceRefresh.value && data && data.status && data.status !== 'ok' && data.status !== 'missing_home_address') {
      didForceRefresh.value = true;
      const resp2 = await api.get('/weather/me?force=1', { skipGlobalLoading: true, skipAuthRedirect: true });
      weather.value = resp2?.data || data;
    }
  } catch {
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
  if (hoverTimer.value) window.clearTimeout(hoverTimer.value);
  if (leaveTimer.value) window.clearTimeout(leaveTimer.value);
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
  }
});
</script>

<style scoped>
.weather-chip-wrap {
  position: relative;
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

.weather-hover-card {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 50;
  min-width: 220px;
  max-width: 280px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #0f172a;
  color: #f8fafc;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 12px;
  line-height: 1.35;
  pointer-events: auto;
}

.weather-hover-title {
  font-weight: 800;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  margin-bottom: 4px;
}

.weather-hover-body {
  margin: 0;
  font-weight: 600;
  color: #e2e8f0;
}

.weather-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.weather-modal {
  width: 100%;
  max-width: 420px;
  max-height: min(88vh, 640px);
  overflow: auto;
  background: #fff;
  color: #0f172a;
  border-radius: 14px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
}

.weather-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.weather-modal-head h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
}

.weather-modal-close {
  appearance: none;
  border: none;
  background: #f1f5f9;
  color: #0f172a;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.weather-modal-close:hover {
  background: #e2e8f0;
}

.weather-modal-body {
  padding: 14px 16px;
  overflow: auto;
}

.weather-modal-hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;
}

.weather-modal-temp {
  font-size: 2.25rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.weather-modal-sub {
  font-size: 0.82rem;
  color: #64748b;
}

.weather-modal-section {
  margin-top: 12px;
}

.weather-modal-section h3 {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.weather-modal-snow {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.45;
}

.weather-modal-days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weather-modal-days li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px 12px;
  font-size: 0.88rem;
  align-items: baseline;
}

.weather-modal-days .day-name {
  font-weight: 700;
}

.weather-modal-days .day-temps {
  font-variant-numeric: tabular-nums;
  color: #334155;
}

.weather-modal-days .day-snow {
  grid-column: 1 / -1;
  font-size: 0.8rem;
  color: #0369a1;
  font-weight: 700;
}

.muted {
  color: #64748b;
  font-size: 0.92rem;
  line-height: 1.45;
}

.weather-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0 0 14px 14px;
}
</style>
