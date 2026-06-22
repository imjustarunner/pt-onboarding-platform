<template>
  <div class="kqr-root">
    <div class="kqr-header">
      <div class="kqr-header__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><polyline points="18.5 8 13 13.5 8 8.5 3 13.5"/></svg>
        Response Trends
      </div>
      <div class="kqr-header__filters">
        <select v-model="filterModule" class="kqr-select" @change="loadHeatmap">
          <option :value="null">All questionnaires</option>
          <option v-for="m in availableModules" :key="m.key" :value="m">
            {{ m.title }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="loadingHeatmap" class="kqr-loading">
      <div class="kqr-spinner" />
      <span>Loading trends…</span>
    </div>

    <div v-else-if="heatmapRows.length === 0" class="kqr-empty">
      No response data yet for this period.
    </div>

    <div v-else class="kqr-heatmap-wrap">
      <!-- Day × Hour grid -->
      <table class="kqr-heatmap" aria-label="Response heatmap by day and hour">
        <thead>
          <tr>
            <th class="kqr-heatmap__corner"></th>
            <th v-for="h in visibleHours" :key="h" class="kqr-heatmap__hour-head">
              {{ formatHour(h) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="day in dayLabels" :key="day.value">
            <th class="kqr-heatmap__day-head">{{ day.short }}</th>
            <td
              v-for="h in visibleHours"
              :key="h"
              class="kqr-heatmap__cell"
              :style="{ background: cellColor(day.value, h) }"
              :title="`${day.label} ${formatHour(h)}: ${cellCount(day.value, h)} response(s)`"
            >
              <span v-if="cellCount(day.value, h) > 0" class="kqr-heatmap__count">
                {{ cellCount(day.value, h) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="kqr-legend">
        <span class="kqr-legend__label">Fewer</span>
        <div class="kqr-legend__bar">
          <div v-for="i in 5" :key="i" class="kqr-legend__swatch" :style="{ background: heatColor(i / 5) }" />
        </div>
        <span class="kqr-legend__label">More</span>
      </div>
    </div>

    <!-- Individual responses list -->
    <div class="kqr-responses">
      <div class="kqr-responses__header">
        <div class="kqr-responses__title">Individual Responses</div>
        <div class="kqr-responses__meta" v-if="!loadingList">{{ responses.length }} shown</div>
      </div>

      <div v-if="loadingList" class="kqr-loading">
        <div class="kqr-spinner" />
        <span>Loading responses…</span>
      </div>

      <div v-else-if="responses.length === 0" class="kqr-empty" style="padding: 24px 0;">
        No responses recorded yet.
      </div>

      <table v-else class="kqr-resp-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Room</th>
            <th>Questionnaire</th>
            <th>Tagged</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in responses" :key="r.id" class="kqr-resp-row">
            <td>{{ formatDate(r.event_date) }}</td>
            <td>{{ formatHour(r.hour_of_day) }} ({{ dayLabels[r.day_of_week - 1]?.short || '' }})</td>
            <td>{{ r.room_name || '—' }}</td>
            <td>{{ r.module_title || r.intake_link_title || '—' }}</td>
            <td>
              <span v-if="r.is_client_tagged" class="kqr-tag-badge kqr-tag-badge--yes">Tagged</span>
              <span v-else class="kqr-tag-badge">—</span>
            </td>
            <td>
              <button class="kqr-view-btn" @click="openResponse(r)">View</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Response detail modal -->
    <div v-if="viewingResponse" class="kqr-modal-overlay" @click.self="viewingResponse = null">
      <div class="kqr-modal">
        <div class="kqr-modal__header">
          <h3>Response Details</h3>
          <button class="kqr-modal__close" aria-label="Close" @click="viewingResponse = null">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="kqr-modal__body">
          <div class="kqr-modal__meta">
            <span>{{ formatDate(viewingResponse.event_date) }}</span>
            <span>·</span>
            <span>{{ formatHour(viewingResponse.hour_of_day) }}</span>
            <span v-if="viewingResponse.room_name">· {{ viewingResponse.room_name }}</span>
          </div>
          <div class="kqr-modal__answers">
            <div
              v-for="(val, key) in parsedAnswers"
              :key="key"
              class="kqr-modal__answer-row"
            >
              <div class="kqr-modal__answer-key">{{ key }}</div>
              <div class="kqr-modal__answer-val">{{ val }}</div>
            </div>
          </div>
          <!-- Tag to client -->
          <div class="kqr-modal__tag-section">
            <div class="kqr-modal__tag-label">Tag to client (optional, private)</div>
            <p class="kqr-modal__tag-hint">Link this response to a client on your caseload for your own records. The kiosk never shows client names.</p>
            <div class="kqr-modal__tag-row">
              <input
                v-model="tagClientSearch"
                class="kqr-tag-input"
                placeholder="Search client name or ID…"
                @input="searchClients"
              />
              <button
                v-if="viewingResponse.is_client_tagged"
                class="kqr-btn kqr-btn--danger"
                :disabled="tagging"
                @click="tagClient(null)"
              >
                Remove tag
              </button>
            </div>
            <div v-if="clientSearchResults.length" class="kqr-client-results">
              <button
                v-for="c in clientSearchResults"
                :key="c.id"
                class="kqr-client-result"
                @click="tagClient(c.id)"
              >
                {{ c.initials }} — ID {{ c.id }}
              </button>
            </div>
            <div v-if="tagError" class="kqr-error">{{ tagError }}</div>
            <div v-if="tagSuccess" class="kqr-success">{{ tagSuccess }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  locationId: { type: [String, Number], default: null }
});

const heatmapRows = ref([]);
const responses = ref([]);
const loadingHeatmap = ref(true);
const loadingList = ref(true);
const filterModule = ref(null);
const availableModules = ref([]);
const viewingResponse = ref(null);
const tagClientSearch = ref('');
const clientSearchResults = ref([]);
const tagging = ref(false);
const tagError = ref('');
const tagSuccess = ref('');

const dayLabels = [
  { value: 1, short: 'Sun', label: 'Sunday' },
  { value: 2, short: 'Mon', label: 'Monday' },
  { value: 3, short: 'Tue', label: 'Tuesday' },
  { value: 4, short: 'Wed', label: 'Wednesday' },
  { value: 5, short: 'Thu', label: 'Thursday' },
  { value: 6, short: 'Fri', label: 'Friday' },
  { value: 7, short: 'Sat', label: 'Saturday' }
];

// Show typical business hours 6am–9pm
const visibleHours = Array.from({ length: 16 }, (_, i) => i + 6);

function formatHour(h) {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).replace(':00', '');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const heatmapMap = computed(() => {
  const m = {};
  for (const r of heatmapRows.value) {
    m[`${r.day_of_week}:${r.hour_of_day}`] = Number(r.response_count);
  }
  return m;
});

const maxCount = computed(() => {
  const vals = Object.values(heatmapMap.value);
  return vals.length ? Math.max(...vals) : 1;
});

function cellCount(day, hour) {
  return heatmapMap.value[`${day}:${hour}`] || 0;
}

function heatColor(ratio) {
  const r = Math.round(230 - ratio * 170);
  const g = Math.round(240 - ratio * 60);
  const b = Math.round(245 - ratio * 100);
  return `rgb(${r},${g},${b})`;
}

function cellColor(day, hour) {
  const c = cellCount(day, hour);
  if (c === 0) return '#f5f8fa';
  return heatColor(c / maxCount.value);
}

function buildParams() {
  const p = {};
  if (props.locationId) p.locationId = props.locationId;
  if (filterModule.value?.moduleId) p.moduleId = filterModule.value.moduleId;
  if (filterModule.value?.intakeLinkId) p.intakeLinkId = filterModule.value.intakeLinkId;
  return p;
}

async function loadHeatmap() {
  loadingHeatmap.value = true;
  try {
    const res = await api.get('/kiosk/questionnaire-responses', { params: { ...buildParams(), view: 'heatmap' } });
    heatmapRows.value = res.data?.rows || [];
    // Collect unique module/intakeLink combos for filter dropdown
    const seen = new Set();
    for (const r of heatmapRows.value) {
      if (r.module_id && !seen.has(`m:${r.module_id}`)) {
        seen.add(`m:${r.module_id}`);
      }
      if (r.intake_link_id && !seen.has(`il:${r.intake_link_id}`)) {
        seen.add(`il:${r.intake_link_id}`);
      }
    }
  } catch {
    heatmapRows.value = [];
  } finally {
    loadingHeatmap.value = false;
  }
}

async function loadList() {
  loadingList.value = true;
  try {
    const res = await api.get('/kiosk/questionnaire-responses', { params: { ...buildParams(), view: 'list', limit: 100 } });
    responses.value = res.data?.responses || [];
    // Build available modules list from responses
    const modMap = new Map();
    for (const r of responses.value) {
      if (r.module_id && !modMap.has(`m:${r.module_id}`)) {
        modMap.set(`m:${r.module_id}`, { key: `m:${r.module_id}`, moduleId: r.module_id, title: r.module_title || `Module ${r.module_id}` });
      }
      if (r.intake_link_id && !modMap.has(`il:${r.intake_link_id}`)) {
        modMap.set(`il:${r.intake_link_id}`, { key: `il:${r.intake_link_id}`, intakeLinkId: r.intake_link_id, title: r.intake_link_title || `Form ${r.intake_link_id}` });
      }
    }
    availableModules.value = [...modMap.values()];
  } catch {
    responses.value = [];
  } finally {
    loadingList.value = false;
  }
}

function openResponse(r) {
  viewingResponse.value = r;
  tagClientSearch.value = '';
  clientSearchResults.value = [];
  tagError.value = '';
  tagSuccess.value = '';
}

const parsedAnswers = computed(() => {
  if (!viewingResponse.value?.answers) return {};
  const raw = viewingResponse.value.answers;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw || {};
});

let clientSearchTimer = null;
function searchClients() {
  clearTimeout(clientSearchTimer);
  if (!tagClientSearch.value.trim()) { clientSearchResults.value = []; return; }
  clientSearchTimer = setTimeout(async () => {
    try {
      const res = await api.get('/clients', { params: { q: tagClientSearch.value, limit: 8 } });
      clientSearchResults.value = (res.data?.clients || res.data || []).slice(0, 8);
    } catch {
      clientSearchResults.value = [];
    }
  }, 300);
}

async function tagClient(clientId) {
  if (!viewingResponse.value) return;
  tagging.value = true;
  tagError.value = '';
  tagSuccess.value = '';
  try {
    await api.patch(`/kiosk/questionnaire-responses/${viewingResponse.value.id}/tag-client`, { clientId });
    viewingResponse.value.is_client_tagged = clientId != null;
    tagSuccess.value = clientId ? 'Response tagged to client.' : 'Tag removed.';
    clientSearchResults.value = [];
    tagClientSearch.value = '';
  } catch (e) {
    tagError.value = e?.response?.data?.error?.message || 'Failed to update tag.';
  } finally {
    tagging.value = false;
  }
}

onMounted(() => {
  loadHeatmap();
  loadList();
});

watch(() => props.locationId, () => {
  loadHeatmap();
  loadList();
});
</script>

<style scoped>
.kqr-root { font-family: 'Segoe UI', Arial, sans-serif; }

.kqr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}
.kqr-header__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 800;
  color: #1a2f3a;
}
.kqr-select {
  padding: 8px 12px;
  border: 1.5px solid #dde6eb;
  border-radius: 8px;
  font-size: 14px;
  color: #1a2f3a;
  background: #fff;
  cursor: pointer;
}

/* Heatmap */
.kqr-heatmap-wrap { overflow-x: auto; margin-bottom: 28px; }
.kqr-heatmap {
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}
.kqr-heatmap__corner { width: 36px; }
.kqr-heatmap__hour-head {
  font-size: 10px;
  color: #7a9aaa;
  font-weight: 600;
  text-align: center;
  padding: 4px 2px;
  min-width: 36px;
  transform: rotate(-45deg);
  transform-origin: center bottom;
  white-space: nowrap;
}
.kqr-heatmap__day-head {
  font-size: 11px;
  color: #4a6070;
  font-weight: 700;
  text-align: right;
  padding: 2px 8px 2px 0;
}
.kqr-heatmap__cell {
  width: 36px;
  height: 28px;
  text-align: center;
  vertical-align: middle;
  border: 1px solid #fff;
  border-radius: 4px;
  transition: background 0.2s;
}
.kqr-heatmap__count {
  font-size: 10px;
  font-weight: 700;
  color: #1e3a4a;
}

.kqr-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: #7a9aaa;
}
.kqr-legend__bar { display: flex; gap: 2px; }
.kqr-legend__swatch { width: 20px; height: 14px; border-radius: 3px; }

/* Response table */
.kqr-responses__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.kqr-responses__title {
  font-size: 15px;
  font-weight: 800;
  color: #1a2f3a;
}
.kqr-responses__meta { font-size: 13px; color: #7a9aaa; }

.kqr-resp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.kqr-resp-table th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid #eaeff3;
  color: #6b8494;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.kqr-resp-table td {
  padding: 10px 10px;
  border-bottom: 1px solid #f0f4f6;
  color: #1a2f3a;
  vertical-align: middle;
}
.kqr-resp-row:hover td { background: #f8fafb; }

.kqr-tag-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  background: #f0f4f6;
  color: #8aa3b0;
}
.kqr-tag-badge--yes { background: #eef6f3; color: #2e7055; }

.kqr-view-btn {
  background: none;
  border: 1.5px solid #c8dde4;
  border-radius: 7px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #3a6b7a;
  cursor: pointer;
  transition: background 0.1s;
}
.kqr-view-btn:hover { background: #f0f7fa; }

/* Modal */
.kqr-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20,40,55,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 20px;
}
.kqr-modal {
  background: #fff;
  border-radius: 18px;
  width: 100%;
  max-width: 480px;
  max-height: 90dvh;
  overflow-y: auto;
  box-shadow: 0 20px 50px rgba(0,0,0,0.2);
}
.kqr-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 16px;
  border-bottom: 1px solid #eaeff3;
}
.kqr-modal__header h3 {
  font-size: 17px;
  font-weight: 800;
  color: #1a2f3a;
  margin: 0;
}
.kqr-modal__close {
  background: none;
  border: none;
  cursor: pointer;
  color: #8aa3b0;
  padding: 4px;
  border-radius: 8px;
  line-height: 1;
}
.kqr-modal__close:hover { color: #1a2f3a; background: #f0f4f6; }
.kqr-modal__body { padding: 18px 20px 22px; }
.kqr-modal__meta {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: #6b8494;
  margin-bottom: 16px;
}
.kqr-modal__answers { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.kqr-modal__answer-row {
  display: flex;
  gap: 10px;
  font-size: 14px;
  padding: 8px 12px;
  background: #f8fafb;
  border-radius: 8px;
}
.kqr-modal__answer-key { font-weight: 600; color: #3a6b7a; min-width: 80px; flex-shrink: 0; }
.kqr-modal__answer-val { color: #1a2f3a; }
.kqr-modal__tag-section { border-top: 1px solid #eaeff3; padding-top: 16px; }
.kqr-modal__tag-label { font-size: 14px; font-weight: 700; color: #1a2f3a; margin-bottom: 4px; }
.kqr-modal__tag-hint { font-size: 12px; color: #7a9aaa; margin: 0 0 12px; line-height: 1.4; }
.kqr-modal__tag-row { display: flex; gap: 10px; align-items: center; }
.kqr-tag-input {
  flex: 1;
  padding: 9px 12px;
  border: 1.5px solid #dde6eb;
  border-radius: 9px;
  font-size: 14px;
  color: #1a2f3a;
  outline: none;
}
.kqr-tag-input:focus { border-color: #3a6b7a; }
.kqr-client-results {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  border: 1.5px solid #dde6eb;
  border-radius: 9px;
  overflow: hidden;
}
.kqr-client-result {
  padding: 9px 14px;
  text-align: left;
  background: #fff;
  border: none;
  font-size: 14px;
  color: #1a2f3a;
  cursor: pointer;
}
.kqr-client-result:hover { background: #f0f7fa; }

/* Misc */
.kqr-loading, .kqr-empty {
  padding: 32px 0;
  text-align: center;
  color: #7a9aaa;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.kqr-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #dde6eb;
  border-top-color: #3a6b7a;
  border-radius: 50%;
  animation: kqr-spin 0.7s linear infinite;
}
@keyframes kqr-spin { to { transform: rotate(360deg); } }

.kqr-btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; border: none; }
.kqr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.kqr-btn--danger { background: #fce8e6; color: #c0392b; }
.kqr-btn--danger:hover:not(:disabled) { background: #f9d5d2; }

.kqr-error { color: #c0392b; font-size: 13px; margin-top: 8px; }
.kqr-success { color: #2e7055; font-size: 13px; margin-top: 8px; }
</style>
