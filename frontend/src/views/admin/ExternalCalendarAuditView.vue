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
        <label class="lbl">Group</label>
        <div class="group-row">
          <select v-model="selectedGroupId" class="input">
            <option :value="''">— Select a saved group —</option>
            <option v-for="g in groupsSorted" :key="`g-${g.id}`" :value="g.id">{{ g.label }}</option>
          </select>
          <button class="btn btn-secondary btn-sm" type="button" @click="applySelectedGroup" :disabled="!selectedGroupId">
            Apply
          </button>
        </div>

        <div class="group-save">
          <label class="lbl" style="margin-top: 10px;">Save current selection</label>
          <input v-model="newGroupLabel" class="input" type="text" placeholder="e.g. Therapy Notes (Team A)" />
          <div class="group-save-actions">
            <button class="btn btn-primary btn-sm" type="button" @click="saveGroup" :disabled="!canSaveGroup">
              Save group
            </button>
            <button class="btn btn-secondary btn-sm" type="button" @click="deleteSelectedGroup" :disabled="!selectedGroupId">
              Delete group
            </button>
          </div>
          <div class="muted small" style="margin-top: 6px;">
            Groups are saved locally in your browser (per organization).
          </div>
        </div>

        <div class="divider" />

        <label class="lbl">Providers</label>
        <input v-model="search" class="input" type="text" placeholder="Search by name…" />

        <div class="provider-actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="selectAllFiltered" :disabled="filteredProviders.length === 0">
            Select all
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="clearSelection" :disabled="selectedProviderIds.length === 0">
            Clear
          </button>
          <div class="muted small" style="margin-left:auto;">
            Selected: <strong>{{ selectedProviderIds.length }}</strong>
          </div>
        </div>

        <div class="provider-list">
          <label
            v-for="p in filteredProviders"
            :key="p.id"
            class="provider-row"
          >
            <input
              class="provider-check"
              type="checkbox"
              :value="Number(p.id)"
              v-model="selectedProviderIds"
            />
            <div class="provider-text">
              <div class="provider-name">{{ p.last_name }}, {{ p.first_name }}</div>
              <div class="provider-meta muted">{{ p.role || 'provider' }}</div>
            </div>
          </label>
        </div>

        <div class="sidebar-actions">
          <button class="btn btn-primary btn-sm" type="button" @click="openFirstProfile" :disabled="selectedProviderIds.length === 0">
            Open first profile
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

        <div v-if="selectedProviders.length" class="grid-wrap" style="margin-top: 12px;">
          <div v-for="p in selectedProviders" :key="`grid-${p.id}`" class="card provider-grid-card">
            <div class="provider-grid-head">
              <div class="provider-grid-title">{{ p.last_name }}, {{ p.first_name }}</div>
              <button class="btn btn-secondary btn-sm" type="button" @click="removeProvider(p.id)">
                Remove
              </button>
            </div>
            <ScheduleAvailabilityGrid
              :user-id="Number(p.id)"
              :agency-id="agencyId"
              mode="admin"
              :week-start-ymd="weekStartYmd"
            />
          </div>
        </div>

        <div v-else class="card" style="margin-top: 12px;">
          Select one or more providers to begin.
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
const selectedProviderIds = ref([]);

// ---- Groups (saved locally, per agency) ----
const STORAGE_VERSION = 'v1';
const groups = ref([]); // [{ id, label, providerIds:number[] }]
const selectedGroupId = ref('');
const newGroupLabel = ref('');

const groupsStorageKey = computed(() => `externalCalendarAudit.groups.${STORAGE_VERSION}.${agencyId.value || 'none'}`);

const loadGroups = () => {
  try {
    const raw = window?.localStorage?.getItem?.(groupsStorageKey.value);
    const parsed = raw ? JSON.parse(raw) : [];
    groups.value = Array.isArray(parsed) ? parsed : [];
  } catch {
    groups.value = [];
  }
};
const saveGroupsToStorage = () => {
  try {
    window?.localStorage?.setItem?.(groupsStorageKey.value, JSON.stringify(groups.value || []));
  } catch {
    // ignore
  }
};
const groupsSorted = computed(() => {
  const list = Array.isArray(groups.value) ? groups.value : [];
  return list.slice().sort((a, b) => String(a?.label || '').localeCompare(String(b?.label || '')));
});

const canSaveGroup = computed(() => {
  const label = String(newGroupLabel.value || '').trim();
  return label.length > 0 && selectedProviderIds.value.length > 0;
});

const makeId = () => {
  // short-ish id for local storage; uniqueness is “good enough”
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeIdList = (ids) => {
  const set = new Set((Array.isArray(ids) ? ids : []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0));
  return Array.from(set);
};

const applySelectedGroup = () => {
  const id = String(selectedGroupId.value || '');
  const g = (groups.value || []).find((x) => String(x?.id) === id);
  if (!g) return;
  selectedProviderIds.value = normalizeIdList(g.providerIds);
};

const saveGroup = () => {
  const label = String(newGroupLabel.value || '').trim();
  if (!label) return;
  const providerIds = normalizeIdList(selectedProviderIds.value);
  if (providerIds.length === 0) return;

  const existingIdx = (groups.value || []).findIndex((g) => String(g?.label || '').toLowerCase() === label.toLowerCase());
  if (existingIdx >= 0) {
    groups.value.splice(existingIdx, 1, { ...groups.value[existingIdx], label, providerIds });
    selectedGroupId.value = String(groups.value[existingIdx]?.id || '');
  } else {
    const id = makeId();
    groups.value.push({ id, label, providerIds });
    selectedGroupId.value = id;
  }
  saveGroupsToStorage();
  newGroupLabel.value = '';
};

const deleteSelectedGroup = () => {
  const id = String(selectedGroupId.value || '');
  if (!id) return;
  groups.value = (groups.value || []).filter((g) => String(g?.id) !== id);
  selectedGroupId.value = '';
  saveGroupsToStorage();
};

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

const selectedProviders = computed(() => {
  const selected = new Set((selectedProviderIds.value || []).map((n) => Number(n)));
  return (providers.value || []).filter((p) => selected.has(Number(p?.id || 0)));
});

const removeProvider = (id) => {
  const n = Number(id);
  selectedProviderIds.value = (selectedProviderIds.value || []).filter((x) => Number(x) !== n);
};

const selectAllFiltered = () => {
  const ids = filteredProviders.value.map((p) => Number(p?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
  selectedProviderIds.value = normalizeIdList([...(selectedProviderIds.value || []), ...ids]);
};

const clearSelection = () => {
  selectedProviderIds.value = [];
};

const openFirstProfile = () => {
  const first = selectedProviders.value?.[0];
  if (!first?.id) return;
  router.push(`/admin/users/${first.id}?tab=schedule_availability`);
};

const reloadProviders = async () => {
  if (!agencyId.value) return;
  try {
    loadingProviders.value = true;
    providersError.value = '';
    const resp = await api.get('/provider-scheduling/providers', { params: { agencyId: agencyId.value } });
    const list = Array.isArray(resp.data) ? resp.data : [];
    // Backstop: hide archived/inactive users if backend ever includes them.
    providers.value = list.filter((p) => {
      const isActive = p?.is_active === undefined || p?.is_active === null || p?.is_active === true || p?.is_active === 1;
      const isArchivedFlag = p?.is_archived === true || p?.is_archived === 1;
      const isArchivedStatus = String(p?.status || '').toUpperCase() === 'ARCHIVED';
      return isActive && !isArchivedFlag && !isArchivedStatus;
    });
    // Drop selections that no longer exist.
    const allowed = new Set((providers.value || []).map((p) => Number(p?.id || 0)));
    selectedProviderIds.value = (selectedProviderIds.value || []).map((n) => Number(n)).filter((n) => allowed.has(n));
  } catch (e) {
    providersError.value = e.response?.data?.error?.message || 'Failed to load providers';
    providers.value = [];
  } finally {
    loadingProviders.value = false;
  }
};

watch(agencyId, async () => {
  selectedProviderIds.value = [];
  selectedGroupId.value = '';
  loadGroups();
  await reloadProviders();
});

onMounted(async () => {
  if (!agencyStore.currentAgency) {
    await agencyStore.fetchUserAgencies();
  }
  loadGroups();
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
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}
.provider-row:hover { border-color: rgba(2, 132, 199, 0.35); }
.provider-check { margin-top: 3px; }
.provider-text { min-width: 0; }
.provider-name {
  font-weight: 800;
}
.muted {
  color: var(--text-secondary);
}
.small {
  font-size: 12px;
}
.provider-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
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
.provider-grid-card {
  margin-bottom: 12px;
}
.provider-grid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.provider-grid-title {
  font-weight: 900;
  color: var(--text-primary);
}
.divider {
  height: 1px;
  background: var(--border);
  margin: 14px 0;
}
.group-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.group-save-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>

