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
      </div>
    </template>
    <template v-else>
    <header class="na-wq-head">
      <div>
        <strong>Work queue</strong>
        <p>{{ pendingCount }} not started · {{ startedCount }} in progress</p>
      </div>
      <div class="na-wq-head-actions">
        <button type="button" class="na-wq-add" @click="$emit('add-todo')">Add ToDo List</button>
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

    <div class="na-wq-legend" aria-hidden="true">
      <span class="na-wq-chip na-wq-chip--pending">Not started</span>
      <span class="na-wq-chip na-wq-chip--started">Started</span>
    </div>

    <div class="na-wq-actions">
      <button type="button" class="na-wq-primary" :disabled="!activeItem" @click="$emit('generate')">
        Generate
      </button>
      <button type="button" class="na-wq-outline" :disabled="!hasNext" @click="$emit('next')">
        Next
      </button>
      <button type="button" class="na-wq-link" :disabled="!items.length" @click="$emit('clear')">
        Clear
      </button>
    </div>

    <div v-if="!visibleItems.length" class="na-wq-empty">
      Paste a ToDo list or open pending Notes. Signed notes and copy-only Done notes live in the left library.
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
            {{ item.date }}
            <template v-if="item.timeLabel"> · {{ item.timeLabel }}</template>
            · {{ typeLabel(item) }}
          </div>
        </button>
        <button
          v-if="canDeleteDraft(item)"
          type="button"
          class="na-wq-delete"
          title="Delete draft and return this ToDo to not started"
          @click.stop="$emit('delete', item)"
        >
          ×
        </button>
      </li>
    </ul>
    </template>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue';
import {
  DOC_STATUS,
  deriveWorkQueueDocStatus,
  filterWorkQueueForRightPanel,
  docStatusMeta,
  deriveNoteConnection,
  noteConnectionMeta
} from '../../utils/noteAidDocumentationStatus.js';
import { useAgencyStore } from '../../store/agency.js';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';
import { tenantSmsImage } from '../../utils/tenantBrandAssets.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  activeId: { type: [String, null], default: null },
  collapsed: { type: Boolean, default: false }
});

defineEmits(['add-todo', 'generate', 'next', 'clear', 'select', 'delete', 'update:collapsed']);

const agencyStore = useAgencyStore();
const failedLogoKeys = ref(new Set());

const visibleItems = computed(() => filterWorkQueueForRightPanel(props.items));

const pendingCount = computed(
  () => visibleItems.value.filter((i) => docStatus(i) === DOC_STATUS.NOT_STARTED).length
);
const startedCount = computed(
  () => visibleItems.value.filter((i) => docStatus(i) === DOC_STATUS.STARTED).length
);
const activeItem = computed(() => (props.items || []).find((i) => i.id === props.activeId) || null);
const hasNext = computed(() =>
  visibleItems.value.some(
    (i) => i.id !== props.activeId && docStatus(i) === DOC_STATUS.NOT_STARTED
  )
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

function connectionLabel(item) {
  return noteConnectionMeta(connection(item)).shortLabel;
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
  if (agency) {
    const fromAgency = resolveAssetUrl(
      agency.logo_path || agency.logoPath || agency.logo_url || agency.logoUrl
        || agency.icon_file_path || agency.iconFilePath
    );
    if (fromAgency) return fromAgency;
  }

  const slug = String(
    item?.agencySlug
      || item?.agency_slug
      || agency?.slug
      || agency?.portal_url
      || agency?.portalUrl
      || ''
  ).trim();
  if (slug) {
    const sms = tenantSmsImage(slug, 'counseling') || tenantSmsImage(slug, 'join') || tenantSmsImage(slug, 'login');
    if (sms) return sms;
  }
  return '';
}

function tenantTitle(item) {
  const agency = resolveAgency(item);
  const name = String(
    item?.agencyName || item?.agency_name || agency?.name || ''
  ).trim();
  if (name) return name;
  return connectionLabel(item);
}

function onLogoError(item) {
  const key = logoKey(item);
  if (!key) return;
  const next = new Set(failedLogoKeys.value);
  next.add(key);
  failedLogoKeys.value = next;
}

function connectionIconSvg(item) {
  const key = connection(item);
  if (key === 'session') {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
  }
  if (key === 'client') {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>`;
}

function connectionStyle(item) {
  const m = noteConnectionMeta(connection(item));
  return { color: m.color, background: m.bg, borderColor: m.border };
}

function canDeleteDraft(item) {
  const st = docStatus(item);
  return st === DOC_STATUS.STARTED || !!item.draftId;
}

function typeLabel(item) {
  if (item.noteKind === 'intake') return `Intake${item.serviceCode ? ` (${item.serviceCode})` : ''}`;
  if (item.noteKind === 'termination') return 'Termination note';
  if (item.noteKind === 'treatment_plan') return 'Treatment plan renewal';
  return `Progress${item.serviceCode ? ` (${item.serviceCode})` : ''}`;
}
</script>

<style scoped>
.na-wq {
  background: #fff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  padding: 14px 12px;
  min-width: 0;
}
.na-wq--collapsed {
  padding: 10px 6px;
  align-items: center;
  gap: 10px;
}
.na-wq-rail-expand {
  width: 36px; height: 36px; border: 1px solid #e2e8f0; border-radius: 10px;
  background: #f0fdfa; color: #0d5f59; font-size: 1.1rem; cursor: pointer;
}
.na-wq-rail-tabs { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.na-wq-rail-tab {
  display: flex; flex-direction: column; align-items: center; gap: 4px; border: none;
  background: #f8fafc; border-radius: 10px; padding: 10px 4px; cursor: pointer;
  color: #64748b; font-weight: 700; font-size: 0.68rem;
}
.na-wq-rail-tab em { font-style: normal; color: #0f172a; }
.na-wq-rail-dot { width: 8px; height: 8px; border-radius: 999px; }
.na-wq-rail-dot--pending { background: #0f766e; }
.na-wq-rail-dot--started { background: #d97706; }
.na-wq-head-actions { display: flex; align-items: flex-start; gap: 6px; }
.na-wq-collapse {
  width: 32px; height: 32px; border: 1px solid #e2e8f0; background: #f8fafc;
  border-radius: 8px; cursor: pointer; color: #475569; font-size: 0.95rem; line-height: 1;
}
.na-wq-collapse:hover { border-color: #99f6e4; color: #0d5f59; }
.na-wq-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.na-wq-head strong { display: block; font-size: 0.92rem; color: #0f172a; }
.na-wq-head p { margin: 2px 0 0; font-size: 0.75rem; color: #64748b; }
.na-wq-add {
  border: none;
  background: #0f766e;
  color: #fff;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.75rem;
  padding: 8px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.na-wq-legend {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.na-wq-chip {
  font-size: 0.68rem;
  font-weight: 800;
  border-radius: 999px;
  padding: 3px 8px;
  border: 1px solid;
}
.na-wq-chip--pending {
  color: #0f766e;
  background: #f0fdfa;
  border-color: #99f6e4;
}
.na-wq-chip--started {
  color: #b45309;
  background: #fffbeb;
  border-color: #fcd34d;
}
.na-wq-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 6px;
  margin-bottom: 12px;
}
.na-wq-primary, .na-wq-outline, .na-wq-link {
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.78rem;
  padding: 8px 6px;
  cursor: pointer;
}
.na-wq-primary {
  border: none;
  background: #0f766e;
  color: #fff;
}
.na-wq-outline {
  border: 1px solid #0f766e;
  background: #fff;
  color: #0d5f59;
}
.na-wq-link {
  border: none;
  background: transparent;
  color: #64748b;
}
.na-wq-primary:disabled, .na-wq-outline:disabled, .na-wq-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.na-wq-empty {
  color: #64748b;
  font-size: 0.82rem;
  line-height: 1.4;
  padding: 8px 2px;
}
.na-wq-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.na-wq-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
}
.na-wq-delete {
  border: none;
  background: transparent;
  color: #b91c1c;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 6px;
  line-height: 1;
}
.na-wq-item-btn {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.na-wq-item--completed .na-wq-item-btn,
.na-wq-item--signed .na-wq-item-btn {
  border-color: #99f6e4;
  background: #ecfdf5;
}
.na-wq-item--not_started .na-wq-item-btn {
  border-color: #99f6e4;
  background: #f0fdfa;
}
.na-wq-item--started .na-wq-item-btn {
  border-color: #fcd34d;
  background: #fffbeb;
}
.na-wq-item.active .na-wq-item-btn {
  box-shadow: inset 0 0 0 2px rgba(15, 23, 42, 0.12);
}
.na-wq-item-top {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 0.84rem;
  align-items: center;
}
.na-wq-item-top strong {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.na-wq-conn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.na-wq-conn--logo {
  border-color: #e2e8f0;
  background: #fff;
  color: inherit;
}
.na-wq-tenant-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.na-wq-item-top span { color: #64748b; font-size: 0.72rem; font-weight: 700; }
.na-wq-item--started .na-wq-item-top span { color: #b45309; }
.na-wq-item--not_started .na-wq-item-top span { color: #0f766e; }
.na-wq-item-meta, .na-wq-item-type {
  color: #64748b;
  font-size: 0.75rem;
  margin-top: 2px;
}
.na-wq-item-type { font-weight: 600; color: #334155; }
@media (max-width: 1100px) {
  .na-wq {
    height: auto;
    max-height: 320px;
    position: relative;
    border-left: none;
    border-top: 1px solid #e2e8f0;
  }
}
</style>
