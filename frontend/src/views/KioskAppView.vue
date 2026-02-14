<template>
  <div class="kiosk-app">
    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <button class="btn btn-secondary" @click="logout">Sign Out</button>
    </div>
    <div v-else-if="!context" class="error-box">
      <p>No kiosk assignments found. Contact your administrator.</p>
      <button class="btn btn-secondary" @click="logout">Sign Out</button>
    </div>
    <div v-else-if="!selectedLocationId" class="selector-step">
      <h2>Select Location</h2>
      <div v-if="context.agencies.length > 1" class="agency-selector">
        <label>Agency</label>
        <select v-model="selectedAgencyId" class="select">
          <option value="">Select agency…</option>
          <option v-for="a in context.agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
      </div>
      <div class="location-grid">
        <button
          v-for="loc in availableLocations"
          :key="loc.id"
          class="location-btn"
          @click="selectLocation(loc.id)"
        >
          {{ loc.name }}
        </button>
      </div>
      <p v-if="availableLocations.length === 0" class="muted">No locations available. Select an agency above.</p>
      <button class="btn btn-secondary logout-btn" @click="logout">Sign Out</button>
    </div>
    <div v-else class="kiosk-embed">
      <KioskView :location-id="selectedLocationId" :location-settings="selectedLocationSettings" />
      <button class="btn btn-secondary back-btn" @click="selectedLocationId = null">Change Location</button>
      <button class="btn btn-secondary logout-btn" @click="logout">Sign Out</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import KioskView from './KioskView.vue';

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref('');
const context = ref(null);
const selectedAgencyId = ref('');
const selectedLocationId = ref('');

const todayDayName = computed(() => {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return names[new Date().getDay()];
});

const availableLocations = computed(() => {
  if (!context.value?.agencies?.length) return [];
  let locations = [];
  if (context.value.singleAgency) {
    locations = context.value.singleAgency.locations || [];
  } else {
    const aid = parseInt(selectedAgencyId.value, 10);
    if (!aid) return [];
    const agency = context.value.agencies.find((a) => a.id === aid);
    locations = agency?.locations || [];
  }
  return locations.filter((loc) => {
    const allowedDays = loc.allowed_days;
    if (!allowedDays || !Array.isArray(allowedDays) || allowedDays.length === 0) return true;
    return allowedDays.map((d) => String(d).toLowerCase()).includes(todayDayName.value);
  });
});

const fetchContext = async () => {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/kiosk/me/context');
    context.value = res.data;
    if (context.value?.singleAgency && context.value.agencies?.length === 1) {
      selectedAgencyId.value = String(context.value.agencies[0].id);
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load kiosk context';
    if (e.response?.status === 401) {
      router.push('/kiosk/login');
    }
  } finally {
    loading.value = false;
  }
};

const selectedLocationSettings = computed(() => {
  if (!selectedLocationId.value || !context.value?.agencies) return null;
  for (const agency of context.value.agencies) {
    const loc = (agency.locations || []).find((l) => l.id === parseInt(selectedLocationId.value, 10));
    if (loc) return loc.settings || null;
  }
  return null;
});

const selectLocation = (locationId) => {
  selectedLocationId.value = locationId;
};

const logout = async () => {
  await authStore.logout();
  router.push('/kiosk/login');
};

onMounted(() => {
  if (authStore.user?.role?.toLowerCase() !== 'kiosk') {
    router.push('/kiosk/login');
    return;
  }
  fetchContext();
});
</script>

<style scoped>
.kiosk-app {
  min-height: 100vh;
  background: var(--bg-alt, #f1f5f9);
  padding: 20px;
}
.loading {
  text-align: center;
  padding: 40px;
  font-size: 18px;
}
.error-box {
  max-width: 500px;
  margin: 40px auto;
  padding: 24px;
  background: white;
  border-radius: 12px;
  text-align: center;
}
.error-box p {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}
.selector-step {
  max-width: 600px;
  margin: 0 auto;
  padding: 24px;
  background: white;
  border-radius: 12px;
}
.selector-step h2 {
  margin: 0 0 20px 0;
  font-size: 20px;
}
.agency-selector {
  margin-bottom: 20px;
}
.agency-selector label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
}
.select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  min-width: 200px;
}
.location-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin: 20px 0;
}
.location-btn {
  padding: 20px;
  font-size: 16px;
  font-weight: 600;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}
.location-btn:hover {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, white);
}
.logout-btn, .back-btn {
  margin-top: 16px;
  margin-right: 8px;
}
.kiosk-embed {
  position: relative;
}
.kiosk-embed .back-btn,
.kiosk-embed .logout-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}
.kiosk-embed .back-btn {
  right: 120px;
}
.muted {
  color: var(--text-secondary);
  margin: 12px 0;
}
</style>
