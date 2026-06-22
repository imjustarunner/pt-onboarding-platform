<template>
  <div class="kw-root">
    <!-- Header -->
    <header class="kw-header">
      <div class="kw-header__inner">
        <div class="kw-header__logo-row">
          <svg class="kw-header__logo-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse cx="24" cy="14" rx="7" ry="10" fill="#4a9ba8" opacity="0.85"/>
            <ellipse cx="14" cy="28" rx="7" ry="10" transform="rotate(-30 14 28)" fill="#2e7055" opacity="0.8"/>
            <ellipse cx="34" cy="28" rx="7" ry="10" transform="rotate(30 34 28)" fill="#1e4a5a" opacity="0.8"/>
          </svg>
          <span class="kw-header__org-name">{{ locationName }}</span>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="kw-main">
      <div class="kw-welcome-block">
        <h1 class="kw-welcome-block__title">Welcome!</h1>
        <p class="kw-welcome-block__subtitle">Please select the therapist you are meeting with today to check in.</p>
      </div>

      <div class="kw-content">
        <!-- Provider grid -->
        <section class="kw-providers-section">
          <div class="kw-providers-section__header">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>THERAPISTS IN OFFICE NOW</span>
          </div>

          <div v-if="loading" class="kw-providers-loading">
            <div class="kw-spinner" />
            <span>Loading providers…</span>
          </div>

          <div v-else-if="providers.length === 0" class="kw-providers-empty">
            No providers are currently scheduled. Please see the front desk for assistance.
          </div>

          <div v-else class="kw-providers-grid">
            <KioskProviderCard
              v-for="p in providers"
              :key="p.id"
              :provider="p"
              @select="onSelectProvider"
            />
          </div>
        </section>

        <!-- Right sidebar -->
        <aside class="kw-sidebar">
          <div class="kw-sidebar-card">
            <div class="kw-sidebar-card__header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              OFFICE AVAILABILITY
            </div>
            <p class="kw-sidebar-card__body">View real-time availability of our offices.</p>
            <button class="kw-sidebar-card__btn" @click="showOfficeAvailability = true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              VIEW OFFICE AVAILABILITY
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <div class="kw-sidebar-card kw-sidebar-card--help">
            <div class="kw-sidebar-card__header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              NEED HELP?
            </div>
            <p class="kw-sidebar-card__body">Please see the front desk for assistance.</p>
          </div>
        </aside>
      </div>
    </main>

    <!-- Bottom bar with clock -->
    <footer class="kw-footer">
      <div class="kw-footer__inner">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>{{ footerDate }}</span>
        <span class="kw-footer__sep">|</span>
        <span>{{ footerTime }}</span>
      </div>
    </footer>

    <!-- Check-in flow overlay -->
    <KioskCheckInFlow
      v-if="selectedProvider"
      :provider="selectedProvider"
      :location-id="locationId"
      :timezone="locationTimezone"
      @close="selectedProvider = null"
    />

    <!-- Office availability overlay -->
    <KioskOfficeAvailability
      v-if="showOfficeAvailability"
      :location-id="locationId"
      @close="showOfficeAvailability = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import KioskProviderCard from '../components/kiosk/KioskProviderCard.vue';
import KioskCheckInFlow from '../components/kiosk/KioskCheckInFlow.vue';
import KioskOfficeAvailability from '../components/kiosk/KioskOfficeAvailability.vue';

const route = useRoute();
const locationId = computed(() => route.params.locationId);

const providers = ref([]);
const locationName = ref('');
const locationTimezone = ref('America/Denver');
const loading = ref(true);
const selectedProvider = ref(null);
const showOfficeAvailability = ref(false);

// Clock — always shows time in the office's timezone
const now = ref(new Date());
let clockInterval = null;
let refreshInterval = null;

const footerDate = computed(() => {
  return now.value.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: locationTimezone.value });
});
const footerTime = computed(() => {
  return now.value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: locationTimezone.value });
});

async function loadProviders() {
  try {
    const res = await api.get(`/kiosk/${locationId.value}/providers-today`);
    providers.value = res.data?.providers || [];
    if (res.data?.locationName) locationName.value = res.data.locationName;
    if (res.data?.timezone) locationTimezone.value = res.data.timezone;
  } catch {
    // silent — keep showing last known state
  } finally {
    loading.value = false;
  }
}

function onSelectProvider(p) {
  selectedProvider.value = p;
}

onMounted(() => {
  loadProviders();
  clockInterval = setInterval(() => { now.value = new Date(); }, 1000);
  // Refresh provider list every 60 seconds
  refreshInterval = setInterval(loadProviders, 60_000);
});

onUnmounted(() => {
  clearInterval(clockInterval);
  clearInterval(refreshInterval);
});
</script>

<style scoped>
.kw-root {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: #f5f0eb;
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  color: #1a2f3a;
}

/* ── Header ─────────────────────────────────────── */
.kw-header {
  background: #1e3a4a;
  color: #fff;
  padding: 18px 40px;
}
.kw-header__inner {
  max-width: 1200px;
  margin: 0 auto;
}
.kw-header__logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-content: center;
}
.kw-header__logo-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}
.kw-header__org-name {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: #fff;
}

/* ── Welcome block ──────────────────────────────── */
.kw-main {
  flex: 1;
  padding: 36px 40px 20px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
.kw-welcome-block {
  text-align: center;
  margin-bottom: 30px;
}
.kw-welcome-block__title {
  font-size: 52px;
  font-weight: 900;
  color: #1e3a4a;
  margin: 0 0 8px;
  letter-spacing: -1px;
}
.kw-welcome-block__subtitle {
  font-size: 17px;
  color: #4a6070;
  margin: 0;
}

/* ── Content layout ─────────────────────────────── */
.kw-content {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 28px;
  align-items: start;
}

/* ── Provider section ───────────────────────────── */
.kw-providers-section__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 1.2px;
  color: #3a6b7a;
  text-transform: uppercase;
  margin-bottom: 16px;
}

.kw-providers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 14px;
}

.kw-providers-loading,
.kw-providers-empty {
  padding: 40px 20px;
  text-align: center;
  color: #7a9aaa;
  font-size: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.kw-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #dde6eb;
  border-top-color: #3a6b7a;
  border-radius: 50%;
  animation: kw-spin 0.7s linear infinite;
}
@keyframes kw-spin { to { transform: rotate(360deg); } }

/* ── Sidebar ────────────────────────────────────── */
.kw-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.kw-sidebar-card {
  background: #fff;
  border: 1.5px solid #e2ecf0;
  border-radius: 14px;
  padding: 18px 16px 16px;
}
.kw-sidebar-card--help {
  background: #f8fafb;
}
.kw-sidebar-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #1e3a4a;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.kw-sidebar-card__body {
  font-size: 13px;
  color: #5a7585;
  margin: 0 0 14px;
  line-height: 1.5;
}
.kw-sidebar-card--help .kw-sidebar-card__body {
  margin-bottom: 0;
}
.kw-sidebar-card__btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: #fff;
  border: 1.5px solid #c8dde4;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #1e3a4a;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  justify-content: space-between;
}
.kw-sidebar-card__btn:hover {
  background: #eef6f8;
  border-color: #3a6b7a;
}

/* ── Footer ─────────────────────────────────────── */
.kw-footer {
  background: #1e3a4a;
  color: #9bb8c6;
  padding: 14px 40px;
  font-size: 14px;
}
.kw-footer__inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.kw-footer__sep {
  opacity: 0.4;
}

/* ── Responsive ─────────────────────────────────── */
@media (max-width: 900px) {
  .kw-content {
    grid-template-columns: 1fr;
  }
  .kw-sidebar {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 600px) {
  .kw-main { padding: 24px 16px 16px; }
  .kw-welcome-block__title { font-size: 36px; }
  .kw-providers-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
  .kw-sidebar { grid-template-columns: 1fr; }
}
</style>
