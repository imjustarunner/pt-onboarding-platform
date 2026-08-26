<template>
  <aside class="cnl">
    <div class="cnl-title">{{ title }}</div>
    <button type="button" class="cnl-new" @click="$emit('new')">
      <span aria-hidden="true">+</span> {{ newLabel }}
    </button>

    <div class="cnl-tabs cnl-tabs--status" role="tablist" aria-label="Documentation status">
      <button
        v-for="t in statusTabs"
        :key="t.key"
        type="button"
        role="tab"
        :aria-selected="tab === t.key"
        class="cnl-status-tab"
        :class="{ active: tab === t.key }"
        :style="tab === t.key ? statusTabStyle(t.key) : undefined"
        @click="$emit('update:tab', t.key)"
      >
        <span class="cnl-status-dot" :style="{ background: meta(t.key).color }" />
        {{ t.shortLabel }}
        <em v-if="counts[t.key]">{{ counts[t.key] }}</em>
      </button>
    </div>

    <div class="cnl-controls">
      <label class="cnl-control">
        <span>Group</span>
        <select
          :value="groupBy"
          class="cnl-select"
          aria-label="Group notes by"
          @change="$emit('update:groupBy', $event.target.value)"
        >
          <option value="status">Status</option>
          <option value="connection">Connection</option>
          <option value="date">Created date</option>
          <option value="service_date">Service date</option>
          <option value="client">Client</option>
          <option value="tenant">Tenant</option>
        </select>
      </label>
      <button
        type="button"
        class="cnl-invert"
        :class="{ on: dateOrder === 'oldest' }"
        :title="dateOrder === 'oldest' ? 'Showing oldest first' : 'Showing newest first'"
        @click="$emit('update:dateOrder', dateOrder === 'oldest' ? 'newest' : 'oldest')"
      >
        {{ dateOrder === 'oldest' ? 'Oldest ↑' : 'Newest ↓' }}
      </button>
    </div>

    <div class="cnl-conn-filters" role="group" aria-label="Filter by connection">
      <button
        type="button"
        class="cnl-conn-chip"
        :class="{ on: !connectionFilter }"
        @click="$emit('update:connectionFilter', '')"
      >
        All links
      </button>
      <button
        v-for="c in connectionTabs"
        :key="c.key"
        type="button"
        class="cnl-conn-chip"
        :class="{ on: connectionFilter === c.key }"
        :style="connectionFilter === c.key ? connChipStyle(c.key) : undefined"
        :title="c.title"
        @click="$emit('update:connectionFilter', c.key)"
      >
        <span class="cnl-conn-icon" aria-hidden="true" v-html="connectionIconSvg(c.key)" />
        {{ c.shortLabel }}
      </button>
    </div>

    <input
      :value="search"
      type="search"
      class="cnl-search"
      placeholder="Search name, initials, tenant…"
      aria-label="Search notes"
      @input="$emit('update:search', $event.target.value)"
    />

    <div class="cnl-list" aria-label="Clinical notes">
      <div v-if="loading" class="cnl-muted">Loading…</div>
      <div v-else-if="error" class="cnl-error">{{ error }}</div>
      <div v-else-if="!groups.length" class="cnl-muted">
        {{ emptyLabel }}
      </div>
      <div
        v-for="group in groups"
        :key="group.key"
        class="cnl-date-group"
        :class="group.docStatus ? `cnl-group--${group.docStatus}` : ''"
      >
        <button
          type="button"
          class="cnl-date-header"
          :class="{ open: isOpen(group.key) }"
          :aria-expanded="isOpen(group.key)"
          :style="groupHeaderInlineStyle(group)"
          @click="toggle(group.key)"
        >
          <div
            class="cnl-cal"
            :style="group.docStatus ? calStyle(group.docStatus) : (group.connection ? connCalStyle(group.connection) : undefined)"
          >
            <span class="cnl-month">{{ group.month }}</span>
            <span class="cnl-day">{{ group.day }}</span>
          </div>
          <div class="cnl-date-meta">
            <strong>
              <span
                v-if="group.connection"
                class="cnl-conn-icon cnl-conn-icon--inline"
                aria-hidden="true"
                v-html="connectionIconSvg(group.connection)"
              />
              {{ group.label }}
            </strong>
            <span>{{ group.drafts.length }} note{{ group.drafts.length === 1 ? '' : 's' }}</span>
          </div>
          <span class="cnl-chevron" :class="{ open: isOpen(group.key) }" aria-hidden="true">›</span>
        </button>
        <div v-show="isOpen(group.key)" class="cnl-notes">
          <div
            v-for="d in group.drafts"
            :key="d.id"
            class="cnl-row"
            :class="{
              selected: isSelected(d),
              [`cnl-row--${normalizeStatus(d.docStatus)}`]: true
            }"
            :style="rowStyle(d.docStatus)"
          >
            <button
              type="button"
              class="cnl-row-main"
              @click="$emit('select', d)"
            >
              <span
                class="cnl-conn-badge"
                :style="connBadgeStyle(d.connection)"
                :title="connMeta(d.connection).title"
                aria-hidden="true"
                v-html="connectionIconSvg(d.connection)"
              />
              <div class="cnl-row-body">
                <div class="cnl-row-top">
                  <strong>{{ rowTitle(d) }}</strong>
                  <span class="cnl-status-pill" :style="pillStyle(d.docStatus)">
                    {{ meta(d.docStatus).shortLabel }}
                  </span>
                </div>
                <div class="cnl-type">
                  {{ rowTypeLabel(d) }}
                  <span class="cnl-conn-label"> · {{ connMeta(d.connection).shortLabel }}</span>
                </div>
                <div v-if="d.agency_name || d.client_type" class="cnl-meta">
                  <span v-if="d.agency_name">{{ d.agency_name }}</span>
                  <span v-if="d.client_type"> · {{ d.client_type }}</span>
                </div>
                <div class="cnl-dos">
                  DOS: {{ d.date_of_service ? String(d.date_of_service).slice(0, 10) : '—' }}
                  <span v-if="d.created_at"> · Created {{ shortCreated(d.created_at) }}</span>
                  <span v-if="d.source === 'work_queue'" class="cnl-queue-tag"> · In queue</span>
                </div>
              </div>
            </button>
            <div class="cnl-row-actions">
              <button
                v-if="canDeleteRow(d)"
                type="button"
                class="cnl-delete"
                title="Delete unsigned note"
                @click="$emit('delete', d)"
              >
                Delete
              </button>
              <span class="cnl-chevron" aria-hidden="true">›</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="cnl-footer">
      <span>{{ filtered.length }} note{{ filtered.length === 1 ? '' : 's' }}</span>
      <span>Started notes also stay in the right queue until finished</span>
    </div>
  </aside>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { todayIsoDate } from '../../utils/noteAidUiHelpers.js';
import { defaultDraftTypeLabel } from '../../utils/clinicalNoteLibrary.js';
import {
  DOC_STATUS,
  DOC_STATUS_META,
  LEFT_PANEL_STATUS_TABS,
  LEFT_PANEL_CONNECTION_KEYS,
  NOTE_CONNECTION_META,
  buildLeftLibraryRows,
  filterLeftLibraryRows,
  groupLeftLibraryRows,
  normalizeDocStatus,
  docStatusMeta,
  noteConnectionMeta
} from '../../utils/noteAidDocumentationStatus.js';

const props = defineProps({
  title: { type: String, default: 'Clinical Note Library' },
  newLabel: { type: String, default: 'New Note' },
  drafts: { type: Array, default: () => [] },
  workQueueItems: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  selectedId: { type: [String, Number], default: null },
  selectedWorkQueueId: { type: [String, Number], default: null },
  tab: { type: String, default: DOC_STATUS.STARTED },
  search: { type: String, default: '' },
  groupBy: { type: String, default: 'status' },
  dateOrder: { type: String, default: 'newest' },
  connectionFilter: { type: String, default: '' },
  typeLabel: { type: Function, default: defaultDraftTypeLabel }
});

defineEmits([
  'new',
  'select',
  'delete',
  'update:tab',
  'update:search',
  'update:groupBy',
  'update:dateOrder',
  'update:connectionFilter'
]);

const openGroups = reactive({});

const statusTabs = LEFT_PANEL_STATUS_TABS.map((key) => ({
  key,
  shortLabel: DOC_STATUS_META[key].shortLabel,
  label: DOC_STATUS_META[key].label
}));

const connectionTabs = LEFT_PANEL_CONNECTION_KEYS.map((key) => ({
  key,
  shortLabel: NOTE_CONNECTION_META[key].shortLabel,
  title: NOTE_CONNECTION_META[key].title
}));

const allRows = computed(() =>
  buildLeftLibraryRows({ drafts: props.drafts, workQueueItems: props.workQueueItems })
);

const counts = computed(() => {
  const c = {
    [DOC_STATUS.STARTED]: 0,
    [DOC_STATUS.COMPLETED]: 0,
    [DOC_STATUS.SIGNED]: 0
  };
  for (const r of allRows.value) {
    const s = normalizeDocStatus(r.docStatus);
    if (c[s] != null) c[s] += 1;
  }
  return c;
});

const filtered = computed(() =>
  filterLeftLibraryRows(allRows.value, {
    tab: props.tab,
    search: props.search,
    connection: props.connectionFilter
  })
);

const groups = computed(() =>
  groupLeftLibraryRows(filtered.value, {
    groupBy: props.groupBy,
    dateOrder: props.dateOrder
  })
);

const emptyLabel = computed(() => {
  if (props.tab === DOC_STATUS.STARTED) return 'No notes in progress. Open one from the right queue to start.';
  if (props.tab === DOC_STATUS.COMPLETED) return 'No completed (unsigned) notes yet.';
  if (props.tab === DOC_STATUS.SIGNED) return 'No signed notes yet.';
  return 'No notes yet.';
});

function meta(status) {
  return docStatusMeta(status);
}
function normalizeStatus(status) {
  return normalizeDocStatus(status);
}
function statusTabStyle(key) {
  const m = meta(key);
  return { background: m.bg, color: m.color, boxShadow: `inset 0 0 0 1px ${m.border}` };
}
function groupHeaderStyle(key) {
  const m = meta(key);
  return { borderColor: m.border, background: m.bg };
}
function calStyle(key) {
  const m = meta(key);
  return { borderColor: m.border, color: m.color };
}
function rowStyle(status) {
  const m = meta(status);
  return { borderColor: m.border, background: m.bg };
}
function pillStyle(status) {
  const m = meta(status);
  return { color: m.color, background: '#fff', borderColor: m.border };
}

function connMeta(connection) {
  return noteConnectionMeta(connection);
}

function connChipStyle(key) {
  const m = connMeta(key);
  return { background: m.bg, color: m.color, borderColor: m.border };
}

function connCalStyle(key) {
  const m = connMeta(key);
  return { borderColor: m.border, color: m.color };
}

function connBadgeStyle(connection) {
  const m = connMeta(connection);
  return { color: m.color, background: m.bg, borderColor: m.border };
}

function groupHeaderInlineStyle(group) {
  if (group?.docStatus) return groupHeaderStyle(group.docStatus);
  if (group?.connection) {
    const m = connMeta(group.connection);
    return { borderColor: m.border, background: m.bg };
  }
  return undefined;
}

/** Compact inline SVGs for connection type. */
function connectionIconSvg(connection) {
  const key = String(connection || 'unlinked');
  if (key === 'session') {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
  }
  if (key === 'client') {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>`;
}

function rowTitle(d) {
  const name = String(d?.client_full_name || '').trim();
  if (name) return name;
  return d?.initials || '—';
}

function rowTypeLabel(d) {
  if (d?.source === 'work_queue') {
    const kind = d.noteKind || d.raw?.noteKind;
    if (kind === 'intake') return `Intake${d.service_code ? ` (${d.service_code})` : ''}`;
    if (kind === 'termination') return 'Termination note';
    if (kind === 'treatment_plan') return 'Treatment plan renewal';
    return `Progress${d.service_code ? ` (${d.service_code})` : ''}`;
  }
  return props.typeLabel(d.raw || d);
}

function canDeleteRow(d) {
  const status = normalizeStatus(d?.docStatus);
  if (status === DOC_STATUS.SIGNED) return false;
  if (d?.raw?.provider_signed_at || d?.raw?.signed_at) return false;
  return d?.source === 'draft' || d?.source === 'work_queue';
}

function shortCreated(raw) {
  try {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function isSelected(d) {
  if (d.source === 'work_queue' && props.selectedWorkQueueId) {
    return String(d.workQueueId) === String(props.selectedWorkQueueId);
  }
  if (d.draftId && props.selectedId) {
    return String(d.draftId) === String(props.selectedId);
  }
  return String(props.selectedId) === String(d.id);
}

function isOpen(key) {
  if (Object.prototype.hasOwnProperty.call(openGroups, key)) return !!openGroups[key];
  if (props.groupBy === 'status') return true;
  if (props.groupBy === 'connection') return true;
  const today = todayIsoDate();
  if (props.groupBy === 'date' && (key === today || key === `created:${today}`)) return true;
  if (props.groupBy === 'service_date' && (key === today || key === `dos:${today}`)) return true;
  if (groups.value[0]?.key === key) return true;
  return false;
}

function toggle(key) {
  openGroups[key] = !isOpen(key);
}
</script>

<style scoped>
.cnl {
  --cnl-teal: #0f766e;
  --cnl-teal-dark: #0d5f59;
  --cnl-border: #e2e8f0;
  --cnl-muted: #64748b;
  background: white;
  border-right: 1px solid var(--cnl-border);
  display: flex;
  flex-direction: column;
  min-height: 100%;
  height: calc(100vh - 64px);
  position: sticky;
  top: 0;
  padding: 16px 14px;
  min-width: 0;
}
.cnl-title {
  font-weight: 800;
  font-size: 0.92rem;
  letter-spacing: -0.02em;
  margin-bottom: 10px;
  color: #0f172a;
}
.cnl-new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 12px;
  background: var(--cnl-teal);
  color: white;
  font-weight: 700;
  padding: 12px 14px;
  cursor: pointer;
}
.cnl-new:hover { background: var(--cnl-teal-dark); }
.cnl-tabs {
  display: grid;
  gap: 6px;
  margin: 14px 0 10px;
  background: #f8fafc;
  border-radius: 10px;
  padding: 4px;
}
.cnl-tabs--status {
  grid-template-columns: 1fr 1fr 1fr;
}
.cnl-tabs button,
.cnl-status-tab {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 6px;
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--cnl-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-wrap: wrap;
}
.cnl-status-tab em {
  font-style: normal;
  font-size: 0.68rem;
  opacity: 0.85;
}
.cnl-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex-shrink: 0;
}
.cnl-tabs button.active,
.cnl-status-tab.active {
  background: white;
  color: #0f172a;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.cnl-controls {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 8px;
}
.cnl-control {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--cnl-muted);
}
.cnl-select {
  width: 100%;
  border: 1px solid var(--cnl-border);
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 0.85rem;
  background: white;
}
.cnl-invert {
  border: 1px solid var(--cnl-border);
  border-radius: 8px;
  background: #f8fafc;
  padding: 7px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
}
.cnl-invert.on {
  border-color: #99f6e4;
  background: #f0fdfa;
  color: var(--cnl-teal-dark);
}
.cnl-conn-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.cnl-conn-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--cnl-border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
}
.cnl-conn-chip.on {
  color: #0f172a;
}
.cnl-conn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}
.cnl-conn-icon--inline {
  margin-right: 4px;
  vertical-align: -2px;
}
.cnl-conn-badge {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cnl-conn-label {
  color: #64748b;
  font-weight: 600;
}
.cnl-search {
  width: 100%;
  border: 1px solid var(--cnl-border);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 0.9rem;
}
.cnl-list {
  flex: 1;
  overflow: auto;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cnl-muted, .cnl-error {
  font-size: 0.85rem;
  color: var(--cnl-muted);
  padding: 8px 4px;
}
.cnl-error { color: #b91c1c; }
.cnl-date-group { display: flex; flex-direction: column; gap: 4px; }
.cnl-date-header {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: center;
  text-align: left;
  border: 1px solid var(--cnl-border);
  background: white;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
  color: inherit;
  width: 100%;
  font: inherit;
}
.cnl-date-header:hover,
.cnl-date-header.open {
  filter: brightness(0.98);
}
.cnl-date-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cnl-date-meta strong { font-size: 0.88rem; }
.cnl-date-meta span { color: var(--cnl-muted); font-size: 0.75rem; }
.cnl-notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 0 4px 12px;
  border-left: 2px solid #e2e8f0;
  margin-left: 22px;
}
.cnl-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border: 1px solid transparent;
  background: #f8fafc;
  border-radius: 12px;
  padding: 6px 8px 6px 6px;
  color: inherit;
  width: 100%;
}
.cnl-row-main {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  text-align: left;
  border: none;
  background: transparent;
  padding: 4px;
  cursor: pointer;
  color: inherit;
  width: 100%;
  font: inherit;
  min-width: 0;
}
.cnl-row-body {
  min-width: 0;
}
.cnl-row-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  padding-right: 2px;
}
.cnl-delete {
  border: none;
  background: transparent;
  color: #b91c1c;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 0;
}
.cnl-row:hover,
.cnl-row.selected {
  filter: brightness(0.97);
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}
.cnl-cal {
  background: white;
  border: 1px solid var(--cnl-border);
  border-radius: 10px;
  text-align: center;
  padding: 6px 4px;
  line-height: 1.1;
}
.cnl-month { display: block; font-size: 0.65rem; font-weight: 700; }
.cnl-day { display: block; font-size: 1rem; font-weight: 800; }
.cnl-row-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.85rem;
  align-items: center;
}
.cnl-status-pill {
  font-size: 0.65rem;
  font-weight: 800;
  border: 1px solid;
  border-radius: 999px;
  padding: 2px 7px;
  white-space: nowrap;
}
.cnl-row-top span.cnl-status-pill { color: inherit; font-size: 0.65rem; }
.cnl-dos,
.cnl-meta { color: var(--cnl-muted); font-size: 0.78rem; }
.cnl-type { font-weight: 600; color: #334155; margin-top: 2px; font-size: 0.78rem; }
.cnl-queue-tag { color: #b45309; font-weight: 700; }
.cnl-chevron { color: #94a3b8; }
.cnl-chevron.open { transform: rotate(90deg); display: inline-block; }
.cnl-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  font-size: 0.72rem;
  color: var(--cnl-muted);
}
@media (max-width: 900px) {
  .cnl {
    height: auto;
    max-height: 360px;
    position: relative;
    border-right: none;
    border-bottom: 1px solid var(--cnl-border);
  }
}
</style>
