<template>
  <div class="sbap-wrap">
    <div v-if="showTitle" class="page-header">
      <div>
        <h1 style="margin: 0;">Skill Builders availability</h1>
        <p class="subtitle" style="margin: 6px 0 0;">
          Week of {{ weekStart }} • Booked blocks are visible but not considered available.
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

    <div class="toolbar">
      <div class="day-tabs">
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
        <div class="pill">Available blocks: <strong>{{ availableCount }}</strong></div>
        <div class="pill">Booked blocks: <strong>{{ bookedCount }}</strong></div>
      </div>

      <div v-if="rows.length === 0" class="empty">
        No matching Skill Builder blocks for {{ selectedDay }}.
      </div>

      <div v-else class="table">
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
            <div class="muted small" v-if="r.departTime">Depart: {{ r.departTime }}</div>
          </div>
          <div class="status">
            <span class="badge" :class="r.isBooked ? 'badge-booked' : 'badge-available'">
              {{ r.isBooked ? 'Booked' : 'Available' }}
            </span>
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
  showTitle: { type: Boolean, default: true }
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
const error = ref('');
const weekStart = ref(startOfWeekMondayYmd(new Date()));
const selectedDay = ref('Monday');
const search = ref('');
const onlyAvailable = ref(false);
const providers = ref([]);

const buildParams = () => {
  const agencyId = props.agencyId === null || props.agencyId === undefined || props.agencyId === '' ? null : Number(props.agencyId);
  return agencyId ? { agencyId } : {};
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

onMounted(() => load());

watch(
  () => props.agencyId,
  () => load()
);

const prevWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, -7);
  load();
};
const nextWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, 7);
  load();
};

const norm = (s) => String(s || '').trim().toLowerCase();

const filteredProviders = computed(() => {
  const q = norm(search.value);
  if (!q) return providers.value || [];
  return (providers.value || []).filter((p) => {
    const hay = `${p.firstName || ''} ${p.lastName || ''} ${p.email || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

const rows = computed(() => {
  const out = [];
  for (const p of filteredProviders.value || []) {
    const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || `User ${p.id}`;
    for (const b of p.blocks || []) {
      if (String(b.dayOfWeek) !== String(selectedDay.value)) continue;
      const isBooked = !!b.isBooked;
      if (onlyAvailable.value && isBooked) continue;
      const st = String(b.startTime || '').slice(0, 5);
      const et = String(b.endTime || '').slice(0, 5);
      out.push({
        key: `${p.id}|${b.dayOfWeek}|${b.blockType}|${st}|${et}|${b.departFrom}|${b.departTime || ''}|${isBooked ? 1 : 0}`,
        providerName: name,
        email: p.email || '',
        blockTypeLabel: String(b.blockType || '').replace(/_/g, ' '),
        timeLabel: st && et ? `${st}–${et}` : '—',
        departFrom: String(b.departFrom || '').trim() || '—',
        departTime: String(b.departTime || '').trim(),
        isBooked
      });
    }
  }
  return out;
});

const availableCount = computed(() => rows.value.filter((r) => !r.isBooked).length);
const bookedCount = computed(() => rows.value.filter((r) => r.isBooked).length);
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
</style>

