<template>
  <div class="container sched-compare">
    <div class="header" data-tour="sched-compare-header">
      <div>
        <h2 style="margin: 0;" data-tour="sched-compare-title">Staff schedules</h2>
        <div class="subtitle">
          {{ isBusyOnlyViewer
            ? 'Overlay busy blocks for coworkers in your agencies (no client or event details).'
            : 'Overlay selected providers on one grid to coordinate availability. Switch to stacked for full detail on one person at a time.' }}
        </div>
      </div>
      <div class="header-right" data-tour="sched-compare-controls">
        <router-link class="btn btn-secondary" :to="orgTo('/schedule')" data-tour="sched-compare-back">Back to Schedule</router-link>
        <div class="week" data-tour="sched-compare-week">
          <label class="lbl-sm">Week of</label>
          <input v-model="weekStartYmd" type="date" class="input" />
        </div>
        <select
          v-if="!isBusyOnlyViewer"
          v-model="viewMode"
          class="input"
          style="min-width: 180px;"
          data-tour="sched-compare-view-mode"
        >
          <option value="overlay">Overlay (coordinate)</option>
          <option value="stacked" :disabled="selectedUserIds.length >= 2">Detailed (stacked)</option>
        </select>
        <div v-else class="muted" style="font-size: 12px; font-weight: 700;" data-tour="sched-compare-busy-mode">
          Overlay (busy only)
        </div>
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
          <div class="panel-title">{{ isBusyOnlyViewer ? 'Coworkers' : 'Providers' }}</div>
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

        <input v-model="search" class="input" placeholder="Search name/email…" data-tour="sched-compare-search" :disabled="!agencyIdsForSchedule.length" />

        <div class="row" style="margin-top: 10px; gap: 8px;" data-tour="sched-compare-quick-picks">
          <button class="btn btn-secondary btn-sm" type="button" @click="selectNone">None</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="selectFirstTwo" :disabled="!agencyIdsForSchedule.length || filteredProviders.length < 2">Pick 2</button>
        </div>

        <div v-if="!agencyIdsForSchedule.length" class="muted" style="font-size: 12px; margin-top: 10px;">
          Select at least one agency to browse providers.
        </div>

        <div v-else class="list" data-tour="sched-compare-provider-list">
          <label v-for="u in filteredProviders" :key="u.id" class="item">
            <input
              type="checkbox"
              :checked="selectedUserIds.includes(u.id)"
              :disabled="!selectedUserIds.includes(u.id) && selectedUserIds.length >= maxSelected"
              @change="toggleUser(u.id)"
            />
            <img
              v-if="userPhotoById[u.id]"
              class="provider-face"
              :src="userPhotoById[u.id]"
              alt=""
            />
            <span
              v-else
              class="provider-face provider-face--initials"
              aria-hidden="true"
            >{{ providerInitials(u) }}</span>
            <span class="name">{{ u.last_name }}, {{ u.first_name }}</span>
            <span class="email muted">{{ u.email }}</span>
          </label>
        </div>
      </aside>

      <main class="main" data-tour="sched-compare-main">
        <div v-if="loading" class="muted">Loading users…</div>
        <div v-else-if="!selectedUserIds.length" class="muted">Select people to compare schedules.</div>

        <div v-else-if="effectiveViewMode === 'overlay'" class="overlay-card" data-tour="sched-compare-overlay">
          <ScheduleMultiUserOverlayGrid
            :key="overlayGridKey"
            :user-ids="selectedUserIds"
            :agency-ids="agencyIdsForSchedule"
            :week-start-ymd="weekStartYmd"
            :week-starts-on="weekStartsOn"
            :user-label-by-id="userLabelById"
            :user-photo-by-id="userPhotoById"
            :hide-google-and-therapy-notes="isClubContext || isBusyOnlyViewer"
            :detail-level="overlayDetailLevel"
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
              :hide-office-and-calendar-integration="isClubContext"
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
import { isTenantOrganizationType } from '../utils/organizationTypes.js';
import { toUploadsUrl } from '../utils/uploadsUrl.js';
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
const viewMode = ref('overlay'); // stacked | overlay
const availabilityByUserId = ref({});
const overlayLoadGeneration = ref(0);

const actorRole = computed(() => String(authStore.user?.role || '').toLowerCase());
const isBusyOnlyViewer = computed(() => actorRole.value === 'provider');
const canLoadDirectoryUsers = computed(() => [
  'admin', 'super_admin', 'superadmin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff'
].includes(actorRole.value));
const canUseFullAgencyCatalog = computed(() => ['super_admin', 'superadmin'].includes(actorRole.value));
const overlayDetailLevel = computed(() => (isBusyOnlyViewer.value ? 'typed' : 'full'));
const effectiveViewMode = computed(() => {
  if (isBusyOnlyViewer.value) return 'overlay';
  // Two or more people → always overlay so schedules can be coordinated side-by-side.
  if ((selectedUserIds.value || []).length >= 2) return 'overlay';
  return viewMode.value;
});

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

const isClubContext = computed(() => {
  const t = String(agencyStore.currentAgency?.organization_type || '').toLowerCase();
  return t === 'affiliation' || t === 'clubwebapp';
});
const availableAgencies = computed(() => {
  const fromUser = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  const fromCatalog = Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [];
  // Super admins may have a single membership row but should filter across the full tenant catalog.
  const list = canUseFullAgencyCatalog.value && fromCatalog.length
    ? fromCatalog
    : (fromUser.length ? fromUser : fromCatalog);
  return list
    .filter((a) => isTenantOrganizationType(a))
    .slice()
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const parseUserAgencyIds = (user) => {
  const raw = user?.agency_ids ?? user?.agencyIds ?? '';
  if (Array.isArray(raw)) {
    return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  }
  return String(raw || '')
    .split(',')
    .map((s) => Number(String(s || '').trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
};

const userMatchesSelectedAgencies = (user, agencyIds = agencyIdsForSchedule.value) => {
  const selected = (agencyIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  if (!selected.length) return false;
  const userAgencyIds = parseUserAgencyIds(user);
  if (!userAgencyIds.length) return false;
  return userAgencyIds.some((id) => selected.includes(id));
};
const effectiveAgencyId = computed(() => {
  const fromStore = Number(agencyStore.currentAgency?.id || 0);
  if (fromStore) return fromStore;
  const first = Number(availableAgencies.value?.[0]?.id || 0);
  return first || 0;
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
  String(weekStartYmd.value || ''),
  overlayDetailLevel.value
].join('|'));

const isProviderLike = (u) => {
  const role = String(u?.role || '').toLowerCase();
  if (role === 'provider') return true;
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
  let base = (isBusyOnlyViewer.value ? (users.value || []) : (providers.value || [])).slice();
  base = base.filter((u) => userMatchesSelectedAgencies(u));
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

const resolveUserPhotoUrl = (u) => {
  const raw = String(
    u?.profilePhotoUrl
    || u?.profile_photo_url
    || u?.profile_photo_path
    || u?.profilePhotoPath
    || ''
  ).trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return toUploadsUrl(raw);
};

const userPhotoById = computed(() => {
  const m = {};
  for (const u of users.value || []) {
    const id = Number(u?.id || 0);
    if (!id) continue;
    const url = resolveUserPhotoUrl(u);
    if (url) m[id] = url;
  }
  return m;
});

const providerInitials = (u) => {
  const first = String(u?.first_name || '').trim()[0] || '';
  const last = String(u?.last_name || '').trim()[0] || '';
  return `${first}${last}`.toUpperCase() || '?';
};

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
  const next = [...cur, uid];
  selectedUserIds.value = next;
  if (next.length >= 2) viewMode.value = 'overlay';
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
  viewMode.value = 'overlay';
};

const loadUsers = async () => {
  try {
    loading.value = true;
    error.value = '';
    if (canLoadDirectoryUsers.value) {
      const resp = await api.get('/users', { params: { _t: Date.now() } });
      users.value = Array.isArray(resp.data) ? resp.data : [];
      return;
    }
    const me = Number(authStore.user?.id || 0);
    if (!me) {
      users.value = [];
      return;
    }
    const resp = await api.get(`/users/${me}/meeting-candidates`, {
      params: { allAgencies: true, _t: Date.now() }
    });
    const rows = Array.isArray(resp.data?.users) ? resp.data.users : [];
    users.value = rows.map((u) => ({
      id: Number(u.id || 0),
      first_name: String(u.firstName || u.first_name || '').trim(),
      last_name: String(u.lastName || u.last_name || '').trim(),
      email: String(u.email || '').trim(),
      role: String(u.role || '').trim().toLowerCase(),
      profilePhotoUrl: String(u.profilePhotoUrl || u.profile_photo_url || '').trim() || null,
      agency_ids: Array.isArray(u.agencyIds) ? u.agencyIds.join(',') : String(u.agencyIds || u.agency_ids || ''),
      has_provider_access: true
    })).filter((u) => u.id > 0);
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
  if (isBusyOnlyViewer.value || effectiveViewMode.value !== 'stacked') return;
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
  void route.params.organizationSlug;
  try {
    await agencyStore.fetchUserAgencies();
  } catch {
    // ignore
  }
  const role = actorRole.value;
  if (['super_admin', 'superadmin', 'admin', 'support'].includes(role) || !(agencyStore.userAgencies || []).length) {
    try {
      await agencyStore.fetchAgencies();
    } catch {
      // ignore
    }
  }
  await loadUsers();

  const userIdFromQuery = route.query?.userId ? parseInt(route.query.userId, 10) : null;
  if (userIdFromQuery && Number.isFinite(userIdFromQuery) && (users.value || []).some((u) => Number(u.id) === userIdFromQuery)) {
    selectedUserIds.value = [userIdFromQuery];
  }

  if (!selectedAgencyIds.value.length) {
    const ids = (availableAgencies.value || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length) selectedAgencyIds.value = ids;
    else if (effectiveAgencyId.value) selectedAgencyIds.value = [Number(effectiveAgencyId.value)];
  }

  if (isBusyOnlyViewer.value) viewMode.value = 'overlay';
});

watch(selectedUserIds, (ids) => {
  if ((ids || []).length >= 2 && viewMode.value !== 'overlay') {
    viewMode.value = 'overlay';
  }
}, { deep: true });

watch(viewMode, (mode) => {
  if (mode === 'stacked' && (selectedUserIds.value || []).length >= 2) {
    viewMode.value = 'overlay';
  }
});

watch(agencyIdsForSchedule, (ids) => {
  const selected = (selectedUserIds.value || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  if (!selected.length) return;
  const allowed = new Set(
    (users.value || [])
      .filter((u) => userMatchesSelectedAgencies(u, ids))
      .map((u) => Number(u.id))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  const next = selected.filter((id) => allowed.has(id));
  if (next.length !== selected.length) selectedUserIds.value = next;
}, { deep: true });

watch([selectedUserIds, agencyIdsForSchedule, weekStartYmd, effectiveViewMode], () => {
  void loadAvailabilityOverlays();
}, { deep: true });
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; font-size: 13px; }
.header-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.week { display: inline-flex; gap: 6px; align-items: center; }
.lbl-sm { font-size: 12px; font-weight: 700; color: var(--text-secondary); }
.layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; }
.panel {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 12px;
  padding: 12px;
  min-height: 320px;
}
.panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.panel-title { font-weight: 800; }
.agency-filter { margin-bottom: 10px; }
.agency-filter-summary { cursor: pointer; font-weight: 700; display: flex; justify-content: space-between; gap: 8px; }
.agency-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; max-height: 160px; overflow: auto; }
.agency-item { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; max-height: 520px; overflow: auto; }
.item { display: grid; grid-template-columns: 18px 22px 1fr; gap: 4px 8px; align-items: start; font-size: 13px; }
.item .name { grid-column: 3; }
.item .email { grid-column: 3; font-size: 11px; }
.provider-face {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
}
.provider-face--initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  color: #fff;
  background: #64748b;
}
.main { min-width: 0; }
.overlay-card, .stack-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  padding: 10px;
  margin-bottom: 12px;
}
.stack-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.stack-title { font-weight: 800; }
.stack-actions { display: inline-flex; gap: 6px; }
.row { display: flex; align-items: center; }
.error { color: #b00020; margin-bottom: 8px; }
.muted { color: var(--text-secondary); }
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
