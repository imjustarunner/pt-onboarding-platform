<template>
  <aside
    class="cnl"
    :class="{
      'cnl--collapsed': collapsed,
      'cnl--expanded': expanded && !collapsed
    }"
    :aria-label="title"
  >
    <template v-if="collapsed">
      <button
        type="button"
        class="cnl-rail-expand"
        title="Open Note Library"
        aria-label="Open Note Library"
        @click="$emit('update:collapsed', false)"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <div class="cnl-rail-tabs" role="tablist" aria-label="Documentation status">
        <button
          v-for="t in statusTabs"
          :key="t.key"
          type="button"
          role="tab"
          class="cnl-rail-tab"
          :class="{ active: tab === t.key }"
          :style="tab === t.key ? statusTabStyle(t.key) : undefined"
          :title="`${t.shortLabel}${counts[t.key] ? ` (${counts[t.key]})` : ''}`"
          :aria-selected="tab === t.key"
          @click="onRailStatusClick(t.key)"
        >
          <span class="cnl-status-dot" :style="{ background: meta(t.key).color }" />
          <em v-if="counts[t.key]">{{ counts[t.key] }}</em>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="cnl-header">
        <div class="cnl-title">{{ title }}</div>
        <div class="cnl-header-actions">
          <button
            type="button"
            class="cnl-icon-btn"
            :title="expanded ? 'Exit full library' : 'Expand library'"
            :aria-pressed="expanded ? 'true' : 'false'"
            @click="$emit('update:expanded', !expanded)"
          >
            {{ expanded ? '▭' : '⛶' }}
          </button>
          <button
            type="button"
            class="cnl-icon-btn"
            title="Collapse library"
            aria-label="Collapse library"
            @click="collapseLibrary"
          >
            ›
          </button>
        </div>
      </div>

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

      <div class="cnl-body" :class="{ 'cnl-body--split': expanded }">
        <div class="cnl-list-pane">
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
            <label class="cnl-control">
              <span>Tenant</span>
              <select
                :value="tenantFilter"
                class="cnl-select"
                aria-label="Filter by tenant"
                @change="$emit('update:tenantFilter', $event.target.value)"
              >
                <option value="">All tenants</option>
                <option v-for="t in tenantOptions" :key="t" :value="t">{{ t }}</option>
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

          <div class="cnl-list" aria-label="Notes">
            <div v-if="loading" class="cnl-muted">Loading…</div>
            <div v-else-if="error" class="cnl-error">{{ error }}</div>
            <div v-else-if="!groups.length" class="cnl-muted">{{ emptyLabel }}</div>
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
                    selected: isSelected(d) || isPreviewed(d),
                    [`cnl-row--${normalizeStatus(d.docStatus)}`]: true
                  }"
                  :data-open="isSelected(d) ? '1' : null"
                  :style="rowStyle(d.docStatus)"
                >
                  <button type="button" class="cnl-row-main" @click="onRowActivate(d)">
                    <span
                      class="cnl-conn-badge"
                      :style="connBadgeStyle(d.connection)"
                      :title="connMeta(d.connection).title"
                      aria-hidden="true"
                      v-html="connectionIconSvg(d.connection)"
                    />
                    <div class="cnl-row-body">
                      <div class="cnl-row-line">
                        <strong>{{ rowInitials(d) }}</strong>
                        <span class="cnl-dos-inline">{{ rowDos(d) }}</span>
                      </div>
                      <div class="cnl-row-sub">
                        <span class="cnl-row-kind">{{ rowTypeLabel(d) }}</span>
                        <span class="cnl-row-conn">{{ connMeta(d.connection).shortLabel }}</span>
                        <span v-if="d.service_code" class="cnl-row-code">{{ d.service_code }}</span>
                      </div>
                    </div>
                  </button>
                  <div class="cnl-row-actions">
                    <button
                      v-if="canSoapCopy(d)"
                      type="button"
                      class="cnl-soap-toggle"
                      :title="isSoapOpen(d) ? 'Hide copy buttons' : 'Copy SOAP sections'"
                      @click.stop="toggleSoap(d)"
                    >
                      {{ isSoapOpen(d) ? '▴' : '▾' }}
                    </button>
                    <button
                      v-if="canDeleteRow(d)"
                      type="button"
                      class="cnl-delete"
                      title="Delete unsigned note"
                      @click="$emit('delete', d)"
                    >
                      ×
                    </button>
                  </div>
                  <div v-if="isSoapOpen(d)" class="cnl-soap-copy" @click.stop>
                    <button
                      v-for="def in soapDefs"
                      :key="def.key"
                      type="button"
                      class="cnl-soap-btn"
                      :disabled="!soapText(d, def.key)"
                      @click.stop="copySoap(d, def)"
                    >
                      {{ copiedKey === soapCopyKey(d, def.key) ? 'Copied' : `Copy ${def.label}` }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="expanded" class="cnl-detail-pane">
          <div v-if="!previewRow" class="cnl-muted cnl-detail-empty">
            Select a note to preview details, then open it in the workspace.
          </div>
          <template v-else>
            <div class="cnl-detail-head">
              <strong>{{ rowTitle(previewRow) }}</strong>
              <span class="cnl-status-pill" :style="pillStyle(previewRow.docStatus)">
                {{ meta(previewRow.docStatus).shortLabel }}
              </span>
            </div>
            <dl class="cnl-detail-grid">
              <div><dt>Type</dt><dd>{{ rowTypeLabel(previewRow) }}</dd></div>
              <div><dt>Tenant</dt><dd>{{ previewRow.agency_name || '—' }}</dd></div>
              <div><dt>Client type</dt><dd>{{ previewRow.client_type || '—' }}</dd></div>
              <div><dt>Connection</dt><dd>{{ connMeta(previewRow.connection).shortLabel }}</dd></div>
              <div><dt>DOS</dt><dd>{{ previewRow.date_of_service ? String(previewRow.date_of_service).slice(0, 10) : '—' }}</dd></div>
              <div><dt>Created</dt><dd>{{ previewRow.created_at ? shortCreated(previewRow.created_at) : '—' }}</dd></div>
            </dl>
            <div class="cnl-detail-actions">
              <button type="button" class="cnl-new" @click="openPreviewed">Open note</button>
              <button
                v-if="canDeleteRow(previewRow)"
                type="button"
                class="cnl-delete cnl-delete--block"
                @click="$emit('delete', previewRow)"
              >
                Delete
              </button>
            </div>
          </template>
        </div>
      </div>

      <div class="cnl-footer">
        <span>{{ filtered.length }} note{{ filtered.length === 1 ? '' : 's' }}</span>
        <span>{{ expanded ? 'Expanded library' : 'Started notes also stay in the right queue until finished' }}</span>
      </div>
    </template>
  </aside>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { todayIsoDate } from '../../utils/noteAidUiHelpers.js';
import { defaultDraftTypeLabel } from '../../utils/clinicalNoteLibrary.js';
import {
  DOC_STATUS,
  DOC_STATUS_META,
  LEFT_PANEL_STATUS_TABS,
  LEFT_PANEL_CONNECTION_KEYS,
  NOTE_CONNECTION_META,
  buildLeftLibraryRows,
  deriveNoteConnection,
  filterLeftLibraryRows,
  groupLeftLibraryRows,
  initialsFromDisplayName,
  normalizeDocStatus,
  docStatusMeta,
  noteConnectionMeta
} from '../../utils/noteAidDocumentationStatus.js';
import { SOAP_SECTION_DEFS, soapSectionTextFromDraft } from '../../utils/noteAidUiHelpers.js';

const props = defineProps({
  title: { type: String, default: 'Note Library' },
  newLabel: { type: String, default: 'New Note' },
  drafts: { type: Array, default: () => [] },
  workQueueItems: { type: Array, default: () => [] },
  signedSessions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  selectedId: { type: [String, Number], default: null },
  selectedWorkQueueId: { type: [String, Number], default: null },
  tab: { type: String, default: DOC_STATUS.STARTED },
  search: { type: String, default: '' },
  groupBy: { type: String, default: 'status' },
  dateOrder: { type: String, default: 'newest' },
  connectionFilter: { type: String, default: '' },
  tenantFilter: { type: String, default: '' },
  collapsed: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  typeLabel: { type: Function, default: defaultDraftTypeLabel }
});

const emit = defineEmits([
  'new',
  'select',
  'delete',
  'update:tab',
  'update:search',
  'update:groupBy',
  'update:dateOrder',
  'update:connectionFilter',
  'update:tenantFilter',
  'update:collapsed',
  'update:expanded'
]);

const openGroups = reactive({});
const previewId = ref(null);
const soapOpenIds = reactive({});
const copiedKey = ref('');
const soapDefs = SOAP_SECTION_DEFS;

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
  buildLeftLibraryRows({
    drafts: props.drafts,
    workQueueItems: props.workQueueItems,
    signedSessions: props.signedSessions
  })
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

const tenantOptions = computed(() => {
  const set = new Set();
  for (const r of allRows.value) {
    const name = String(r.agency_name || '').trim();
    if (name) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});

const filtered = computed(() =>
  filterLeftLibraryRows(allRows.value, {
    tab: props.tab,
    search: props.search,
    connection: props.connectionFilter,
    tenant: props.tenantFilter
  })
);

const groups = computed(() =>
  groupLeftLibraryRows(filtered.value, {
    groupBy: props.groupBy,
    dateOrder: props.dateOrder
  })
);

const previewRow = computed(() => {
  if (!previewId.value) return null;
  return filtered.value.find((r) => String(r.id) === String(previewId.value))
    || allRows.value.find((r) => String(r.id) === String(previewId.value))
    || null;
});

watch(
  () => [props.selectedId, props.selectedWorkQueueId, groups.value.length],
  async () => {
    const selectedGroup = groups.value.find((g) =>
      (g.drafts || []).some((d) => isSelected(d))
    );
    if (selectedGroup?.key) openGroups[selectedGroup.key] = true;
    await nextTick();
    const el = document.querySelector('.cnl-row.selected[data-open="1"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
);

const emptyLabel = computed(() => {
  if (props.tab === DOC_STATUS.STARTED) return 'No notes in progress. Open one from the right queue to start.';
  if (props.tab === DOC_STATUS.COMPLETED) return 'No completed (unsigned) notes yet.';
  if (props.tab === DOC_STATUS.SIGNED) return 'No signed notes yet.';
  return 'No notes yet.';
});

watch(() => props.tab, () => { previewId.value = null; });

function meta(status) { return docStatusMeta(status); }
function normalizeStatus(status) { return normalizeDocStatus(status); }
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
function connMeta(connection) { return noteConnectionMeta(connection); }
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
function rowInitials(d) {
  const name = String(d?.client_full_name || d?.raw?.clientName || '').trim();
  if (name) return initialsFromDisplayName(name);
  const fromField = String(d?.initials || '').trim();
  if (fromField) return fromField;
  return initialsFromDisplayName(rowTitle(d));
}
function rowDos(d) {
  const raw = String(d?.date_of_service || d?.raw?.date || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, m, day] = raw.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[Number(m) - 1] || m} ${Number(day)}`;
  }
  return raw || '—';
}
function rowTitle(d) {
  const initials = String(d?.initials || '').trim();
  const name = String(d?.client_full_name || d?.raw?.clientName || '').trim();
  if (deriveNoteConnection(d) === 'unlinked') return initials || 'Unlinked';
  if (name) return name;
  if (initials) return initials;
  return d?.source === 'signed_note' ? 'Signed note' : 'Note';
}
function rowTypeLabel(d) {
  if (d?.source === 'signed_note') {
    const code = String(d.service_code || d.raw?.serviceCode || '').trim().toUpperCase();
    return code ? `${code} · Signed` : 'Signed note';
  }
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
  if (props.selectedWorkQueueId && d.workQueueId
    && String(d.workQueueId) === String(props.selectedWorkQueueId)) {
    return true;
  }
  if (d.draftId && props.selectedId) {
    return String(d.draftId) === String(props.selectedId);
  }
  return String(props.selectedId) === String(d.id);
}
function isPreviewed(d) {
  return props.expanded && previewId.value && String(previewId.value) === String(d.id);
}
function isOpen(key) {
  if (Object.prototype.hasOwnProperty.call(openGroups, key)) return !!openGroups[key];
  if (props.groupBy === 'status' || props.groupBy === 'connection' || props.groupBy === 'tenant') return true;
  const today = todayIsoDate();
  if (props.groupBy === 'date' && (key === today || key === `created:${today}`)) return true;
  if (props.groupBy === 'service_date' && (key === today || key === `dos:${today}`)) return true;
  if (groups.value[0]?.key === key) return true;
  return false;
}
function toggle(key) { openGroups[key] = !isOpen(key); }
function onRowActivate(d) {
  if (props.expanded) {
    previewId.value = d.id;
    return;
  }
  emit('select', d);
}
function soapSource(d) {
  return d?.raw || d;
}
function canSoapCopy(d) {
  const st = normalizeStatus(d?.docStatus);
  return st === DOC_STATUS.COMPLETED || st === DOC_STATUS.SIGNED;
}
function soapCopyKey(d, key) {
  return `${d.id}:${key}`;
}
function isSoapOpen(d) {
  return !!soapOpenIds[String(d.id)];
}
function toggleSoap(d) {
  const id = String(d.id);
  soapOpenIds[id] = !soapOpenIds[id];
}
function soapText(d, key) {
  return soapSectionTextFromDraft(soapSource(d), key);
}
async function copySoap(d, def) {
  const text = soapText(d, def.key);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = soapCopyKey(d, def.key);
    setTimeout(() => {
      if (copiedKey.value === soapCopyKey(d, def.key)) copiedKey.value = '';
    }, 1500);
  } catch {
    // ignore
  }
}
function openPreviewed() {
  if (previewRow.value) emit('select', previewRow.value);
}
function collapseLibrary() {
  emit('update:expanded', false);
  emit('update:collapsed', true);
}
function onRailStatusClick(key) {
  emit('update:tab', key);
  emit('update:collapsed', false);
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
  min-height: 0;
  height: 100%;
  max-height: 100%;
  padding: 16px 14px;
  min-width: 0;
  overflow: hidden;
}
.cnl--collapsed { padding: 10px 6px; align-items: center; gap: 10px; }
.cnl--expanded { border-right: none; }
.cnl-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.cnl-header-actions { display: inline-flex; gap: 4px; }
.cnl-icon-btn {
  width: 32px; height: 32px; border: 1px solid var(--cnl-border); background: #f8fafc;
  border-radius: 8px; cursor: pointer; color: #475569; font-size: 0.95rem; line-height: 1;
}
.cnl-icon-btn:hover { border-color: #99f6e4; color: var(--cnl-teal-dark); }
.cnl-title { font-weight: 800; font-size: 0.92rem; letter-spacing: -0.02em; color: #0f172a; }
.cnl-rail-expand {
  width: 36px; height: 36px; border: 1px solid var(--cnl-border); border-radius: 10px;
  background: #f0fdfa; color: var(--cnl-teal-dark); font-size: 1.1rem; cursor: pointer;
}
.cnl-rail-tabs { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.cnl-rail-tab {
  display: flex; flex-direction: column; align-items: center; gap: 4px; border: none;
  background: #f8fafc; border-radius: 10px; padding: 10px 4px; cursor: pointer;
  color: var(--cnl-muted); font-weight: 700; font-size: 0.68rem;
}
.cnl-rail-tab em { font-style: normal; }
.cnl-rail-tab.active { color: #0f172a; }
.cnl-new {
  display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
  border: none; border-radius: 12px; background: var(--cnl-teal); color: white;
  font-weight: 700; padding: 12px 14px; cursor: pointer;
}
.cnl-new:hover { background: var(--cnl-teal-dark); }
.cnl-tabs { display: grid; gap: 6px; margin: 14px 0 10px; background: #f8fafc; border-radius: 10px; padding: 4px; flex-shrink: 0; }
.cnl-tabs--status { grid-template-columns: 1fr 1fr 1fr; }
.cnl-tabs button, .cnl-status-tab {
  border: none; background: transparent; border-radius: 8px; padding: 8px 6px; font-weight: 700;
  font-size: 0.72rem; color: var(--cnl-muted); cursor: pointer; display: inline-flex;
  align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap;
}
.cnl-status-tab em { font-style: normal; font-size: 0.68rem; opacity: 0.85; }
.cnl-status-dot { width: 7px; height: 7px; border-radius: 999px; flex-shrink: 0; }
.cnl-tabs button.active, .cnl-status-tab.active {
  background: white; color: #0f172a; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.cnl-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.cnl-body--split { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(260px, 0.9fr); gap: 16px; }
.cnl-list-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.cnl-detail-pane {
  min-width: 0; border: 1px solid var(--cnl-border); border-radius: 14px;
  background: #f8fafc; padding: 16px; overflow: auto;
}
.cnl-detail-empty { padding: 24px 8px; text-align: center; }
.cnl-detail-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 14px; }
.cnl-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 0 16px; }
.cnl-detail-grid dt { font-size: 0.7rem; font-weight: 700; color: var(--cnl-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.cnl-detail-grid dd { margin: 2px 0 0; font-size: 0.9rem; color: #0f172a; font-weight: 600; }
.cnl-detail-actions { display: flex; flex-direction: column; gap: 8px; }
.cnl-controls { display: flex; gap: 8px; align-items: flex-end; margin-bottom: 8px; flex-wrap: wrap; flex-shrink: 0; }
.cnl-control { flex: 1; min-width: 110px; display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; font-weight: 600; color: var(--cnl-muted); }
.cnl-select { width: 100%; border: 1px solid var(--cnl-border); border-radius: 8px; padding: 7px 8px; font-size: 0.85rem; background: white; }
.cnl-invert {
  border: 1px solid var(--cnl-border); border-radius: 8px; background: #f8fafc; padding: 7px 10px;
  font-size: 0.78rem; font-weight: 600; color: #475569; cursor: pointer; white-space: nowrap;
}
.cnl-invert.on { border-color: #99f6e4; background: #f0fdfa; color: var(--cnl-teal-dark); }
.cnl-conn-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; flex-shrink: 0; }
.cnl-conn-chip {
  display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--cnl-border);
  background: #fff; border-radius: 999px; padding: 4px 8px; font-size: 0.7rem; font-weight: 700;
  color: #64748b; cursor: pointer;
}
.cnl-conn-chip.on { color: #0f172a; }
.cnl-conn-icon { display: inline-flex; align-items: center; justify-content: center; line-height: 0; }
.cnl-conn-icon--inline { margin-right: 4px; vertical-align: -2px; }
.cnl-conn-badge {
  width: 28px; height: 28px; border-radius: 8px; border: 1px solid; display: inline-flex;
  align-items: center; justify-content: center; flex-shrink: 0;
}
.cnl-conn-label { color: #64748b; font-weight: 600; }
.cnl-search {
  width: 100%; border: 1px solid var(--cnl-border); border-radius: 10px; padding: 9px 12px;
  font-size: 0.9rem; flex-shrink: 0;
}
.cnl-list {
  flex: 1; overflow: auto; margin-top: 12px; display: flex; flex-direction: column;
  gap: 8px; min-height: 0; -webkit-overflow-scrolling: touch;
}
.cnl-muted, .cnl-error { font-size: 0.85rem; color: var(--cnl-muted); padding: 8px 4px; }
.cnl-error { color: #b91c1c; }
.cnl-date-group { display: flex; flex-direction: column; gap: 4px; }
.cnl-date-header {
  display: grid; grid-template-columns: 48px minmax(0, 1fr) 16px; gap: 10px; align-items: center;
  text-align: left; border: 1px solid var(--cnl-border); background: white; border-radius: 12px;
  padding: 8px 10px; cursor: pointer; color: inherit; width: 100%; font: inherit;
}
.cnl-date-header:hover, .cnl-date-header.open { filter: brightness(0.98); }
.cnl-date-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cnl-date-meta strong { font-size: 0.88rem; }
.cnl-date-meta span { color: var(--cnl-muted); font-size: 0.75rem; }
.cnl-notes {
  display: flex; flex-direction: column; gap: 4px; padding: 0 0 4px 12px;
  border-left: 2px solid #e2e8f0; margin-left: 22px;
}
.cnl-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  border: 1px solid transparent;
  background: #f8fafc;
  border-radius: 8px;
  padding: 2px 6px 2px 4px;
  color: inherit;
  width: 100%;
}
.cnl-row.selected {
  box-shadow: inset 0 0 0 2px #0f766e, 0 0 0 2px #99f6e4;
  background: #ecfdf5;
}
.cnl-row-main {
  display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; align-items: start;
  text-align: left; border: none; background: transparent; padding: 2px; cursor: pointer;
  color: inherit; flex: 1 1 auto; font: inherit; min-width: 0;
}
.cnl-row-body { min-width: 0; }
.cnl-row-line {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  min-width: 0; font-size: 0.84rem;
}
.cnl-row-sub {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-top: 2px; font-size: 0.68rem; color: var(--cnl-muted); font-weight: 600;
}
.cnl-row-kind { color: #334155; }
.cnl-row-conn {
  padding: 1px 6px; border-radius: 999px; background: #f1f5f9; color: #475569;
}
.cnl-row-code { font-family: ui-monospace, monospace; letter-spacing: 0.02em; }
.cnl-row-line strong {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; letter-spacing: 0.02em;
}
.cnl-dos-inline {
  color: var(--cnl-muted); font-size: 0.78rem; font-weight: 700; white-space: nowrap; flex-shrink: 0;
}
.cnl-row-actions { display: flex; align-items: center; flex-shrink: 0; }
.cnl-soap-toggle {
  border: none; background: transparent; color: #0f766e; cursor: pointer;
  font-size: 0.85rem; padding: 2px 6px;
}
.cnl-soap-copy {
  flex: 1 0 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px 0 6px;
}
.cnl-soap-btn {
  border: 1px solid #99f6e4;
  background: #fff;
  color: #0f766e;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 6px 8px;
  cursor: pointer;
}
.cnl-soap-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cnl-delete {
  border: none; background: transparent; color: #b91c1c; font-size: 0.72rem;
  font-weight: 700; cursor: pointer; padding: 2px 4px;
}
.cnl-delete--block { width: 100%; padding: 10px; border-radius: 10px; background: #fef2f2; }
.cnl-open-btn {
  border: 1px solid #99f6e4; background: #f0fdfa; color: var(--cnl-teal-dark);
  border-radius: 8px; font-size: 0.72rem; font-weight: 700; padding: 4px 8px; cursor: pointer;
}
.cnl-cal {
  width: 48px; height: 44px; border: 1px solid var(--cnl-border); border-radius: 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: white; padding: 6px 4px; line-height: 1.1;
}
.cnl-month { display: block; font-size: 0.65rem; font-weight: 700; }
.cnl-day { display: block; font-size: 1rem; font-weight: 800; }
.cnl-row-top { display: flex; justify-content: space-between; gap: 8px; font-size: 0.85rem; align-items: center; }
.cnl-status-pill {
  font-size: 0.65rem; font-weight: 800; border: 1px solid; border-radius: 999px;
  padding: 2px 7px; white-space: nowrap;
}
.cnl-dos, .cnl-meta { color: var(--cnl-muted); font-size: 0.78rem; }
.cnl-type { font-weight: 600; color: #334155; margin-top: 2px; font-size: 0.78rem; }
.cnl-queue-tag { color: #b45309; font-weight: 700; }
.cnl-chevron { color: #94a3b8; }
.cnl-chevron.open { transform: rotate(90deg); display: inline-block; }
.cnl-footer {
  display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; padding-top: 10px;
  border-top: 1px solid var(--cnl-border); font-size: 0.72rem; color: var(--cnl-muted); flex-shrink: 0;
}
@media (max-width: 640px) {
  .cnl:not(.cnl--collapsed):not(.cnl--expanded) {
    max-height: min(42vh, 360px); height: auto; border-right: none; border-bottom: 1px solid var(--cnl-border);
  }
  .cnl--expanded { max-height: none; height: 100%; min-height: 60vh; }
}
</style>
