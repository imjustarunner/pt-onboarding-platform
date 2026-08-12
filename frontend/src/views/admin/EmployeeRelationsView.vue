<template>
  <div class="er-root">
    <div class="er-header">
      <div>
        <h2 class="er-title">Engagement & Retention</h2>
        <p class="er-subtitle">
          Service anniversary milestones — sync from start / hire dates, then track gifts owed and acknowledgements.
        </p>
      </div>
      <div class="er-header-right">
        <div v-if="canChooseAgency" class="er-agency-picker">
          <label class="er-agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="er-select">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <button class="er-btn er-btn-secondary" :disabled="loading || syncing" @click="load">
          Refresh
        </button>
        <button class="er-btn er-btn-primary" :disabled="loading || syncing || !selectedAgencyId" @click="sync">
          {{ syncing ? 'Syncing…' : 'Sync from start dates' }}
        </button>
      </div>
    </div>

    <div v-if="syncMsg" class="er-banner">{{ syncMsg }}</div>
    <div v-if="error" class="er-error">{{ error }}</div>

    <div class="er-controls">
      <div class="er-search-wrap">
        <input v-model="q" class="er-input" placeholder="Search by name or email…" />
      </div>
      <select v-model="statusFilter" class="er-select er-select-sm">
        <option value="">All statuses</option>
        <option value="upcoming">Upcoming</option>
        <option value="owed">Owed</option>
        <option value="gift_sent">Gift sent</option>
        <option value="acknowledged">Acknowledged</option>
      </select>
      <select v-model="yearsFilter" class="er-select er-select-sm">
        <option value="">All years</option>
        <option v-for="y in yearOptions" :key="y" :value="String(y)">{{ y }} year{{ y === 1 ? '' : 's' }}</option>
      </select>
    </div>

    <div class="er-stats">
      <div class="er-stat"><strong>{{ counts.owed }}</strong><span>Owed</span></div>
      <div class="er-stat"><strong>{{ counts.upcoming }}</strong><span>Upcoming</span></div>
      <div class="er-stat"><strong>{{ counts.gift_sent }}</strong><span>Gift sent</span></div>
      <div class="er-stat"><strong>{{ counts.acknowledged }}</strong><span>Acknowledged</span></div>
    </div>

    <div class="er-table-wrap">
      <table class="er-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Milestone</th>
            <th>Date</th>
            <th>Status</th>
            <th>Gift notes</th>
            <th>Assignee</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="er-empty">Loading…</td>
          </tr>
          <tr v-else-if="filtered.length === 0">
            <td colspan="6" class="er-empty">
              No milestones yet. Run <strong>Sync from start dates</strong> to create 1–5 and 10 year anniversaries.
            </td>
          </tr>
          <tr v-for="row in filtered" :key="row.id">
            <td>
              <div class="er-name">{{ fullName(row) }}</div>
              <div class="er-muted">{{ row.work_email || row.personal_email || row.email || '—' }}</div>
            </td>
            <td>{{ row.milestone_years }} year{{ Number(row.milestone_years) === 1 ? '' : 's' }}</td>
            <td>{{ fmtDate(row.milestone_date) }}</td>
            <td>
              <select
                class="er-select er-select-sm"
                :value="row.status"
                :disabled="savingId === row.id"
                @change="onStatusChange(row, $event.target.value)"
              >
                <option value="upcoming">Upcoming</option>
                <option value="owed">Owed</option>
                <option value="gift_sent">Gift sent</option>
                <option value="acknowledged">Acknowledged</option>
              </select>
            </td>
            <td>
              <input
                class="er-input er-input-inline"
                :value="row.gift_notes || ''"
                placeholder="Notes…"
                :disabled="savingId === row.id"
                @change="onNotesChange(row, $event.target.value)"
              />
            </td>
            <td class="er-muted">
              {{ assigneeName(row) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || [])
    .filter(Boolean)
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});
const canChooseAgency = computed(() => agencyChoices.value.length > 1);
const selectedAgencyId = ref(String(agencyStore.currentAgencyId || agencyChoices.value[0]?.id || ''));

const milestones = ref([]);
const loading = ref(false);
const syncing = ref(false);
const savingId = ref(null);
const error = ref('');
const syncMsg = ref('');
const q = ref('');
const statusFilter = ref('');
const yearsFilter = ref('');
const yearOptions = [1, 2, 3, 4, 5, 10];

const counts = computed(() => {
  const c = { upcoming: 0, owed: 0, gift_sent: 0, acknowledged: 0 };
  for (const m of milestones.value) {
    if (c[m.status] != null) c[m.status] += 1;
  }
  return c;
});

const filtered = computed(() => {
  let list = milestones.value;
  if (statusFilter.value) list = list.filter((m) => m.status === statusFilter.value);
  if (yearsFilter.value) list = list.filter((m) => String(m.milestone_years) === yearsFilter.value);
  if (q.value.trim()) {
    const lq = q.value.trim().toLowerCase();
    list = list.filter((m) => {
      const name = fullName(m).toLowerCase();
      const email = String(m.work_email || m.personal_email || m.email || '').toLowerCase();
      return name.includes(lq) || email.includes(lq);
    });
  }
  return list;
});

const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';
const assigneeName = (u) => {
  const n = `${u.assigned_first_name || ''} ${u.assigned_last_name || ''}`.trim();
  return n || '—';
};
const fmtDate = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const dt = new Date(`${s}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const load = async () => {
  if (!selectedAgencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/employee-relations', {
      params: { agencyId: selectedAgencyId.value }
    });
    milestones.value = Array.isArray(data?.milestones) ? data.milestones : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load milestones.';
    milestones.value = [];
  } finally {
    loading.value = false;
  }
};

const sync = async () => {
  if (!selectedAgencyId.value) return;
  syncing.value = true;
  syncMsg.value = '';
  error.value = '';
  try {
    const { data } = await api.post('/employee-relations/sync-from-start-dates', null, {
      params: { agencyId: selectedAgencyId.value }
    });
    syncMsg.value = `Synced ${data?.scanned || 0} employees — ${data?.created || 0} created, ${data?.updated || 0} updated.`;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Sync failed.';
  } finally {
    syncing.value = false;
  }
};

const patchRow = async (row, body) => {
  savingId.value = row.id;
  error.value = '';
  try {
    const { data } = await api.patch(`/employee-relations/${row.id}`, body);
    const updated = data?.milestone;
    if (updated) {
      const idx = milestones.value.findIndex((m) => m.id === row.id);
      if (idx >= 0) {
        milestones.value[idx] = { ...milestones.value[idx], ...updated };
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Update failed.';
    await load();
  } finally {
    savingId.value = null;
  }
};

const onStatusChange = (row, status) => patchRow(row, { status });
const onNotesChange = (row, giftNotes) => patchRow(row, { giftNotes });

watch(selectedAgencyId, () => load());
onMounted(load);
</script>

<style scoped>
.er-root { padding: 24px; font-family: inherit; min-height: 100vh; background: #f9fafb; }
.er-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.er-title { font-size: 28px; font-weight: 800; color: #111827; margin: 0; }
.er-subtitle { font-size: 13px; color: #6b7280; margin: 4px 0 0; max-width: 560px; }
.er-header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.er-agency-picker { display: flex; align-items: center; gap: 6px; }
.er-agency-label { font-size: 12px; color: #6b7280; }
.er-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.er-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.er-btn-primary { background: #111827; color: #fff; }
.er-btn-secondary { background: #fff; color: #374151; border: 1px solid #e5e7eb; }
.er-controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.er-search-wrap { flex: 1 1 220px; }
.er-input { width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: #fff; box-sizing: border-box; }
.er-input-inline { min-width: 160px; }
.er-select { padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: #fff; }
.er-select-sm { padding: 6px 8px; font-size: 12px; }
.er-stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.er-stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 14px; min-width: 110px; }
.er-stat strong { display: block; font-size: 20px; color: #111827; }
.er-stat span { font-size: 12px; color: #6b7280; }
.er-banner { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
.er-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
.er-table-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: auto; }
.er-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.er-table th { text-align: left; padding: 12px 14px; background: #f9fafb; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
.er-table td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
.er-name { font-weight: 600; color: #111827; }
.er-muted { color: #6b7280; font-size: 12px; }
.er-empty { text-align: center; color: #6b7280; padding: 28px 14px !important; }
</style>
