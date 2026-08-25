<template>
  <aside class="cnl">
    <div class="cnl-title">{{ title }}</div>
    <button type="button" class="cnl-new" @click="$emit('new')">
      <span aria-hidden="true">+</span> {{ newLabel }}
    </button>

    <div class="cnl-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'active'"
        :class="{ active: tab === 'active' }"
        @click="$emit('update:tab', 'active')"
      >
        Active
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'archived'"
        :class="{ active: tab === 'archived' }"
        @click="$emit('update:tab', 'archived')"
      >
        Archived
      </button>
    </div>

    <input
      :value="search"
      type="search"
      class="cnl-search"
      placeholder="Search notes…"
      aria-label="Search notes"
      @input="$emit('update:search', $event.target.value)"
    />

    <div class="cnl-list" aria-label="Clinical notes">
      <div v-if="loading" class="cnl-muted">Loading…</div>
      <div v-else-if="error" class="cnl-error">{{ error }}</div>
      <div v-else-if="!groups.length" class="cnl-muted">
        {{ tab === 'archived' ? 'No archived notes yet.' : 'No active notes yet.' }}
      </div>
      <div v-for="group in groups" :key="group.key" class="cnl-date-group">
        <button
          type="button"
          class="cnl-date-header"
          :class="{ open: isOpen(group.key) }"
          :aria-expanded="isOpen(group.key)"
          @click="toggle(group.key)"
        >
          <div class="cnl-cal">
            <span class="cnl-month">{{ group.month }}</span>
            <span class="cnl-day">{{ group.day }}</span>
          </div>
          <div class="cnl-date-meta">
            <strong>{{ group.label }}</strong>
            <span>{{ group.drafts.length }} note{{ group.drafts.length === 1 ? '' : 's' }}</span>
          </div>
          <span class="cnl-chevron" :class="{ open: isOpen(group.key) }" aria-hidden="true">›</span>
        </button>
        <div v-show="isOpen(group.key)" class="cnl-notes">
          <button
            v-for="d in group.drafts"
            :key="d.id"
            type="button"
            class="cnl-row"
            :class="{ selected: String(selectedId) === String(d.id) }"
            @click="$emit('select', d)"
          >
            <div>
              <div class="cnl-row-top">
                <strong>{{ d.initials || '—' }}</strong>
                <span>{{ timeLabel(d.created_at) }}</span>
              </div>
              <div class="cnl-type">{{ typeLabel(d) }}</div>
              <div class="cnl-dos">DOS: {{ d.date_of_service ? String(d.date_of_service).slice(0, 10) : '—' }}</div>
            </div>
            <span class="cnl-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </div>

    <div class="cnl-footer">
      <span>{{ filtered.length }} note{{ filtered.length === 1 ? '' : 's' }}</span>
      <span>Auto-archives after 7 days · kept up to 7 years</span>
    </div>
  </aside>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { formatDraftListTime, todayIsoDate } from '../../utils/noteAidUiHelpers.js';
import {
  defaultDraftTypeLabel,
  draftCreatedKey,
  filterClinicalNoteDrafts,
  groupClinicalNoteDrafts
} from '../../utils/clinicalNoteLibrary.js';

const props = defineProps({
  title: { type: String, default: 'Clinical Note Library' },
  newLabel: { type: String, default: 'New Note' },
  drafts: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  selectedId: { type: [String, Number], default: null },
  tab: { type: String, default: 'active' },
  search: { type: String, default: '' },
  typeLabel: { type: Function, default: defaultDraftTypeLabel }
});

defineEmits(['new', 'select', 'update:tab', 'update:search']);

const openGroups = reactive({});

const filtered = computed(() =>
  filterClinicalNoteDrafts(props.drafts, { tab: props.tab, search: props.search })
);
const groups = computed(() => groupClinicalNoteDrafts(filtered.value));

function timeLabel(raw) {
  return formatDraftListTime(raw);
}

function isOpen(key) {
  if (Object.prototype.hasOwnProperty.call(openGroups, key)) return !!openGroups[key];
  if (key === todayIsoDate()) return true;
  if (props.selectedId) {
    const selected = (props.drafts || []).find((d) => String(d.id) === String(props.selectedId));
    if (selected && draftCreatedKey(selected.created_at) === key) return true;
  }
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
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 14px 0 10px;
  background: #f8fafc;
  border-radius: 10px;
  padding: 4px;
}
.cnl-tabs button {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  font-weight: 600;
  color: var(--cnl-muted);
  cursor: pointer;
}
.cnl-tabs button.active {
  background: white;
  color: var(--cnl-teal-dark);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
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
  border-color: #99f6e4;
  background: #f0fdfa;
}
.cnl-date-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cnl-date-meta strong { font-size: 0.88rem; }
.cnl-date-meta span { color: var(--cnl-muted); font-size: 0.75rem; }
.cnl-notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 0 4px 12px;
  border-left: 2px solid #ccfbf1;
  margin-left: 22px;
}
.cnl-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: center;
  text-align: left;
  border: 1px solid transparent;
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  color: inherit;
  width: 100%;
  font: inherit;
}
.cnl-row:hover,
.cnl-row.selected {
  border-color: #99f6e4;
  background: #f0fdfa;
}
.cnl-cal {
  background: white;
  border: 1px solid var(--cnl-border);
  border-radius: 10px;
  text-align: center;
  padding: 6px 4px;
  line-height: 1.1;
}
.cnl-month { display: block; font-size: 0.65rem; font-weight: 700; color: var(--cnl-teal); }
.cnl-day { display: block; font-size: 1rem; font-weight: 800; }
.cnl-row-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.85rem;
}
.cnl-row-top span,
.cnl-dos { color: var(--cnl-muted); font-size: 0.78rem; }
.cnl-type { font-weight: 600; color: #334155; margin-top: 2px; font-size: 0.78rem; }
.cnl-chevron { color: #94a3b8; }
.cnl-chevron.open { transform: rotate(90deg); display: inline-block; }
.cnl-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  font-size: 0.75rem;
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
