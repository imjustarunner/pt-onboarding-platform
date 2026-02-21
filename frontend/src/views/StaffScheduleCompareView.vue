<template>
  <div class="container sched-compare">
    <div class="header" data-tour="sched-compare-header">
      <div>
        <h2 style="margin: 0;" data-tour="sched-compare-title">Staff schedules</h2>
        <div class="subtitle">Compare multiple providers’ schedules (stacked or overlaid).</div>
      </div>
      <div class="header-right" data-tour="sched-compare-controls">
        <router-link class="btn btn-secondary" :to="orgTo('/schedule')" data-tour="sched-compare-back">Back to Schedule</router-link>
        <div class="week" data-tour="sched-compare-week">
          <label class="lbl-sm">Week of</label>
          <input v-model="weekStartYmd" type="date" class="input" />
        </div>
        <select v-model="viewMode" class="input" style="min-width: 180px;" data-tour="sched-compare-view-mode">
          <option value="stacked">Detailed (stacked)</option>
          <option value="overlay">Overlay (summary)</option>
        </select>
        <button class="btn btn-secondary" type="button" @click="shiftWeek(-7)">Prev</button>
        <button class="btn btn-secondary" type="button" @click="shiftWeek(7)">Next</button>
        <button class="btn btn-secondary" type="button" @click="goToCurrentWeek">Current week</button>
        <button class="btn btn-secondary" type="button" @click="toggleWeekStartsOn">
          Week starts: {{ weekStartsOn === 'monday' ? 'Monday' : 'Sunday' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="layout">
      <aside class="panel" data-tour="sched-compare-sidebar">
        <div class="panel-head">
          <div class="panel-title">Providers</div>
          <div class="muted" style="font-size: 12px;">
            Selected: {{ selectedUserIds.length }}/{{ maxSelected }}
          </div>
        </div>

        <details class="agency-filter" open data-tour="sched-compare-agency-filter">
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

        <input v-model="search" class="input" placeholder="Search name/email…" data-tour="sched-compare-search" />

        <div class="row" style="margin-top: 10px; gap: 8px;" data-tour="sched-compare-quick-picks">
          <button class="btn btn-secondary btn-sm" type="button" @click="selectNone">None</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="selectFirstTwo" :disabled="filteredProviders.length < 2">Pick 2</button>
        </div>

        <div class="list" data-tour="sched-compare-provider-list">
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

      <main class="main" data-tour="sched-compare-main">
        <div v-if="loading" class="muted">Loading users…</div>
        <div v-else-if="!selectedUserIds.length" class="muted">Select providers to compare schedules.</div>

        <div v-else-if="viewMode === 'overlay'" class="overlay-card" data-tour="sched-compare-overlay">
          <ScheduleMultiUserOverlayGrid
            :key="overlayGridKey"
            :user-ids="selectedUserIds"
            :agency-ids="agencyIdsForSchedule"
            :week-start-ymd="weekStartYmd"
            :week-starts-on="weekStartsOn"
            :user-label-by-id="userLabelById"
            @update:weekStartYmd="(v) => (weekStartYmd = v)"
          />
        </div>

        <div v-else class="stack" data-tour="sched-compare-stacked">
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
              :week-starts-on="weekStartsOn"
              :availability-overlay="availabilityByUserId[uid] || null"
              mode="admin"
            />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
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
const viewMode = ref('stacked'); // stacked | overlay
const availabilityByUserId = ref({});
const overlayLoadGeneration = ref(0);

const toLocalYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayYmd = () => toLocalYmd(new Date());
const weekStartYmd = ref(todayYmd());
const weekStartsOn = ref(
  typeof window !== 'undefined' && window.localStorage.getItem('schedule.weekStartsOn') === 'sunday' ? 'sunday' : 'monday'
);
const startOfWeekMondayYmd = (ymd) => {
  const d = new Date(`${String(ymd || todayYmd()).slice(0, 10)}T12:00:00`);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = (day + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toLocalYmd(d);
};
const shiftWeek = (deltaDays) => {
  const d = new Date(`${weekStartYmd.value}T00:00:00`);
  d.setDate(d.getDate() + Number(deltaDays || 0));
  weekStartYmd.value = toLocalYmd(d);
};
const goToCurrentWeek = () => {
  weekStartYmd.value = startOfWeekMondayYmd(todayYmd());
};
const toggleWeekStartsOn = () => {
  weekStartsOn.value = weekStartsOn.value === 'monday' ? 'sunday' : 'monday';
  if (typeof window !== 'undefined') window.localStorage.setItem('schedule.weekStartsOn', weekStartsOn.value);
};

const effectiveAgencyId = computed(() => {
  const fromStore = Number(agencyStore.currentAgency?.id || 0);
  if (fromStore) return fromStore;
  const first = Number(availableAgencies.value?.[0]?.id || 0);
  return first || 0;
});
const availableAgencies = computed(() => {
  const list = Array.isArray(agencyStore.userAgencies?.value) ? agencyStore.userAgencies.value : [];
  return list.filter((a) => String(a?.organization_type || '').toLowerCase() === 'agency');
});
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
  const list = availableAgencies.value || [];
  for (const a of list) {
    const id = Number(a?.id || 0);
    if (!id) continue;
    m[id] = a?.name || `Agency ${id}`;
  }
  return m;
});
const overlayGridKey = computed(() => [
  (selectedUserIds.value || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0).join(','),
  (agencyIdsForSchedule.value || []).join(','),
  String(weekStartYmd.value || '')
].join('|'));

const isProviderLike = (u) => {
  const role = String(u?.role || '').toLowerCase();
  if (role === 'provider') return true;
  // Some admins are also providers in this codebase
  if (u?.has_provider_access === true) return true;
  return false;
};

const providers = computed(() => (users.value || []).filter(isProviderLike));

function fuzzyScore(text, query) {
  const t = String(text || '').toLowerCase();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { score: 1, inOrder: true };
  const chars = q.split('').filter(Boolean);
  if (!chars.length) return { score: 1, inOrder: true };
  const allPresent = chars.every((c) => t.includes(c));
  if (!allPresent) return { score: 0, inOrder: false };
  const matched = [];
  let cursor = 0;
  for (const c of chars) {
    const idx = t.indexOf(c, cursor);
    if (idx === -1) {
      const fallback = t.indexOf(c);
      if (fallback === -1) return { score: 0, inOrder: false };
      matched.push(fallback);
      cursor = fallback + 1;
    } else {
      matched.push(idx);
      cursor = idx + 1;
    }
  }
  const inOrder = matched.every((idx, i) => i === 0 || idx > matched[i - 1]);
  const contiguousBonus = inOrder && chars.length > 1
    ? (t.includes(q) ? 2 : 1)
    : 0;
  return {
    score: (inOrder ? 3 : 2) + contiguousBonus,
    inOrder
  };
}

const filteredProviders = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  const base = (providers.value || []).slice();
  base.sort((a, b) =>
    String(a?.last_name || '').localeCompare(String(b?.last_name || '')) ||
    String(a?.first_name || '').localeCompare(String(b?.first_name || '')) ||
    Number(a?.id || 0) - Number(b?.id || 0)
  );
  if (!q) return base;
  const scored = base.map((u) => {
    const searchText = `${u.first_name || ''} ${u.last_name || ''} ${u.email || ''}`;
    const displayText = `${u.last_name || ''}, ${u.first_name || ''}`;
    const s1 = fuzzyScore(searchText, q);
    const s2 = fuzzyScore(displayText, q);
    const score = Math.max(s1.score, s2.score);
    return { u, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.u?.last_name || '').localeCompare(String(b.u?.last_name || '')) ||
      String(a.u?.first_name || '').localeCompare(String(b.u?.first_name || '')) ||
      Number(a.u?.id || 0) - Number(b.u?.id || 0);
  });
  return scored.map((x) => x.u);
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

const mergeSlotsByKey = (slots) => {
  const map = new Map();
  for (const s of Array.isArray(slots) ? slots : []) {
    const startAt = String(s?.startAt || '').trim();
    const endAt = String(s?.endAt || '').trim();
    if (!startAt || !endAt) continue;
    const k = `${startAt}|${endAt}`;
    if (!map.has(k)) map.set(k, { startAt, endAt });
  }
  return Array.from(map.values()).sort((a, b) => `${a.startAt}`.localeCompare(`${b.startAt}`));
};

const loadAvailabilityOverlays = async () => {
  const generation = overlayLoadGeneration.value + 1;
  overlayLoadGeneration.value = generation;
  const uids = (selectedUserIds.value || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  const aids = (agencyIdsForSchedule.value || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  if (!uids.length || !aids.length) {
    if (generation !== overlayLoadGeneration.value) return;
    availabilityByUserId.value = {};
    return;
  }
  const current = { ...(availabilityByUserId.value || {}) };
  for (const uid of Object.keys(current)) {
    if (!uids.includes(Number(uid))) delete current[uid];
  }
  availabilityByUserId.value = current;
  const out = {};
  await Promise.all(
    uids.map(async (uid) => {
      const perAgency = await Promise.all(
        aids.map((aid) =>
          api
            .get(`/availability/providers/${uid}/week`, {
              params: {
                agencyId: aid,
                weekStart: weekStartYmd.value,
                includeGoogleBusy: true,
                intakeOnly: true
              }
            })
            .then((r) => r?.data || null)
            .catch(() => null)
        )
      );
      const mergedVirtual = [];
      const mergedInPerson = [];
      for (const d of perAgency) {
        mergedVirtual.push(...(Array.isArray(d?.virtualSlots) ? d.virtualSlots : []));
        mergedInPerson.push(...(Array.isArray(d?.inPersonSlots) ? d.inPersonSlots : []));
      }
      out[uid] = {
        virtualSlots: mergeSlotsByKey(mergedVirtual),
        inPersonSlots: mergeSlotsByKey(mergedInPerson)
      };
    })
  );
  if (generation !== overlayLoadGeneration.value) return;
  availabilityByUserId.value = out;
};

onMounted(async () => {
  // If organizationSlug exists, this route is org-prefixed; still safe to load the same endpoint.
  void route.params.organizationSlug;
  // Ensure we have a real agency list for the picker (authStore.user.agencies is often empty).
  try {
    await agencyStore.fetchUserAgencies();
  } catch {
    // ignore; best-effort
  }
  await loadUsers();

  // Pre-select user from query (e.g. from Providers panel "View schedule" link)
  const userIdFromQuery = route.query?.userId ? parseInt(route.query.userId, 10) : null;
  if (userIdFromQuery && Number.isFinite(userIdFromQuery) && (users.value || []).some((u) => Number(u.id) === userIdFromQuery)) {
    selectedUserIds.value = [userIdFromQuery];
  }

  // Default agency filter to all agencies (best for multi-agency providers) or fall back to current.
  if (!selectedAgencyIds.value.length) {
    const ids = (availableAgencies.value || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length) selectedAgencyIds.value = ids;
    else if (effectiveAgencyId.value) selectedAgencyIds.value = [Number(effectiveAgencyId.value)];
  }
  await loadAvailabilityOverlays();
});

watch([selectedUserIds, agencyIdsForSchedule, weekStartYmd, viewMode], () => {
  void loadAvailabilityOverlays();
}, { deep: true });

watch(selectedUserIds, (ids) => {
  const keep = new Set((ids || []).map((n) => Number(n)));
  const next = {};
  for (const [k, v] of Object.entries(availabilityByUserId.value || {})) {
    if (keep.has(Number(k))) next[k] = v;
  }
  availabilityByUserId.value = next;
}, { deep: true });
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

