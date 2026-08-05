<template>
  <div class="sa-page">
    <header class="sa-header">
      <div>
        <h1 class="sa-title">School Approvals</h1>
        <p class="sa-subtitle">
          Review schedule adjustments and additional school-hour requests. Current vs requested changes are highlighted.
        </p>
      </div>
      <div class="sa-header-actions">
        <router-link class="btn btn-secondary btn-sm" :to="scheduleHubTo">Schedule hub</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="providerManagementTo">Provider Management</router-link>
        <button type="button" class="btn btn-primary btn-sm" :disabled="loading" @click="refresh">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div class="sa-tabs" role="tablist">
      <button
        type="button"
        class="sa-tab"
        :class="{ active: tab === 'adjustments' }"
        role="tab"
        :aria-selected="tab === 'adjustments'"
        @click="setTab('adjustments')"
      >
        Schedule adjustments
        <span v-if="adjustments.length" class="sa-badge">{{ adjustments.length }}</span>
      </button>
      <button
        type="button"
        class="sa-tab"
        :class="{ active: tab === 'hours' }"
        role="tab"
        :aria-selected="tab === 'hours'"
        @click="setTab('hours')"
      >
        Additional school hours
        <span v-if="additionalHours.length" class="sa-badge secondary">{{ additionalHours.length }}</span>
      </button>
    </div>

    <div v-if="error" class="sa-error">{{ error }}</div>
    <div v-else-if="loading && !activeList.length" class="sa-empty">Loading school requests…</div>
    <div v-else-if="!activeList.length" class="sa-empty">
      <div class="sa-empty-title">
        {{ tab === 'adjustments' ? 'No pending schedule adjustments' : 'No pending additional school hours requests' }}
      </div>
      <p class="muted">
        {{ tab === 'adjustments'
          ? 'When providers request changes to an existing school day, they appear here.'
          : 'New weekday daytime hour requests will show up here for accept & apply.' }}
      </p>
    </div>

    <div v-else class="sa-workspace">
      <aside class="sa-queue">
        <div class="sa-panel-head">
          <div class="sa-panel-title-row">
            <h2>{{ tab === 'adjustments' ? 'Pending adjustments' : 'Pending additional hours' }}</h2>
            <span class="sa-badge danger">{{ filteredList.length }}</span>
          </div>
          <input
            v-model="searchQuery"
            type="search"
            class="sa-search"
            placeholder="Search by provider or school…"
            aria-label="Search requests"
          />
        </div>
        <div class="sa-queue-list">
          <button
            v-for="r in filteredList"
            :key="r.id"
            type="button"
            class="sa-request-card"
            :class="{ selected: selectedId === r.id }"
            @click="selectedId = r.id"
          >
            <div class="sa-avatar" :style="{ background: avatarColor(r.providerName) }">
              {{ initials(r.providerName) }}
            </div>
            <div class="sa-request-main">
              <div class="sa-request-name">{{ r.providerName || 'Provider' }}</div>
              <div class="sa-request-meta">
                {{ summaryLine(r) }}
              </div>
              <div class="sa-request-meta">{{ formatWhen(r.createdAt) }}</div>
            </div>
            <span class="sa-status-pill">Pending</span>
          </button>
        </div>
      </aside>

      <section v-if="selected" class="sa-detail">
        <div class="sa-summary-card">
          <div class="sa-summary-top">
            <div>
              <h2>{{ selected.providerName || 'Provider' }}</h2>
              <span class="sa-status-pill pending">Pending approval</span>
            </div>
            <div class="sa-detail-actions">
              <template v-if="tab === 'hours'">
                <button type="button" class="btn btn-primary" :disabled="saving" @click="acceptHours">
                  {{ saving ? 'Working…' : 'Accept & apply' }}
                </button>
                <button type="button" class="btn btn-secondary" :disabled="saving" @click="denySelected">
                  Deny
                </button>
              </template>
              <template v-else>
                <button type="button" class="btn btn-primary" :disabled="saving" @click="approveAdjustment">
                  {{ saving ? 'Working…' : 'Approve' }}
                </button>
                <router-link class="btn btn-secondary" :to="providerManagementTo">Open Provider Management</router-link>
                <button type="button" class="btn btn-secondary" :disabled="saving" @click="denySelected">
                  Dismiss
                </button>
              </template>
            </div>
          </div>

          <dl class="sa-dl">
            <div>
              <dt>Request ID</dt>
              <dd>REQ-{{ selected.id }}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{{ formatWhen(selected.createdAt) }}</dd>
            </div>
            <div>
              <dt>School</dt>
              <dd>{{ parsed.school || schoolNameFromIds(selected) || '—' }}</dd>
            </div>
            <div>
              <dt>Day</dt>
              <dd>{{ parsed.day || primaryBlock(selected)?.dayOfWeek || '—' }}</dd>
            </div>
          </dl>
        </div>

        <div class="sa-schedule-card">
          <h3>Provider schedule overview</h3>
          <p class="sa-schedule-lead">All current school days and office hours for this provider.</p>

          <div v-if="scheduleLoading" class="muted">Loading schedule…</div>
          <div v-else-if="scheduleError" class="sa-schedule-error">{{ scheduleError }}</div>
          <template v-else>
            <div v-if="!schoolScheduleRows.length && !officeScheduleRows.length" class="muted">
              No school or office schedule on file for this provider.
            </div>

            <div v-if="schoolScheduleRows.length" class="sa-schedule-section">
              <h4>School days</h4>
              <table class="sa-schedule-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>School</th>
                    <th>Hours</th>
                    <th>Slots</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in schoolScheduleRows"
                    :key="`${row.schoolOrganizationId}-${row.dayOfWeek}`"
                    :class="{ 'sa-schedule-highlight': isAdjustmentDayRow(row) }"
                  >
                    <td>
                      {{ row.dayOfWeek }}
                      <span v-if="isAdjustmentDayRow(row)" class="sa-schedule-tag">This request</span>
                    </td>
                    <td>{{ row.schoolName }}</td>
                    <td>{{ formatTimeRange(row.startTime, row.endTime) }}</td>
                    <td>{{ row.slotsTotal }} total · {{ row.slotsAvailable }} open</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="officeScheduleRows.length" class="sa-schedule-section">
              <h4>Office hours</h4>
              <ul class="sa-office-list">
                <li v-for="(row, idx) in officeScheduleRows" :key="idx">
                  <strong>{{ row.dayOfWeek }}</strong>
                  <div class="sa-office-detail">
                    <span class="sa-office-name">{{ row.officeName }}</span>
                    <span class="sa-office-times">
                      <template v-for="(range, ri) in row.ranges" :key="ri">
                        {{ formatHour(range.start) }}–{{ formatHour(range.end) }}<template v-if="ri < row.ranges.length - 1">, </template>
                      </template>
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </template>
        </div>

        <!-- Current vs requested comparison -->
        <div class="sa-compare-card">
          <h3>{{ tab === 'adjustments' ? 'Current schedule vs requested changes' : 'Requested additional hours' }}</h3>

          <div v-if="tab === 'adjustments'" class="sa-compare-grid">
            <article class="sa-compare-col current">
              <header>Current</header>
              <div class="sa-compare-row">
                <span>Hours</span>
                <strong>{{ parsed.currentHours || '—' }}</strong>
              </div>
              <div class="sa-compare-row">
                <span>Slots</span>
                <strong>{{ formatSlotsTotalDisplay(parsed.currentSlots) }}</strong>
              </div>
            </article>
            <article class="sa-compare-col requested" :class="{ changed: hasChanges }">
              <header>Requested</header>
              <div class="sa-compare-row" :class="{ highlight: hoursDiff }">
                <span>Hours</span>
                <strong>{{ parsed.requestedHours || blockHours(selected) || '—' }}</strong>
                <em v-if="hoursDiff">changed</em>
              </div>
              <div class="sa-compare-row" :class="{ highlight: slotsDiff }">
                <span>Slots</span>
                <strong>
                  {{ formatSlotsTotalDisplay(parsed.requestedSlots) }}
                  <template v-if="slotsDiff && parsed.slotsDelta"> ({{ parsed.slotsDelta.startsWith('+') || parsed.slotsDelta.startsWith('-') ? parsed.slotsDelta : `+${parsed.slotsDelta}` }})</template>
                </strong>
                <em v-if="slotsDiff">changed</em>
              </div>
            </article>
          </div>

          <div v-else class="sa-hours-blocks">
            <div v-if="!selected.blocks?.length" class="muted">No daytime blocks on this request.</div>
            <div v-for="(b, idx) in selected.blocks || []" :key="idx" class="sa-block-pill">
              {{ b.dayOfWeek }} {{ formatTimeRange(b.startTime, b.endTime) }}
            </div>
          </div>

          <p v-if="parsed.note || (tab === 'hours' && selected.notes && !parsed.school)" class="sa-note">
            <strong>{{ tab === 'hours' ? 'Hoping to accomplish:' : 'Note:' }}</strong>
            {{ parsed.note || selected.notes }}
          </p>

          <p v-if="tab === 'adjustments'" class="sa-hint">
            Approve applies the requested hours and slots to this provider's existing school assignment.
          </p>
        </div>

        <div v-if="tab === 'hours'" class="sa-apply-card">
          <h3>Accept &amp; apply</h3>
          <div class="sa-apply-grid">
            <label>
              <span>School</span>
              <select v-model="hoursForm.schoolOrgId">
                <option value="">Select school…</option>
                <option v-for="s in schools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
              </select>
            </label>
            <label>
              <span>Use block</span>
              <select v-model="hoursForm.blockKey">
                <option value="">Select block…</option>
                <option
                  v-for="opt in selected.blocks || []"
                  :key="blockKey(opt)"
                  :value="blockKey(opt)"
                >
                  {{ opt.dayOfWeek }} {{ formatTimeRange(opt.startTime, opt.endTime) }}
                </option>
              </select>
            </label>
            <label>
              <span>Slots total</span>
              <input v-model.number="hoursForm.slotsTotal" type="number" min="0" />
            </label>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import {
  formatSlotsTotalDisplay,
  hoursChanged,
  parseSchoolRequestNotes,
  scheduleAdjustmentHasChanges,
  slotsChanged
} from '../../utils/schoolRequestNotes.js';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);
const scheduleHubTo = computed(() => orgTo('/schedule'));
const providerManagementTo = computed(() => ({
  path: orgTo('/admin/provider-availability'),
  query: agencyId.value ? { agencyId: String(agencyId.value) } : {}
}));

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || route.query.agencyId || 0));
const tab = ref('adjustments');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const searchQuery = ref('');
const adjustments = ref([]);
const additionalHours = ref([]);
const schools = ref([]);
const selectedId = ref(null);
const hoursForm = reactive({ schoolOrgId: '', blockKey: '', slotsTotal: 1 });
const scheduleLoading = ref(false);
const scheduleError = ref('');
const providerSchedule = ref({ schoolSlots: [], officeAvailability: [] });
let scheduleLoadToken = 0;

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const activeList = computed(() => (tab.value === 'hours' ? additionalHours.value : adjustments.value));

const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return activeList.value;
  return activeList.value.filter((r) => {
    const parsed = parseSchoolRequestNotes(r.notes);
    const hay = `${r.providerName || ''} ${parsed.school || ''} ${parsed.day || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

const selected = computed(() => filteredList.value.find((r) => r.id === selectedId.value) || activeList.value.find((r) => r.id === selectedId.value) || null);
const parsed = computed(() => parseSchoolRequestNotes(selected.value?.notes));
const hoursDiff = computed(() => hoursChanged(parsed.value));
const slotsDiff = computed(() => slotsChanged(parsed.value));
const hasChanges = computed(() => hoursDiff.value || slotsDiff.value);

const adjustmentDay = computed(() => {
  if (!selected.value) return '';
  return parsed.value.day || primaryBlock(selected.value)?.dayOfWeek || '';
});

const adjustmentSchool = computed(() => {
  if (!selected.value) return '';
  return parsed.value.school || schoolNameFromIds(selected.value) || '';
});

const schoolScheduleRows = computed(() => {
  const rows = providerSchedule.value.schoolSlots || [];
  return [...rows].sort((a, b) => {
    const schoolCmp = String(a.schoolName || '').localeCompare(String(b.schoolName || ''));
    if (schoolCmp !== 0) return schoolCmp;
    return weekdayOrder(a.dayOfWeek) - weekdayOrder(b.dayOfWeek);
  });
});

const officeScheduleRows = computed(() => {
  const slots = providerSchedule.value.officeAvailability || [];
  const groups = new Map();
  for (const slot of slots) {
    const key = `${slot.dayOfWeek}|${slot.officeLocationId || slot.officeName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        dayOfWeek: slot.dayOfWeek,
        officeName: slot.officeName || 'Office',
        hours: []
      });
    }
    const hour = Number(slot.hour);
    if (Number.isFinite(hour)) groups.get(key).hours.push(hour);
  }

  const out = [];
  for (const group of groups.values()) {
    const hours = [...new Set(group.hours)].sort((a, b) => a - b);
    const ranges = [];
    let start = null;
    let end = null;
    for (const hour of hours) {
      if (start === null) {
        start = hour;
        end = hour;
        continue;
      }
      if (hour === end + 1) {
        end = hour;
        continue;
      }
      ranges.push({ start, end: end + 1 });
      start = hour;
      end = hour;
    }
    if (start !== null) ranges.push({ start, end: end + 1 });
    out.push({ ...group, ranges });
  }

  return out.sort((a, b) => weekdayOrder(a.dayOfWeek) - weekdayOrder(b.dayOfWeek));
});

function setTab(next) {
  tab.value = next;
  const query = { ...route.query, tab: next };
  router.replace({ path: route.path, query }).catch(() => {});
  selectedId.value = activeList.value[0]?.id || null;
  syncHoursForm();
}

function syncHoursForm() {
  const r = selected.value;
  if (!r || tab.value !== 'hours') return;
  const pref = Array.isArray(r.preferredSchoolOrgIds) ? r.preferredSchoolOrgIds[0] : null;
  hoursForm.schoolOrgId = pref ? String(pref) : '';
  const b = r.blocks?.[0];
  hoursForm.blockKey = b ? blockKey(b) : '';
  hoursForm.slotsTotal = 1;
}

function blockKey(b) {
  return `${b.dayOfWeek}|${b.startTime}|${b.endTime}`;
}

function weekdayOrder(day) {
  const idx = WEEKDAY_ORDER.indexOf(String(day || ''));
  return idx >= 0 ? idx : 99;
}

function isAdjustmentDayRow(row) {
  const day = adjustmentDay.value;
  if (!day || String(row.dayOfWeek) !== day) return false;
  const school = adjustmentSchool.value;
  if (!school) return true;
  return String(row.schoolName || '').toLowerCase() === school.toLowerCase();
}

function formatHour(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return '—';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:00 ${ampm}`;
}

async function loadProviderSchedule() {
  const providerId = Number(selected.value?.providerId || 0);
  if (!providerId || !agencyId.value) {
    providerSchedule.value = { schoolSlots: [], officeAvailability: [] };
    scheduleError.value = '';
    return;
  }

  const token = ++scheduleLoadToken;
  scheduleLoading.value = true;
  scheduleError.value = '';
  try {
    const resp = await api.get('/availability/admin/provider-availability-dashboard', {
      params: { agencyId: agencyId.value, providerId },
      skipGlobalLoading: true
    });
    if (token !== scheduleLoadToken) return;
    providerSchedule.value = {
      schoolSlots: resp.data?.schoolSlots || [],
      officeAvailability: resp.data?.officeAvailability || []
    };
  } catch (e) {
    if (token !== scheduleLoadToken) return;
    scheduleError.value = e?.response?.data?.error?.message || 'Failed to load provider schedule';
    providerSchedule.value = { schoolSlots: [], officeAvailability: [] };
  } finally {
    if (token === scheduleLoadToken) scheduleLoading.value = false;
  }
}

function primaryBlock(r) {
  return r?.blocks?.[0] || null;
}

function blockHours(r) {
  const b = primaryBlock(r);
  if (!b) return '';
  return formatTimeRange(b.startTime, b.endTime);
}

function summaryLine(r) {
  const p = parseSchoolRequestNotes(r.notes);
  if (tab.value === 'adjustments') {
    const day = p.day || primaryBlock(r)?.dayOfWeek || 'Day';
    const school = p.school || 'School';
    return `${school} · ${day}`;
  }
  const blocks = (r.blocks || []).map((b) => b.dayOfWeek).filter(Boolean);
  return blocks.length ? blocks.join(', ') : 'Additional hours';
}

function schoolNameFromIds(r) {
  const id = Array.isArray(r.preferredSchoolOrgIds) ? r.preferredSchoolOrgIds[0] : null;
  if (!id) return '';
  return schools.value.find((s) => Number(s.id) === Number(id))?.name || '';
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function formatTimeRange(start, end) {
  const fmt = (t) => {
    const s = String(t || '').slice(0, 5);
    const [h, m] = s.split(':').map(Number);
    if (!Number.isFinite(h)) return s || '—';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m || 0).padStart(2, '0')} ${ampm}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
}

function avatarColor(name) {
  const s = String(name || 'x');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  const hues = [160, 200, 24, 280, 340, 40];
  return `hsl(${hues[hash % hues.length]} 45% 42%)`;
}

async function refresh() {
  if (!agencyId.value) {
    error.value = 'Select an agency to review school requests.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [adjResp, hoursResp, schoolsResp] = await Promise.all([
      api.get('/availability/admin/school-requests', {
        params: { agencyId: agencyId.value, status: 'PENDING', requestKind: 'schedule_adjustment' },
        skipGlobalLoading: true
      }),
      api.get('/availability/admin/school-requests', {
        params: { agencyId: agencyId.value, status: 'PENDING', requestKind: 'additional_hours' },
        skipGlobalLoading: true
      }),
      api.get(`/agencies/${agencyId.value}/affiliated-organizations`, { skipGlobalLoading: true })
    ]);
    adjustments.value = (Array.isArray(adjResp.data) ? adjResp.data : []).filter((r) =>
      scheduleAdjustmentHasChanges(parseSchoolRequestNotes(r.notes))
    );
    additionalHours.value = Array.isArray(hoursResp.data) ? hoursResp.data : [];
    schools.value = (schoolsResp.data || []).filter(
      (o) => String(o.organization_type || 'agency').toLowerCase() !== 'agency'
    );

    if (!selectedId.value || !activeList.value.some((r) => r.id === selectedId.value)) {
      selectedId.value = activeList.value[0]?.id || null;
    }
    syncHoursForm();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load school requests';
  } finally {
    loading.value = false;
  }
}

async function denySelected() {
  if (!selected.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/availability/admin/school-requests/${selected.value.id}/deny`, {
      agencyId: agencyId.value
    });
    await refresh();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to dismiss request';
  } finally {
    saving.value = false;
  }
}

async function approveAdjustment() {
  if (!selected.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/availability/admin/school-requests/${selected.value.id}/approve-adjustment`, {
      agencyId: agencyId.value
    });
    await refresh();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to approve adjustment';
  } finally {
    saving.value = false;
  }
}

async function acceptHours() {
  if (!selected.value) return;
  if (!hoursForm.schoolOrgId || !hoursForm.blockKey) {
    error.value = 'School and block are required.';
    return;
  }
  const [dayOfWeek, startTime, endTime] = String(hoursForm.blockKey).split('|');
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/availability/admin/school-requests/${selected.value.id}/assign`, {
      agencyId: agencyId.value,
      schoolOrganizationId: Number(hoursForm.schoolOrgId),
      dayOfWeek,
      startTime,
      endTime,
      slotsTotal: Number(hoursForm.slotsTotal || 1)
    });
    await refresh();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to assign school availability';
  } finally {
    saving.value = false;
  }
}

function resolveInitialTab() {
  const q = String(route.query.tab || '').toLowerCase();
  if (q === 'hours' || q === 'school' || q === 'additional_hours') return 'hours';
  if (q === 'adjustments' || q === 'schedule_adjustments') return 'adjustments';
  return 'adjustments';
}

watch(selectedId, () => {
  syncHoursForm();
  loadProviderSchedule();
});
watch(agencyId, () => refresh());
watch(
  () => route.query.tab,
  () => {
    tab.value = resolveInitialTab();
  }
);

onMounted(async () => {
  tab.value = resolveInitialTab();
  if (route.query.agencyId && !agencyStore.currentAgency?.id) {
    await agencyStore.fetchUserAgencies?.();
  }
  await refresh();
  // If defaulted to adjustments but empty and hours exist, switch
  if (tab.value === 'adjustments' && !adjustments.value.length && additionalHours.value.length) {
    setTab('hours');
  }
});
</script>

<style scoped>
.sa-page {
  --sa-ink: color-mix(in srgb, var(--primary, #1f6b4a) 18%, #0f172a);
  --sa-muted: #64748b;
  --sa-line: #e2e8f0;
  --sa-panel: #fff;
  --sa-accent: var(--primary, #1f6b4a);
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 24px 24px 48px;
  box-sizing: border-box;
  min-height: calc(100vh - 72px);
  min-height: calc(100dvh - 72px);
  color: var(--sa-ink);
}
.sa-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.sa-title {
  margin: 0;
  font-size: clamp(1.5rem, 2.2vw, 1.9rem);
  font-weight: 800;
  color: var(--sa-accent);
}
.sa-subtitle {
  margin: 6px 0 0;
  color: var(--sa-muted);
  font-size: 14px;
  max-width: 58ch;
  line-height: 1.45;
}
.sa-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sa-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.sa-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--sa-line);
  background: #fff;
  font-weight: 750;
  cursor: pointer;
  color: var(--sa-ink);
}
.sa-tab.active {
  border-color: var(--sa-accent);
  box-shadow: inset 0 0 0 1px var(--sa-accent);
  background: color-mix(in srgb, var(--sa-accent) 8%, #fff);
}
.sa-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #2563eb;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.sa-badge.secondary { background: #64748b; }
.sa-badge.danger { background: #dc2626; }
.sa-error {
  padding: 12px 14px;
  border-radius: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  margin-bottom: 12px;
}
.sa-empty {
  padding: 28px;
  border: 1px solid var(--sa-line);
  border-radius: 16px;
  background: #fff;
  text-align: center;
}
.sa-empty-title { font-weight: 800; margin-bottom: 6px; }
.muted { color: var(--sa-muted); }
.sa-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 340px) 1fr;
  gap: 14px;
  align-items: start;
}
.sa-queue,
.sa-summary-card,
.sa-schedule-card,
.sa-compare-card,
.sa-apply-card {
  background: var(--sa-panel);
  border: 1px solid var(--sa-line);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.sa-queue { padding: 14px; }
.sa-panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.sa-panel-title-row h2,
.sa-schedule-card h3,
.sa-compare-card h3,
.sa-apply-card h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
}
.sa-search {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--sa-line);
  border-radius: 10px;
  margin-bottom: 10px;
}
.sa-queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 70vh;
  overflow: auto;
}
.sa-request-card {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: 1px solid var(--sa-line);
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
}
.sa-request-card.selected {
  border-color: var(--sa-accent);
  background: color-mix(in srgb, var(--sa-accent) 8%, #fff);
  box-shadow: inset 0 0 0 1px var(--sa-accent);
}
.sa-avatar {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 12px;
}
.sa-request-name { font-weight: 750; }
.sa-request-meta {
  color: var(--sa-muted);
  font-size: 12px;
  line-height: 1.35;
}
.sa-status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  background: #e2e8f0;
  color: #334155;
  height: fit-content;
}
.sa-status-pill.pending {
  background: #ffedd5;
  color: #c2410c;
}
.sa-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sa-summary-card,
.sa-schedule-card,
.sa-compare-card,
.sa-apply-card {
  padding: 16px;
}
.sa-schedule-lead {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sa-muted);
}
.sa-schedule-error {
  padding: 10px 12px;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
}
.sa-schedule-section + .sa-schedule-section {
  margin-top: 14px;
}
.sa-schedule-section h4 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sa-muted);
}
.sa-schedule-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.sa-schedule-table th,
.sa-schedule-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--sa-line);
  text-align: left;
  vertical-align: top;
}
.sa-schedule-table th {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sa-muted);
}
.sa-schedule-highlight {
  background: color-mix(in srgb, var(--sa-accent) 10%, #fff);
}
.sa-schedule-tag {
  display: inline-flex;
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #ffedd5;
  color: #c2410c;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  vertical-align: middle;
}
.sa-office-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sa-office-list li {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 4px 10px;
  align-items: start;
  font-size: 14px;
  padding: 8px 10px;
  border: 1px solid var(--sa-line);
  border-radius: 10px;
  background: #f8fafc;
}
.sa-office-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sa-office-name {
  color: var(--sa-muted);
  font-weight: 650;
  font-size: 13px;
}
.sa-office-times {
  font-weight: 650;
}
.sa-summary-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.sa-summary-top h2 {
  margin: 0 0 8px;
  font-size: 1.25rem;
}
.sa-detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sa-dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  margin: 0;
}
.sa-dl dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sa-muted);
  font-weight: 700;
  margin: 0 0 2px;
}
.sa-dl dd { margin: 0; font-weight: 650; }
.sa-compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}
.sa-compare-col {
  border: 1px solid var(--sa-line);
  border-radius: 12px;
  padding: 12px;
  background: #f8fafc;
}
.sa-compare-col.requested.changed {
  border-color: #fdba74;
  background: #fff7ed;
}
.sa-compare-col header {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sa-muted);
  margin-bottom: 10px;
}
.sa-compare-row {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 14px;
}
.sa-compare-row span { color: var(--sa-muted); }
.sa-compare-row.highlight strong { color: #c2410c; }
.sa-compare-row em {
  font-style: normal;
  font-size: 11px;
  font-weight: 800;
  color: #ea580c;
  text-transform: uppercase;
}
.sa-hours-blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.sa-block-pill {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--sa-line);
  background: #f8fafc;
  font-size: 13px;
  font-weight: 650;
}
.sa-note {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--sa-ink);
  line-height: 1.45;
}
.sa-hint {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--sa-muted);
}
.sa-apply-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.sa-apply-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--sa-muted);
}
.sa-apply-grid select,
.sa-apply-grid input {
  padding: 8px 10px;
  border: 1px solid var(--sa-line);
  border-radius: 10px;
  font-weight: 600;
  color: var(--sa-ink);
}
@media (max-width: 960px) {
  .sa-workspace { grid-template-columns: 1fr; }
  .sa-compare-grid,
  .sa-apply-grid,
  .sa-dl { grid-template-columns: 1fr; }
}
</style>
