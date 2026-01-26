<template>
  <div class="container page">
    <div class="page-header">
      <div>
        <h1>Agency Calendar</h1>
        <p class="subtitle">
          Review provider schedules with Google busy and external calendar (ICS) overlays.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="reloadProviders" :disabled="loadingProviders">
          {{ loadingProviders ? 'Loading…' : 'Refresh providers' }}
        </button>
      </div>
    </div>

    <div v-if="!agencyId" class="card">
      Select an organization first.
    </div>

    <div v-else class="layout">
      <div class="card sidebar">
        <label class="lbl">Provider</label>
        <input v-model="search" class="input" type="text" placeholder="Search by name…" />

        <div class="provider-list">
          <button
            v-for="p in filteredProviders"
            :key="p.id"
            type="button"
            class="provider-row"
            :class="{ active: Number(p.id) === selectedProviderId }"
            @click="selectedProviderId = Number(p.id)"
          >
            <div class="provider-name">{{ p.last_name }}, {{ p.first_name }}</div>
            <div class="provider-meta muted">{{ p.role || 'provider' }}</div>
          </button>
        </div>

        <div class="sidebar-actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="prevProvider" :disabled="!canPrevProvider">
            Prev
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="nextProvider" :disabled="!canNextProvider">
            Next
          </button>
          <button class="btn btn-primary btn-sm" type="button" @click="openUserProfile" :disabled="!selectedProviderId">
            Open profile
          </button>
        </div>
      </div>

      <div class="main">
        <div class="card controls">
          <div class="control">
            <div class="lbl">Week (any date)</div>
            <input v-model="weekStartYmd" class="input" type="date" />
            <div class="muted small">Normalized to Monday inside the grid.</div>
          </div>
        </div>

        <div v-if="providersError" class="error" style="margin-top: 12px;">{{ providersError }}</div>

        <div v-if="selectedProviderId" class="grid-wrap" style="margin-top: 12px;">
          <ScheduleAvailabilityGrid
            :user-id="selectedProviderId"
            :agency-id="agencyId"
            mode="admin"
            :week-start-ymd="weekStartYmd"
          />
        </div>

        <div v-else class="card" style="margin-top: 12px;">
          Select a provider to begin.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import ScheduleAvailabilityGrid from '../../components/schedule/ScheduleAvailabilityGrid.vue';

const router = useRouter();
const agencyStore = useAgencyStore();

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const providers = ref([]);
const loadingProviders = ref(false);
const providersError = ref('');

const search = ref('');
const selectedProviderId = ref(null);

const startOfWeekMondayYmd = (dateLike) => {
  const d = new Date(dateLike || Date.now());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
};

const weekStartYmd = ref(startOfWeekMondayYmd(new Date()));

const filteredProviders = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  const list = Array.isArray(providers.value) ? providers.value : [];
  const base = list.slice().sort((a, b) => {
    const la = String(a?.last_name || '').toLowerCase();
    const lb = String(b?.last_name || '').toLowerCase();
    if (la !== lb) return la.localeCompare(lb);
    const fa = String(a?.first_name || '').toLowerCase();
    const fb = String(b?.first_name || '').toLowerCase();
    return fa.localeCompare(fb);
  });
  if (!q) return base;
  return base.filter((p) => `${p?.first_name || ''} ${p?.last_name || ''}`.toLowerCase().includes(q));
});

const selectedIndex = computed(() => filteredProviders.value.findIndex((p) => Number(p.id) === Number(selectedProviderId.value)));
const canPrevProvider = computed(() => selectedIndex.value > 0);
const canNextProvider = computed(() => selectedIndex.value >= 0 && selectedIndex.value < filteredProviders.value.length - 1);

const prevProvider = () => {
  if (!canPrevProvider.value) return;
  const p = filteredProviders.value[selectedIndex.value - 1];
  if (p?.id) selectedProviderId.value = Number(p.id);
};
const nextProvider = () => {
  if (!canNextProvider.value) return;
  const p = filteredProviders.value[selectedIndex.value + 1];
  if (p?.id) selectedProviderId.value = Number(p.id);
};

const openUserProfile = () => {
  if (!selectedProviderId.value) return;
  router.push(`/admin/users/${selectedProviderId.value}?tab=schedule_availability`);
};

const reloadProviders = async () => {
  if (!agencyId.value) return;
  try {
    loadingProviders.value = true;
    providersError.value = '';
    const resp = await api.get('/provider-scheduling/providers', { params: { agencyId: agencyId.value } });
    providers.value = resp.data || [];
    if (!selectedProviderId.value && Array.isArray(providers.value) && providers.value.length > 0) {
      selectedProviderId.value = Number(providers.value[0].id);
    }
  } catch (e) {
    providersError.value = e.response?.data?.error?.message || 'Failed to load providers';
    providers.value = [];
  } finally {
    loadingProviders.value = false;
  }
};

watch(agencyId, async () => {
  selectedProviderId.value = null;
  await reloadProviders();
});

onMounted(async () => {
  if (!agencyStore.currentAgency) {
    await agencyStore.fetchUserAgencies();
  }
  await reloadProviders();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 16px;
}
.subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
}
.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.sidebar {
  position: sticky;
  top: 12px;
}
@media (max-width: 980px) {
  .sidebar {
    position: static;
  }
}
.lbl {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.provider-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh;
  overflow: auto;
  padding-right: 4px;
}
.provider-row {
  text-align: left;
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}
.provider-row.active {
  border-color: var(--primary);
  background: var(--bg-alt);
}
.provider-name {
  font-weight: 800;
}
.muted {
  color: var(--text-secondary);
}
.small {
  font-size: 12px;
}
.sidebar-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.controls .control {
  max-width: 320px;
}
</style>

