<template>
  <aside class="na-wq" :class="{ 'na-wq--collapsed': collapsed }" aria-label="Note Aid work queue">
    <template v-if="collapsed">
      <button
        type="button"
        class="na-wq-rail-expand"
        title="Open work queue"
        aria-label="Open work queue"
        @click="$emit('update:collapsed', false)"
      >
        ‹
      </button>
      <div class="na-wq-rail-tabs">
        <button type="button" class="na-wq-rail-tab" title="Not started" @click="$emit('update:collapsed', false)">
          <span class="na-wq-rail-dot na-wq-rail-dot--pending" />
          <em>{{ pendingCount }}</em>
        </button>
        <button type="button" class="na-wq-rail-tab" title="In progress" @click="$emit('update:collapsed', false)">
          <span class="na-wq-rail-dot na-wq-rail-dot--started" />
          <em>{{ startedCount }}</em>
        </button>
        <button
          v-if="showCosignMode"
          type="button"
          class="na-wq-rail-tab"
          title="Notes to co-sign"
          @click="openCosignMode"
        >
          <span class="na-wq-rail-dot na-wq-rail-dot--cosign" />
          <em>{{ cosignCount }}</em>
        </button>
      </div>
    </template>
    <template v-else>
    <header class="na-wq-head">
      <div>
        <strong>Work queue</strong>
        <p v-if="queueMode === 'notes'">{{ pendingCount }} not started · {{ startedCount }} in progress</p>
        <p v-else>{{ cosignCount }} awaiting your co-sign</p>
      </div>
      <div class="na-wq-head-actions">
        <button
          v-if="queueMode === 'notes'"
          type="button"
          class="na-wq-add"
          @click="$emit('add-todo')"
        >
          Add ToDo List
        </button>
        <button
          type="button"
          class="na-wq-collapse"
          title="Collapse work queue"
          aria-label="Collapse work queue"
          @click="$emit('update:collapsed', true)"
        >
          ›
        </button>
      </div>
    </header>

    <div class="na-wq-modes" role="tablist" aria-label="Work queue mode">
      <button
        type="button"
        role="tab"
        class="na-wq-mode"
        :class="{ on: queueMode === 'notes' }"
        :aria-selected="queueMode === 'notes' ? 'true' : 'false'"
        @click="setQueueMode('notes')"
      >
        Session notes
      </button>
      <button
        v-if="showCosignMode"
        type="button"
        role="tab"
        class="na-wq-mode na-wq-mode--cosign"
        :class="{ on: queueMode === 'cosign' }"
        :aria-selected="queueMode === 'cosign' ? 'true' : 'false'"
        @click="setQueueMode('cosign')"
      >
        Notes to co-sign{{ cosignCount ? ` (${cosignCount})` : '' }}
      </button>
    </div>

    <template v-if="queueMode === 'notes'">
      <div class="na-wq-legend" aria-hidden="true">
        <span class="na-wq-chip na-wq-chip--pending">Not started</span>
        <span class="na-wq-chip na-wq-chip--started">Started</span>
      </div>

      <div class="na-wq-sort">
        <label class="na-wq-sort-label" for="na-wq-sort">
          Sort
          <select id="na-wq-sort" v-model="sortField" class="na-wq-sort-select">
            <option value="date">Date</option>
            <option value="client">Client name</option>
            <option value="status">Status</option>
            <option value="code">Service code</option>
            <option value="agency">Agency</option>
          </select>
        </label>
        <button
          type="button"
          class="na-wq-sort-dir"
          :title="sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'"
          :aria-label="sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'"
          @click="toggleSortDir"
        >
          {{ sortDir === 'asc' ? '↑ Asc' : '↓ Desc' }}
        </button>
      </div>

      <div v-if="canUndoImport" class="na-wq-undo" role="status">
        <span>Last ToDo import added {{ undoImportCount }} item{{ undoImportCount === 1 ? '' : 's' }}.</span>
        <button type="button" class="na-wq-undo-btn" @click="$emit('undo-import')">Undo</button>
      </div>

      <div v-if="!visibleItems.length" class="na-wq-empty">
        Session notes that need documentation appear here. Use Add ToDo List or open pending Notes tasks.
      </div>
      <ul v-else class="na-wq-list">
        <li
          v-for="item in visibleItems"
          :key="item.id"
          class="na-wq-item"
          :class="[
            `na-wq-item--${docStatus(item)}`,
            { active: item.id === activeId }
          ]"
        >
          <button type="button" class="na-wq-item-btn" @click="$emit('select', item)">
            <div class="na-wq-item-top">
              <strong>
                <span
                  class="na-wq-conn"
                  :class="{ 'na-wq-conn--logo': !!tenantLogoUrl(item) }"
                  :style="tenantLogoUrl(item) ? undefined : connectionStyle(item)"
                  :title="tenantTitle(item)"
                  aria-hidden="true"
                >
                  <img
                    v-if="tenantLogoUrl(item)"
                    :src="tenantLogoUrl(item)"
                    alt=""
                    class="na-wq-tenant-logo"
                    @error="onLogoError(item)"
                  />
                  <span v-else v-html="connectionIconSvg(item)" />
                </span>
                {{ item.clientName }}
              </strong>
              <span>{{ statusLabel(item) }}</span>
            </div>
            <div class="na-wq-item-meta">
              {{ formatQueueDate(item.date) }}
              <template v-if="item.timeLabel"> · {{ item.timeLabel }}</template>
              · {{ typeLabel(item) }}
            </div>
          </button>
          <button
            v-if="canRemoveQueueItem(item)"
            type="button"
            class="na-wq-delete"
            :title="removeQueueTitle(item)"
            @click.stop="$emit('delete', item)"
          >
            ×
          </button>
        </li>
      </ul>
    </template>

    <template v-else>
      <div class="na-wq-sort">
        <label class="na-wq-sort-label" for="na-wq-cosign-sort">
          Sort
          <select id="na-wq-cosign-sort" v-model="cosignSortField" class="na-wq-sort-select">
            <option value="date">Date signed</option>
            <option value="provider">Provider</option>
            <option value="client">Client</option>
          </select>
        </label>
      </div>
      <div v-if="cosignLoading" class="na-wq-empty">Loading notes awaiting co-sign…</div>
      <div v-else-if="!sortedCosignItems.length" class="na-wq-empty">
        No supervisee notes are waiting for your co-signature.
      </div>
      <ul v-else class="na-wq-list">
        <li
          v-for="item in sortedCosignItems"
          :key="item.id"
          class="na-wq-item na-wq-item--cosign"
          :class="{ active: String(activeCosignId) === String(item.id) }"
        >
          <button type="button" class="na-wq-item-btn" @click="$emit('select-cosign', item)">
            <div class="na-wq-item-top">
              <strong>{{ item.clientName || `Note #${item.clinicalNoteId}` }}</strong>
              <span>Co-sign</span>
            </div>
            <div class="na-wq-item-meta">
              {{ item.providerName || 'Provider' }}
              <template v-if="item.date"> · {{ formatQueueDate(item.date) }}</template>
              <template v-if="item.serviceCode"> · {{ item.serviceCode }}</template>
            </div>
          </button>
        </li>
      </ul>
    </template>
    </template>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import {
  DOC_STATUS,
  deriveWorkQueueDocStatus,
  filterWorkQueueForRightPanel,
  sortWorkQueueItems,
  normalizeWorkQueueSort,
  docStatusMeta,
  deriveNoteConnection,
  noteConnectionMeta
} from '../../utils/noteAidDocumentationStatus.js';
import { useAgencyStore } from '../../store/agency.js';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';
import { tenantSmsImage } from '../../utils/tenantBrandAssets.js';

const SORT_FIELD_KEY = 'noteAidWorkQueueSortBy';
const SORT_DIR_KEY = 'noteAidWorkQueueSortDir';
const MODE_KEY = 'noteAidWorkQueueMode';

const props = defineProps({
  items: { type: Array, default: () => [] },
  activeId: { type: [String, null], default: null },
  collapsed: { type: Boolean, default: false },
  sortBy: { type: String, default: '' },
  sortDir: { type: String, default: '' },
  canUndoImport: { type: Boolean, default: false },
  undoImportCount: { type: Number, default: 0 },
  showCosignMode: { type: Boolean, default: false },
  cosignItems: { type: Array, default: () => [] },
  cosignLoading: { type: Boolean, default: false },
  activeCosignId: { type: [String, Number, null], default: null }
});

const emit = defineEmits([
  'add-todo',
  'select',
  'select-cosign',
  'delete',
  'undo-import',
  'update:collapsed',
  'update:sortBy',
  'update:sortDir',
  'update:queueMode',
  'refresh-cosign'
]);

const agencyStore = useAgencyStore();
const failedLogoKeys = ref(new Set());

function loadStoredSort() {
  let field = 'date';
  let direction = 'asc';
  try {
    const rawField = localStorage.getItem(SORT_FIELD_KEY);
    const rawDir = localStorage.getItem(SORT_DIR_KEY);
    const normalized = normalizeWorkQueueSort(rawField || 'date', rawDir || 'asc');
    field = normalized.field;
    direction = normalized.direction;
  } catch {
    // ignore
  }
  return { field, direction };
}

function loadStoredMode() {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'cosign' && props.showCosignMode) return 'cosign';
  } catch {
    // ignore
  }
  return 'notes';
}

const stored = loadStoredSort();
const localSortField = ref(
  normalizeWorkQueueSort(props.sortBy || stored.field, props.sortDir || stored.direction).field
);
const localSortDir = ref(
  normalizeWorkQueueSort(props.sortBy || stored.field, props.sortDir || stored.direction).direction
);
const queueMode = ref(loadStoredMode());
const cosignSortField = ref('date');

function persistSort() {
  try {
    localStorage.setItem(SORT_FIELD_KEY, localSortField.value);
    localStorage.setItem(SORT_DIR_KEY, localSortDir.value);
  } catch {
    // ignore
  }
  emit('update:sortBy', localSortField.value);
  emit('update:sortDir', localSortDir.value);
}

function setQueueMode(mode) {
  const next = mode === 'cosign' && props.showCosignMode ? 'cosign' : 'notes';
  queueMode.value = next;
  try {
    localStorage.setItem(MODE_KEY, next);
  } catch {
    // ignore
  }
  emit('update:queueMode', next);
  if (next === 'cosign') emit('refresh-cosign');
}

function openCosignMode() {
  emit('update:collapsed', false);
  setQueueMode('cosign');
}

watch(
  () => props.showCosignMode,
  (ok) => {
    if (!ok && queueMode.value === 'cosign') setQueueMode('notes');
  }
);

watch(
  () => [props.sortBy, props.sortDir],
  ([f, d]) => {
    if (!f && !d) return;
    const n = normalizeWorkQueueSort(f || localSortField.value, d || localSortDir.value);
    if (n.field !== localSortField.value) localSortField.value = n.field;
    if (n.direction !== localSortDir.value) localSortDir.value = n.direction;
  }
);

const sortField = computed({
  get: () => localSortField.value,
  set: (v) => {
    localSortField.value = normalizeWorkQueueSort(v, localSortDir.value).field;
    persistSort();
  }
});

const sortDir = computed({
  get: () => localSortDir.value,
  set: (v) => {
    localSortDir.value = v === 'desc' ? 'desc' : 'asc';
    persistSort();
  }
});

function toggleSortDir() {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
}

const visibleItems = computed(() =>
  sortWorkQueueItems(
    filterWorkQueueForRightPanel(props.items),
    localSortField.value,
    localSortDir.value
  )
);

const cosignCount = computed(() => (props.cosignItems || []).length);

const sortedCosignItems = computed(() => {
  const list = [...(props.cosignItems || [])];
  const field = cosignSortField.value;
  list.sort((a, b) => {
    if (field === 'provider') {
      return String(a.providerName || '').localeCompare(String(b.providerName || ''));
    }
    if (field === 'client') {
      return String(a.clientName || '').localeCompare(String(b.clientName || ''));
    }
    return String(b.date || b.signedAt || '').localeCompare(String(a.date || a.signedAt || ''));
  });
  return list;
});

const pendingCount = computed(
  () => visibleItems.value.filter((i) => docStatus(i) === DOC_STATUS.NOT_STARTED).length
);
const startedCount = computed(
  () => visibleItems.value.filter((i) => docStatus(i) === DOC_STATUS.STARTED).length
);

watch(
  [localSortField, localSortDir],
  () => {
    emit('update:sortBy', localSortField.value);
    emit('update:sortDir', localSortDir.value);
  },
  { immediate: true }
);

const agenciesById = computed(() => {
  const map = new Map();
  const lists = [agencyStore.agencies, agencyStore.userAgencies, [agencyStore.currentAgency]];
  for (const list of lists) {
    for (const a of list || []) {
      if (!a?.id) continue;
      map.set(Number(a.id), a);
    }
  }
  return map;
});

function docStatus(item) {
  return deriveWorkQueueDocStatus(item);
}

function connection(item) {
  return deriveNoteConnection(item);
}

function statusLabel(item) {
  return docStatusMeta(docStatus(item)).shortLabel;
}

function formatQueueDate(value) {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return raw || '—';
  try {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: '2-digit' });
  } catch {
    return raw;
  }
}

function resolveAgency(item) {
  const id = Number(item?.agencyId || item?.agency_id || 0);
  if (id && agenciesById.value.has(id)) return agenciesById.value.get(id);
  return null;
}

function logoKey(item) {
  return String(item?.id || item?.agencyId || item?.clientName || '');
}

function resolveAssetUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/assets/')) return s;
  if (s.startsWith('/uploads/') || s.startsWith('uploads/')) return toUploadsUrl(s);
  return s;
}

function tenantLogoUrl(item) {
  const key = logoKey(item);
  if (failedLogoKeys.value.has(key)) return '';

  const direct = resolveAssetUrl(
    item?.agencyLogoUrl || item?.agencyLogoPath || item?.agency_logo_url || item?.agency_logo_path
  );
  if (direct) return direct;

  const agency = resolveAgency(item);
  if (!agency) return '';
  return resolveAssetUrl(
    agency.logo_url
    || agency.logoUrl
    || agency.sms_image_url
    || agency.smsImageUrl
    || tenantSmsImage(agency)
  );
}

function onLogoError(item) {
  const next = new Set(failedLogoKeys.value);
  next.add(logoKey(item));
  failedLogoKeys.value = next;
}

function tenantTitle(item) {
  const agency = resolveAgency(item);
  return agency?.name || item?.agencyName || noteConnectionMeta(connection(item)).label;
}

function connectionStyle(item) {
  const meta = noteConnectionMeta(connection(item));
  return { color: meta.color || '#0f766e' };
}

function connectionIconSvg(item) {
  const key = connection(item);
  if (key === 'session') {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
  }
  if (key === 'client') {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>`;
}

function typeLabel(item) {
  const code = String(item?.serviceCode || '').trim();
  const kind = String(item?.noteKind || 'progress').replace(/_/g, ' ');
  if (code) return `${kind} (${code})`;
  return kind;
}

function canRemoveQueueItem(item) {
  const status = docStatus(item);
  return status === DOC_STATUS.NOT_STARTED || status === DOC_STATUS.STARTED;
}

function removeQueueTitle(item) {
  return docStatus(item) === DOC_STATUS.NOT_STARTED
    ? 'Remove from work queue'
    : 'Delete draft (ToDo stays as not started)';
}
</script>

<style scoped>
.na-wq {
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.na-wq--collapsed {
  width: 52px;
  align-items: center;
  padding: 8px 0;
}
.na-wq-rail-expand,
.na-wq-collapse {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 1rem;
  color: #0f766e;
}
.na-wq-rail-tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.na-wq-rail-tab {
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 0.7rem;
  color: #64748b;
}
.na-wq-rail-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.na-wq-rail-dot--pending { background: #0f766e; }
.na-wq-rail-dot--started { background: #ea580c; }
.na-wq-rail-dot--cosign { background: #7c3aed; }
.na-wq-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 14px 8px;
}
.na-wq-head strong {
  display: block;
  font-size: 0.95rem;
  color: #0f172a;
}
.na-wq-head p {
  margin: 4px 0 0;
  font-size: 0.75rem;
  color: #64748b;
}
.na-wq-head-actions {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.na-wq-add {
  border: none;
  background: #0f766e;
  color: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.na-wq-modes {
  display: flex;
  gap: 6px;
  padding: 0 14px 10px;
}
.na-wq-mode {
  flex: 1;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 8px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
}
.na-wq-mode.on {
  border-color: #0f766e;
  background: #ecfdf5;
  color: #0f766e;
}
.na-wq-mode--cosign.on {
  border-color: #7c3aed;
  background: #f5f3ff;
  color: #6d28d9;
}
.na-wq-legend {
  display: flex;
  gap: 6px;
  padding: 0 14px 8px;
}
.na-wq-chip {
  font-size: 0.68rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 8px;
}
.na-wq-chip--pending {
  background: #ccfbf1;
  color: #0f766e;
}
.na-wq-chip--started {
  background: #ffedd5;
  color: #c2410c;
}
.na-wq-sort {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 10px;
}
.na-wq-sort-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  flex: 1;
}
.na-wq-sort-select {
  flex: 1;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px 6px;
  font-size: 0.78rem;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 500;
  color: #0f172a;
  background: #fff;
}
.na-wq-sort-dir {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.na-wq-undo {
  margin: 0 14px 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  font-size: 0.75rem;
  color: #0e7490;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.na-wq-undo-btn {
  border: none;
  background: transparent;
  color: #0f766e;
  font-weight: 700;
  cursor: pointer;
}
.na-wq-empty {
  margin: 8px 14px;
  padding: 16px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px dashed #cbd5e1;
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1.4;
}
.na-wq-list {
  list-style: none;
  margin: 0;
  padding: 0 10px 16px;
  overflow: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.na-wq-item {
  position: relative;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.na-wq-item.active {
  border-color: #14b8a6;
  box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.25);
}
.na-wq-item--started {
  border-left: 3px solid #ea580c;
}
.na-wq-item--not_started {
  border-left: 3px solid #0f766e;
}
.na-wq-item--cosign {
  border-left: 3px solid #7c3aed;
}
.na-wq-item-btn {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 10px 12px;
  cursor: pointer;
}
.na-wq-item-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.82rem;
}
.na-wq-item-top strong {
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.na-wq-item-top span {
  font-size: 0.68rem;
  font-weight: 700;
  color: #c2410c;
  white-space: nowrap;
}
.na-wq-item--not_started .na-wq-item-top span { color: #0f766e; }
.na-wq-item--cosign .na-wq-item-top span { color: #6d28d9; }
.na-wq-item-meta {
  margin-top: 4px;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.35;
}
.na-wq-conn {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.na-wq-tenant-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 3px;
}
.na-wq-delete {
  position: absolute;
  top: 4px;
  right: 4px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 2px 6px;
}
.na-wq-delete:hover { color: #b91c1c; }
</style>
