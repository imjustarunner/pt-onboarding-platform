<template>
  <div class="container sched-compare">
    <div class="header">
      <div>
        <h2 style="margin: 0;">Staff schedules</h2>
        <div class="subtitle">Compare multiple providers’ schedules (stacked or overlaid).</div>
      </div>
      <div class="header-right">
        <router-link class="btn btn-secondary" :to="orgTo('/schedule')">Back to Schedule</router-link>
        <div class="week">
          <label class="lbl-sm">Week of</label>
          <input v-model="weekStartYmd" type="date" class="input" />
        </div>
        <select v-model="viewMode" class="input" style="min-width: 140px;">
          <option value="overlay">Overlay</option>
          <option value="stacked">Stacked</option>
        </select>
        <button class="btn btn-secondary" type="button" @click="shiftWeek(-7)">Prev</button>
        <button class="btn btn-secondary" type="button" @click="shiftWeek(7)">Next</button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="layout">
      <aside class="panel">
        <div class="panel-head">
          <div class="panel-title">Providers</div>
          <div class="muted" style="font-size: 12px;">
            Selected: {{ selectedUserIds.length }}/{{ maxSelected }}
          </div>
        </div>

        <details class="agency-filter" open>
          <summary class="agency-filter-summary">
            <span>Agencies</span>
            <span class="muted" style="font-size: 12px;">({{ agencyIdsForSchedule.length }}/{{ availableAgencies.length }})</span>
          </summary>
          <div class="row" style="margin-top: 8px; gap: 8px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="selectAllAgencies" :disabled="!availableAgencies.length">All</button>
            <button class="btn btn-secondary btn-sm" type="button" @click="selectNoAgencies" :disabled="!availableAgencies.length">None</button>
          </div>
          <div v-if="availableAgencies.length" class="agency-list">
            <label v-for="a in availableAgencies" :key="`sa-${a.id}`" class="agency-item">
              <input type="checkbox" v-model="selectedAgencyIds" :value="Number(a.id)" />
              <span class="name">{{ a.name }}</span>
            </label>
          </div>
          <div v-else class="muted" style="font-size: 12px; margin-top: 8px;">
            No agencies available for your account.
          </div>
        </details>

        <input v-model="search" class="input" placeholder="Search name/email…" />

        <div class="row" style="margin-top: 10px; gap: 8px;">
          <button class="btn btn-secondary btn-sm" type="button" @click="selectNone">None</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="selectFirstTwo" :disabled="filteredProviders.length < 2">Pick 2</button>
        </div>

        <div class="list">
          <label v-for="u in filteredProviders" :key="u.id" class="item">
            <input
              type="checkbox"
              :checked="selectedUserIds.includes(u.id)"
              :disabled="!selectedUserIds.includes(u.id) && selectedUserIds.length >= maxSelected"
              @change="toggleUser(u.id)"
            />
            <span class="name">{{ u.last_name }}, {{ u.first_name }}</span>
            <span class="email muted">{{ u.email }}</span>
          </label>
        </div>
      </aside>

      <main class="main">
        <div v-if="loading" class="muted">Loading users…</div>
        <div v-else-if="!selectedUserIds.length" class="muted">Select providers to compare schedules.</div>

        <div v-else-if="viewMode === 'overlay'" class="overlay-card">
          <ScheduleMultiUserOverlayGrid
            :user-ids="selectedUserIds"
            :agency-ids="agencyIdsForSchedule"
            :week-start-ymd="weekStartYmd"
            :user-label-by-id="userLabelById"
            @update:weekStartYmd="(v) => (weekStartYmd = v)"
          />
        </div>

        <div v-else class="stack">
          <div v-for="uid in selectedUserIds" :key="`sched-${uid}`" class="stack-card">
            <div class="stack-head">
              <div class="stack-title">{{ userLabelById[uid] || `User ${uid}` }}</div>
              <div class="stack-actions">
                <button class="btn btn-secondary btn-sm" type="button" @click="moveUp(uid)" :disabled="selectedUserIds[0] === uid">Up</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="moveDown(uid)" :disabled="selectedUserIds[selectedUserIds.length - 1] === uid">Down</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="toggleUser(uid)">Remove</button>
              </div>
            </div>

            <ScheduleAvailabilityGrid
              :user-id="uid"
              :agency-ids="agencyIdsForSchedule"
              :agency-label-by-id="agencyLabelById"
              :week-start-ymd="weekStartYmd"
              mode="admin"
            />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import ScheduleAvailabilityGrid from '../components/schedule/ScheduleAvailabilityGrid.vue';
import ScheduleMultiUserOverlayGrid from '../components/schedule/ScheduleMultiUserOverlayGrid.vue';

const route = useRoute();
const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(false);
const error = ref('');
const users = ref([]);
const search = ref('');

const maxSelected = 6;
const selectedUserIds = ref([]);
const viewMode = ref('overlay'); // overlay | stacked

const todayYmd = () => new Date().toISOString().slice(0, 10);
const weekStartYmd = ref(todayYmd());
const shiftWeek = (deltaDays) => {
  const d = new Date(`${weekStartYmd.value}T00:00:00`);
  d.setDate(d.getDate() + Number(deltaDays || 0));
  weekStartYmd.value = d.toISOString().slice(0, 10);
};

const effectiveAgencyId = computed(() => {
  const fromStore = Number(agencyStore.currentAgency?.id || 0);
  if (fromStore) return fromStore;
  const first = Number(authStore.user?.agencies?.find((a) => String(a?.organization_type || '').toLowerCase() === 'agency')?.id || 0);
  return first || 0;
});
const availableAgencies = computed(() =>
  (authStore.user?.agencies || []).filter((a) => String(a?.organization_type || '').toLowerCase() === 'agency')
);
const selectedAgencyIds = ref([]);
const selectAllAgencies = () => {
  selectedAgencyIds.value = (availableAgencies.value || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0);
};
const selectNoAgencies = () => {
  selectedAgencyIds.value = [];
};
const agencyIdsForSchedule = computed(() => {
  const ids = (selectedAgencyIds.value || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
});
const agencyLabelById = computed(() => {
  const m = {};
  const list = authStore.user?.agencies || [];
  for (const a of list) {
    const id = Number(a?.id || 0);
    if (!id) continue;
    m[id] = a?.name || `Agency ${id}`;
  }
  return m;
});

const isProviderLike = (u) => {
  const role = String(u?.role || '').toLowerCase();
  if (role === 'provider') return true;
  // Some admins are also providers in this codebase
  if (u?.has_provider_access === true) return true;
  return false;
};

const providers = computed(() => (users.value || []).filter(isProviderLike));
const filteredProviders = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  const base = (providers.value || []).slice();
  base.sort((a, b) => String(a?.last_name || '').localeCompare(String(b?.last_name || '')) || String(a?.first_name || '').localeCompare(String(b?.first_name || '')));
  if (!q) return base;
  return base.filter((u) => {
    const s = `${u.first_name || ''} ${u.last_name || ''} ${u.email || ''}`.toLowerCase();
    return s.includes(q);
  });
});

const userLabelById = computed(() => {
  const m = {};
  for (const u of users.value || []) {
    m[Number(u.id)] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || String(u.email || `User ${u.id}`);
  }
  return m;
});

const toggleUser = (id) => {
  const uid = Number(id);
  const cur = selectedUserIds.value.slice();
  const idx = cur.indexOf(uid);
  if (idx >= 0) {
    cur.splice(idx, 1);
    selectedUserIds.value = cur;
    return;
  }
  if (cur.length >= maxSelected) return;
  selectedUserIds.value = [...cur, uid];
};

const moveUp = (id) => {
  const uid = Number(id);
  const cur = selectedUserIds.value.slice();
  const idx = cur.indexOf(uid);
  if (idx <= 0) return;
  const tmp = cur[idx - 1];
  cur[idx - 1] = uid;
  cur[idx] = tmp;
  selectedUserIds.value = cur;
};
const moveDown = (id) => {
  const uid = Number(id);
  const cur = selectedUserIds.value.slice();
  const idx = cur.indexOf(uid);
  if (idx < 0 || idx >= cur.length - 1) return;
  const tmp = cur[idx + 1];
  cur[idx + 1] = uid;
  cur[idx] = tmp;
  selectedUserIds.value = cur;
};

const selectNone = () => {
  selectedUserIds.value = [];
};
const selectFirstTwo = () => {
  const firstTwo = (filteredProviders.value || []).slice(0, 2).map((u) => Number(u.id));
  selectedUserIds.value = firstTwo;
};

const loadUsers = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/users', { params: { _t: Date.now() } });
    users.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (e) {
    users.value = [];
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load users';
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  // If organizationSlug exists, this route is org-prefixed; still safe to load the same endpoint.
  void route.params.organizationSlug;
  await loadUsers();

  // Default agency filter to all agencies (best for multi-agency providers) or fall back to current.
  if (!selectedAgencyIds.value.length) {
    const ids = (availableAgencies.value || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length) selectedAgencyIds.value = ids;
    else if (effectiveAgencyId.value) selectedAgencyIds.value = [Number(effectiveAgencyId.value)];
  }
});
</script>

<style scoped>
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.subtitle {
  margin-top: 6px;
  color: var(--text-secondary);
}
.header-right {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.lbl-sm {
  display: block;
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 6px;
  color: var(--text-secondary);
}
.week .input {
  min-width: 160px;
}
.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 12px;
}
.panel {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 14px;
  padding: 12px;
  height: calc(100vh - 220px);
  overflow: auto;
}
.agency-filter {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: white;
  margin-bottom: 10px;
}
.agency-filter-summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-weight: 900;
  color: var(--text-primary);
}
.agency-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.agency-item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--text-primary);
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}
.panel-title {
  font-weight: 900;
}
.row {
  display: flex;
  align-items: center;
}
.list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 8px;
  align-items: start;
  padding: 8px 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
}
.name {
  font-weight: 800;
  line-height: 1.1;
}
.email {
  display: block;
  font-size: 12px;
  margin-top: 2px;
}
.main {
  min-height: 300px;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stack-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 10px;
}
.overlay-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 10px;
}
.stack-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.stack-title {
  font-weight: 900;
}
.stack-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}
@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .panel {
    height: auto;
  }
}
</style>

