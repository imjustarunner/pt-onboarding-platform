<template>
  <div class="sbap-wrap">
    <div v-if="showTitle" class="page-header">
      <div>
        <h1 style="margin: 0;">{{ pageHeading }}</h1>
        <p class="subtitle" style="margin: 6px 0 0;">
          Week of {{ weekStart }} • Availability submissions across affiliated organizations.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="prevWeek" :disabled="loading">← Prev</button>
        <button class="btn btn-secondary btn-sm" type="button" @click="nextWeek" :disabled="loading">Next →</button>
        <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-else class="toolbar" style="margin-top: 0;">
      <div class="muted" style="font-size: 13px;">
        Week of <strong>{{ weekStart }}</strong>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="prevWeek" :disabled="loading">← Prev</button>
        <button class="btn btn-secondary btn-sm" type="button" @click="nextWeek" :disabled="loading">Next →</button>
        <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="showScopeFilters" class="toolbar scope-toolbar" style="margin-top: 0;">
      <div class="scope-group">
        <label class="scope-label">Agency</label>
        <select v-model="selectedAgencyId" class="input scope-select" :disabled="scopeLoading || loading || agencies.length === 0">
          <option value="">Select agency…</option>
          <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
      </div>
      <div class="scope-group">
        <label class="scope-label">Program / Learning / School</label>
        <select v-model="selectedOrganizationId" class="input scope-select" :disabled="scopeLoading || loading || !selectedAgencyId">
          <option value="">All affiliated organizations</option>
          <option v-for="o in organizations" :key="o.id" :value="String(o.id)">
            {{ o.name }} ({{ o.organizationType || 'org' }})
          </option>
        </select>
      </div>
    </div>

    <div class="toolbar">
      <div v-if="viewMode === 'table'" class="day-tabs">
        <button
          v-for="d in days"
          :key="d"
          type="button"
          class="day-tab"
          :class="{ active: selectedDay === d }"
          @click="selectedDay = d"
        >
          {{ d }}
        </button>
      </div>
      <div class="toolbar-right">
        <div class="view-toggle">
          <button type="button" class="btn btn-secondary btn-sm" :class="{ active: viewMode === 'table' }" @click="viewMode = 'table'">
            Table
          </button>
          <button type="button" class="btn btn-secondary btn-sm" :class="{ active: viewMode === 'calendar' }" @click="viewMode = 'calendar'">
            Calendar
          </button>
        </div>
        <input v-model="search" class="input" placeholder="Search provider…" />
        <label class="chk-inline">
          <input type="checkbox" v-model="onlyAvailable" />
          <span>Only available</span>
        </label>
      </div>
    </div>

    <div v-if="error" class="error" style="margin-top: 12px;">{{ error }}</div>
    <div v-if="loading" class="loading" style="margin-top: 12px;">Loading…</div>

    <div v-else class="results">
      <div class="summary">
        <div class="pill">Providers: <strong>{{ filteredProviders.length }}</strong></div>
        <div class="pill">Available blocks: <strong>{{ allBlocks.filter((r) => !r.isBooked).length }}</strong></div>
        <div class="pill">Booked blocks: <strong>{{ allBlocks.filter((r) => r.isBooked).length }}</strong></div>
        <div v-if="selectedAgencyName" class="pill">Agency: <strong>{{ selectedAgencyName }}</strong></div>
        <div v-if="selectedOrganizationName" class="pill">Organization: <strong>{{ selectedOrganizationName }}</strong></div>
      </div>

      <div v-if="viewMode === 'table' && rows.length === 0" class="empty">
        No matching Skill Builder blocks for {{ selectedDay }}.
      </div>

      <div v-else-if="viewMode === 'table'" class="table">
        <div class="thead">
          <div>Provider</div>
          <div>Time</div>
          <div>Departing from</div>
          <div>Status</div>
        </div>
        <div v-for="r in rows" :key="r.key" class="trow">
          <div class="provider">
            <div class="provider-name">{{ r.providerName }}</div>
            <div class="muted small" v-if="r.email">{{ r.email }}</div>
          </div>
          <div class="time">
            <div>{{ r.timeLabel }}</div>
            <div class="muted small">{{ r.blockTypeLabel }}</div>
          </div>
          <div class="depart">
            <div>{{ r.departFrom }}</div>
            <div class="muted small" v-if="r.departTimeLabel">Depart: {{ r.departTimeLabel }}</div>
          </div>
          <div class="status">
            <span class="badge" :class="r.isBooked ? 'badge-booked' : 'badge-available'">
              {{ r.isBooked ? 'Booked' : 'Available' }}
            </span>
          </div>
        </div>
      </div>

      <div v-else class="calendar-wrap">
        <div v-if="calendarProviders.length === 0" class="empty">
          No matching availability blocks for this week.
        </div>
        <div v-else class="provider-cards">
          <div v-for="p in calendarProviders" :key="`cal-${p.id}`" class="provider-card">
            <div class="provider-card-head">
              <div class="provider-name">{{ p.providerName }}</div>
              <div v-if="p.email" class="muted small">{{ p.email }}</div>
            </div>
            <div class="week-grid">
              <div v-for="d in days" :key="`${p.id}-${d}`" class="day-col">
                <div class="day-col-head">{{ d.slice(0, 3) }}</div>
                <div v-if="!p.days[d] || p.days[d].length === 0" class="muted small">—</div>
                <div
                  v-for="b in p.days[d]"
                  :key="b.key"
                  class="block-chip"
                  :class="b.isBooked ? 'chip-booked' : 'chip-available'"
                >
                  <div class="chip-time">{{ b.timeLabel }}</div>
                  <div class="chip-meta">{{ b.blockTypeLabel }}</div>
                  <div class="chip-meta">From: {{ b.departFrom }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String, null], default: null },
  organizationId: { type: [Number, String, null], default: null },
  showScopeFilters: { type: Boolean, default: true },
  showTitle: { type: Boolean, default: true },
  pageHeading: { type: String, default: 'Event availability' }
});

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const pad2 = (n) => String(n).padStart(2, '0');
const localYmd = (d) => {
  const yy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yy}-${mm}-${dd}`;
};
const startOfWeekMondayYmd = (dateLike) => {
  const d = new Date(dateLike || Date.now());
  // Use local noon when parsing YYYY-MM-DD strings
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    d.setTime(new Date(`${dateLike}T12:00:00`).getTime());
  }
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return localYmd(d);
};
const addDaysYmd = (ymd, delta) => {
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + Number(delta || 0));
  return localYmd(d);
};

const loading = ref(false);
const scopeLoading = ref(false);
const error = ref('');
const weekStart = ref(startOfWeekMondayYmd(new Date()));
const selectedDay = ref('Monday');
const viewMode = ref('table');
const search = ref('');
const onlyAvailable = ref(false);
const providers = ref([]);
const agencies = ref([]);
const organizations = ref([]);
const selectedAgencyId = ref('');
const selectedOrganizationId = ref('');

const normalizeId = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
};

const buildParams = () => {
  const agencyId = normalizeId(selectedAgencyId.value || props.agencyId);
  const organizationId = normalizeId(selectedOrganizationId.value || props.organizationId);
  const params = {};
  if (agencyId) params.agencyId = Number(agencyId);
  if (organizationId) params.organizationId = Number(organizationId);
  return params;
};

const loadScopeOptions = async () => {
  if (!props.showScopeFilters) return;
  try {
    scopeLoading.value = true;
    const requestAgencyId = normalizeId(selectedAgencyId.value || props.agencyId);
    const res = await api.get('/availability/admin/skill-builders/options', {
      params: requestAgencyId ? { agencyId: Number(requestAgencyId) } : {}
    });
    const nextAgencies = Array.isArray(res.data?.agencies) ? res.data.agencies : [];
    const nextOrganizations = Array.isArray(res.data?.organizations) ? res.data.organizations : [];
    agencies.value = nextAgencies;
    organizations.value = nextOrganizations;

    const resolvedAgencyId = normalizeId(selectedAgencyId.value || props.agencyId || res.data?.agencyId);
    const agencyExists = nextAgencies.some((a) => String(a.id) === resolvedAgencyId);
    if (agencyExists) selectedAgencyId.value = resolvedAgencyId;
    else selectedAgencyId.value = nextAgencies.length > 0 ? String(nextAgencies[0].id) : '';

    const resolvedOrgId = normalizeId(selectedOrganizationId.value || props.organizationId);
    const orgExists = nextOrganizations.some((o) => String(o.id) === resolvedOrgId);
    selectedOrganizationId.value = orgExists ? resolvedOrgId : '';
  } catch {
    agencies.value = [];
    organizations.value = [];
  } finally {
    scopeLoading.value = false;
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/availability/admin/skill-builders', {
      params: { weekStart: weekStart.value, ...buildParams() }
    });
    providers.value = Array.isArray(res.data?.providers) ? res.data.providers : [];
  } catch (e) {
    providers.value = [];
    error.value = e.response?.data?.error?.message || 'Failed to load Skill Builder availability';
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  selectedAgencyId.value = normalizeId(props.agencyId);
  selectedOrganizationId.value = normalizeId(props.organizationId);
  await loadScopeOptions();
  await load();
});

watch(
  () => props.agencyId,
  async (next) => {
    selectedAgencyId.value = normalizeId(next);
    selectedOrganizationId.value = '';
    await loadScopeOptions();
    await load();
  }
);

watch(
  () => props.organizationId,
  async (next) => {
    selectedOrganizationId.value = normalizeId(next);
    await load();
  }
);

watch(selectedAgencyId, async (next, prev) => {
  if (!props.showScopeFilters) return;
  if (String(next || '') === String(prev || '')) return;
  selectedOrganizationId.value = '';
  await loadScopeOptions();
  await load();
});

watch(selectedOrganizationId, async (next, prev) => {
  if (String(next || '') === String(prev || '')) return;
  await load();
});

const prevWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, -7);
  load();
};
const nextWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, 7);
  load();
};

const norm = (s) => String(s || '').trim().toLowerCase();

/** Display HH:MM or HH:MM:SS as 12-hour (e.g. 3:00 PM). */
function formatTime12FromHm(s) {
  const raw = String(s || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return raw;
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return raw;
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(mi).padStart(2, '0')} ${ampm}`;
}

function formatHmRange12(st, et) {
  const a = String(st || '').slice(0, 5);
  const b = String(et || '').slice(0, 5);
  if (!a || !b) return '—';
  return `${formatTime12FromHm(a)}–${formatTime12FromHm(b)}`;
}

const filteredProviders = computed(() => {
  const q = norm(search.value);
  if (!q) return providers.value || [];
  return (providers.value || []).filter((p) => {
    const hay = `${p.firstName || ''} ${p.lastName || ''} ${p.email || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

const allBlocks = computed(() => {
  const out = [];
  for (const p of filteredProviders.value || []) {
    const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || `User ${p.id}`;
    for (const b of p.blocks || []) {
      const isBooked = !!b.isBooked;
      if (onlyAvailable.value && isBooked) continue;
      const st = String(b.startTime || '').slice(0, 5);
      const et = String(b.endTime || '').slice(0, 5);
      const departRaw = String(b.departTime || '').trim();
      out.push({
        providerId: Number(p.id),
        dayOfWeek: String(b.dayOfWeek || ''),
        key: `${p.id}|${b.dayOfWeek}|${b.blockType}|${st}|${et}|${b.departFrom}|${b.departTime || ''}|${isBooked ? 1 : 0}`,
        providerName: name,
        email: p.email || '',
        blockTypeLabel: String(b.blockType || '').replace(/_/g, ' '),
        timeLabel: st && et ? formatHmRange12(st, et) : '—',
        departFrom: String(b.departFrom || '').trim() || '—',
        departTime: departRaw,
        departTimeLabel: departRaw ? formatTime12FromHm(departRaw) : '',
        isBooked
      });
    }
  }
  return out;
});

const rows = computed(() => allBlocks.value.filter((r) => String(r.dayOfWeek) === String(selectedDay.value)));

const selectedAgencyName = computed(() => {
  const id = normalizeId(selectedAgencyId.value);
  if (!id) return '';
  const row = (agencies.value || []).find((a) => String(a.id) === id);
  return row?.name || '';
});

const selectedOrganizationName = computed(() => {
  const id = normalizeId(selectedOrganizationId.value);
  if (!id) return '';
  const row = (organizations.value || []).find((o) => String(o.id) === id);
  return row?.name || '';
});

const calendarProviders = computed(() => {
  const byProvider = new Map();
  for (const block of allBlocks.value || []) {
    const id = Number(block.providerId);
    if (!byProvider.has(id)) {
      byProvider.set(id, {
        id,
        providerName: block.providerName,
        email: block.email,
        days: {
          Monday: [],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
          Saturday: [],
          Sunday: []
        }
      });
    }
    const row = byProvider.get(id);
    if (row.days[block.dayOfWeek]) row.days[block.dayOfWeek].push(block);
  }
  for (const row of byProvider.values()) {
    for (const d of days) {
      row.days[d].sort((a, b) => String(a.timeLabel).localeCompare(String(b.timeLabel)));
    }
  }
  return Array.from(byProvider.values()).sort((a, b) => String(a.providerName).localeCompare(String(b.providerName)));
});

</script>

<style scoped>
.sbap-wrap { width: 100%; }
.page-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.subtitle {
  color: var(--text-secondary);
  font-size: 13px;
}
.scope-toolbar {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: white;
}
.scope-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 260px;
}
.scope-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.day-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.day-tab {
  border: 1px solid var(--border);
  background: white;
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 800;
  cursor: pointer;
}
.day-tab.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(198, 154, 43, 0.18);
}
.toolbar-right {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.view-toggle {
  display: flex;
  gap: 6px;
}
.view-toggle .btn.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(198, 154, 43, 0.18);
}
.chk-inline { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.results { margin-top: 14px; }
.summary { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.pill { background: var(--bg-alt); border: 1px solid var(--border); padding: 8px 10px; border-radius: 999px; font-size: 13px; }
.empty { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 14px; color: var(--text-secondary); }
.table { background: white; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.thead, .trow {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 1.2fr 0.6fr;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
}
.thead {
  background: var(--bg-alt);
  border-bottom: 1px solid var(--border);
  font-weight: 900;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
.trow { border-bottom: 1px solid var(--border); }
.trow:last-child { border-bottom: none; }
.provider-name { font-weight: 900; }
.muted.small { font-size: 12px; color: var(--text-secondary); }
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 900;
  font-size: 12px;
  border: 1px solid rgba(0,0,0,0.12);
}
.badge-available { background: rgba(34, 197, 94, 0.14); color: rgba(20, 83, 45, 0.95); }
.badge-booked { background: rgba(239, 68, 68, 0.12); color: rgba(127, 29, 29, 0.95); }
.input { flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
.scope-select { min-width: 260px; }
.calendar-wrap {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
}
.provider-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.provider-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.provider-card-head {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
}
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.day-col {
  min-height: 112px;
  padding: 8px;
  border-right: 1px solid var(--border);
}
.day-col:last-child { border-right: none; }
.day-col-head {
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.block-chip {
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
  border: 1px solid rgba(0,0,0,0.12);
}
.chip-available { background: rgba(34, 197, 94, 0.1); }
.chip-booked { background: rgba(239, 68, 68, 0.1); }
.chip-time { font-weight: 900; font-size: 12px; }
.chip-meta { font-size: 11px; color: var(--text-secondary); }
</style>

