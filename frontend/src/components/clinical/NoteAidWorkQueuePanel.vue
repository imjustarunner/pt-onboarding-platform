<template>
  <aside class="na-wq" aria-label="Note Aid work queue">
    <header class="na-wq-head">
      <div>
        <strong>Work queue</strong>
        <p>{{ pendingCount }} not started · {{ startedCount }} in progress</p>
      </div>
      <button type="button" class="na-wq-add" @click="$emit('add-todo')">Add ToDo List</button>
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
      Paste a ToDo list or open pending Notes. Finished notes move to the left library.
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
                :style="connectionStyle(item)"
                :title="connectionLabel(item)"
                aria-hidden="true"
                v-html="connectionIconSvg(item)"
              />
              {{ item.clientName }}
            </strong>
            <span>{{ statusLabel(item) }}</span>
          </div>
          <div class="na-wq-item-meta">
            {{ item.date }}
            <template v-if="item.timeLabel"> · {{ item.timeLabel }}</template>
            · {{ connectionLabel(item) }}
          </div>
          <div class="na-wq-item-type">{{ typeLabel(item) }}</div>
        </button>
      </li>
    </ul>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import {
  DOC_STATUS,
  deriveWorkQueueDocStatus,
  filterWorkQueueForRightPanel,
  docStatusMeta,
  deriveNoteConnection,
  noteConnectionMeta
} from '../../utils/noteAidDocumentationStatus.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  activeId: { type: [String, null], default: null }
});

defineEmits(['add-todo', 'generate', 'next', 'clear', 'select']);

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
  min-height: 100%;
  height: calc(100vh - 64px);
  position: sticky;
  top: 0;
  padding: 14px 12px;
  min-width: 0;
}
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
  gap: 6px;
}
.na-wq-item-btn {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
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
