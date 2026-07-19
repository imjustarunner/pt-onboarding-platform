<template>
  <div class="mpp" data-testid="meeting-participants-picker" :class="{ 'mpp--tray': trayMode }">
    <button
      v-if="!trayMode"
      type="button"
      class="mpp-summary"
      :class="{ open: expanded, empty: !selectedNames.length }"
      :disabled="disabled"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="emit('toggle')"
    >
      <span class="mpp-summary-main">
        <template v-if="selectedNames.length">
          <span
            v-for="(name, idx) in selectedNames.slice(0, maxSummaryChips)"
            :key="`mpp-sum-${idx}`"
            class="mpp-chip"
          >{{ name }}</span>
          <span v-if="selectedNames.length > maxSummaryChips" class="mpp-more">
            +{{ selectedNames.length - maxSummaryChips }}
          </span>
        </template>
        <span v-else class="mpp-placeholder">Select participants…</span>
      </span>
      <span class="mpp-chevron" aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
    </button>

    <div v-if="expanded || trayMode" class="mpp-panel">
      <div v-if="loading" class="muted">Loading participants…</div>
      <div v-else-if="error" class="error">
        {{ error }}
        <button type="button" class="btn btn-secondary btn-sm" @click="emit('retry')">Retry</button>
      </div>
      <template v-else>
        <div class="mpp-groups">
          <div class="mpp-section-label">Teams &amp; groups</div>
          <div class="mpp-group-row">
            <button
              v-for="g in groups"
              :key="g.key"
              type="button"
              class="mpp-group-btn"
              :class="{ on: isGroupFullySelected(g) }"
              :title="`${(g.userIds || []).length} people`"
              :disabled="disabled || !(g.userIds || []).length"
              @click="emit('toggle-group', g)"
            >
              <span class="mpp-group-name">{{ g.label }}</span>
              <span class="mpp-group-count">{{ (g.userIds || []).length }}</span>
            </button>
            <button
              type="button"
              class="mpp-group-btn mpp-group-btn--create"
              :disabled="disabled"
              @click="startCreateGroup"
            >
              + Create new group
            </button>
          </div>
          <div v-if="creatingGroup" class="mpp-create-group">
            <input
              ref="createGroupInputEl"
              v-model="newGroupName"
              class="mpp-search"
              type="text"
              maxlength="120"
              placeholder="Name this group…"
              :disabled="disabled || createGroupBusy"
              @keydown.enter.prevent="confirmCreateGroup"
              @keydown.escape.prevent="cancelCreateGroup"
            />
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="disabled || createGroupBusy || !newGroupName.trim()"
              @click="confirmCreateGroup"
            >
              {{ createGroupBusy ? 'Saving…' : 'Save group' }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="createGroupBusy" @click="cancelCreateGroup">
              Cancel
            </button>
          </div>
          <p v-if="createGroupHint" class="muted">{{ createGroupHint }}</p>
          <p v-if="createGroupError" class="error">{{ createGroupError }}</p>
        </div>

        <label v-if="canUseAllAgencies" class="mpp-toggle">
          <input type="checkbox" :checked="includeAllAgencies" :disabled="disabled" @change="emit('update:includeAllAgencies', !!$event.target.checked)" />
          <span>Include people from all my agencies</span>
        </label>

        <input
          class="mpp-search"
          type="text"
          :value="search"
          :disabled="disabled"
          placeholder="Search participants by name or email"
          @input="emit('update:search', $event.target.value)"
        />

        <div class="mpp-actions">
          <button class="btn btn-secondary btn-sm" type="button" :disabled="disabled" @click="emit('add-all-shown')">
            Add all shown
          </button>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="disabled || !selectedIds.length" @click="emit('clear')">
            Clear
          </button>
        </div>

        <div v-if="selectedChips.length" class="mpp-selected">
          <button
            v-for="chip in selectedChips"
            :key="`mpp-sel-${chip.id}`"
            type="button"
            class="mpp-selected-chip"
            :disabled="disabled"
            @click="emit('remove', chip.id)"
          >
            <span>{{ chipLabel(chip) }}</span>
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div class="mpp-scroll">
          <div class="mpp-grid">
            <button
              v-for="p in candidates"
              :key="`mpp-p-${p.id}`"
              type="button"
              class="mpp-card"
              :class="{ on: selectedIdSet.has(Number(p.id)) }"
              :disabled="disabled"
              @click="emit('toggle-user', Number(p.id))"
            >
              <img v-if="photoUrl(p)" class="mpp-face" :src="photoUrl(p)" alt="" />
              <span v-else class="mpp-face mpp-face--initials" aria-hidden="true">{{ initials(p) }}</span>
              <span class="mpp-copy">
                <span class="mpp-name">{{ personLabel(p) }}</span>
                <span class="mpp-meta">
                  {{ String(p.role || '').trim() || 'provider' }}
                  <template v-if="busyText"> · {{ busyText(p.id) }}</template>
                </span>
              </span>
              <span class="mpp-check" aria-hidden="true">{{ selectedIdSet.has(Number(p.id)) ? '✓' : '' }}</span>
            </button>
          </div>
        </div>
        <div v-if="!candidates.length" class="muted">No participants match this search.</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps({
  expanded: { type: Boolean, default: false },
  /** When true, always show panel (used under header Participants) */
  trayMode: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  candidates: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  selectedChips: { type: Array, default: () => [] },
  selectedNames: { type: Array, default: () => [] },
  search: { type: String, default: '' },
  includeAllAgencies: { type: Boolean, default: false },
  canUseAllAgencies: { type: Boolean, default: false },
  busyText: { type: Function, default: null },
  personLabel: { type: Function, required: true },
  photoUrl: { type: Function, default: () => '' },
  initials: { type: Function, default: () => '?' },
  maxSummaryChips: { type: Number, default: 4 },
  createGroupBusy: { type: Boolean, default: false },
  createGroupError: { type: String, default: '' }
});

const emit = defineEmits([
  'toggle',
  'retry',
  'toggle-group',
  'toggle-user',
  'remove',
  'add-all-shown',
  'clear',
  'update:search',
  'update:includeAllAgencies',
  'create-group'
]);

const selectedIdSet = computed(
  () => new Set((props.selectedIds || []).map((n) => Number(n || 0)).filter((n) => n > 0))
);

const creatingGroup = ref(false);
const newGroupName = ref('');
const createGroupHint = ref('');
const createGroupInputEl = ref(null);

function isGroupFullySelected(group) {
  const ids = (group?.userIds || []).map((n) => Number(n || 0)).filter((n) => n > 0);
  if (!ids.length) return false;
  return ids.every((id) => selectedIdSet.value.has(id));
}

function chipLabel(chip) {
  if (chip?.row) return props.personLabel(chip.row);
  return props.personLabel({ id: chip.id });
}

async function startCreateGroup() {
  createGroupHint.value = '';
  if (!selectedIdSet.value.size) {
    createGroupHint.value = 'Select one or more participants first, then name the group.';
    creatingGroup.value = true;
    newGroupName.value = '';
    await nextTick();
    createGroupInputEl.value?.focus?.();
    return;
  }
  creatingGroup.value = true;
  newGroupName.value = '';
  await nextTick();
  createGroupInputEl.value?.focus?.();
}

function cancelCreateGroup() {
  creatingGroup.value = false;
  newGroupName.value = '';
  createGroupHint.value = '';
}

function confirmCreateGroup() {
  const name = String(newGroupName.value || '').trim();
  if (!name) return;
  if (!selectedIdSet.value.size) {
    createGroupHint.value = 'Select one or more participants first, then save the group.';
    return;
  }
  createGroupHint.value = '';
  emit('create-group', { name, userIds: Array.from(selectedIdSet.value) });
}

watch(
  () => [props.createGroupBusy, props.createGroupError],
  ([busy, err], prev) => {
    const wasBusy = Array.isArray(prev) ? !!prev[0] : false;
    if (wasBusy && !busy && !err) {
      creatingGroup.value = false;
      newGroupName.value = '';
      createGroupHint.value = '';
    }
  }
);
</script>

<style scoped>
.mpp { display: flex; flex-direction: column; gap: 8px; }
.mpp--tray .mpp-panel {
  border: none;
  background: transparent;
  padding: 0;
}
.mpp-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  color: #0f172a;
  font: inherit;
}
.mpp-summary:hover:not(:disabled) { border-color: #94a3b8; background: #f8fafc; }
.mpp-summary.open { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15); }
.mpp-summary.empty .mpp-placeholder { color: #64748b; font-weight: 600; }
.mpp-summary-main {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  min-width: 0;
}
.mpp-chip {
  display: inline-block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  font-weight: 700;
  color: #0f172a;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 2px 8px;
}
.mpp-more { font-size: 0.75rem; font-weight: 700; color: #64748b; }
.mpp-chevron { color: #64748b; font-size: 0.85rem; flex-shrink: 0; }
.mpp-panel {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mpp-section-label {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin-bottom: 6px;
}
.mpp-group-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.mpp-group-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #fff;
  color: #0f172a;
  padding: 5px 10px;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.mpp-group-btn:hover:not(:disabled) { border-color: #94a3b8; }
.mpp-group-btn.on {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1e3a8a;
}
.mpp-group-btn--create {
  border-style: dashed;
  color: #1d4ed8;
}
.mpp-group-count {
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 1px 6px;
}
.mpp-group-btn.on .mpp-group-count { background: #bfdbfe; color: #1e40af; }
.mpp-create-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.mpp-create-group .mpp-search { flex: 1 1 180px; }
.mpp-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  color: #0f172a;
}
.mpp-search {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
  color: #0f172a;
}
.mpp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mpp-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.mpp-selected-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.mpp-scroll { max-height: 260px; overflow: auto; }
.mpp-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.mpp-card {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 18px;
  gap: 8px;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 8px;
  text-align: left;
  cursor: pointer;
  color: #0f172a;
  font: inherit;
}
.mpp-card:hover:not(:disabled) { border-color: #94a3b8; }
.mpp-card.on {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px #2563eb;
}
.mpp-face {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  object-fit: cover;
  background: #e2e8f0;
}
.mpp-face--initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 800;
  color: #334155;
}
.mpp-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mpp-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mpp-meta {
  font-size: 0.72rem;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mpp-check {
  font-size: 0.9rem;
  font-weight: 800;
  color: #2563eb;
  text-align: center;
}
.muted { color: #64748b; font-size: 0.84rem; margin: 0; }
.error { color: #b91c1c; font-size: 0.84rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0; }
@media (max-width: 640px) {
  .mpp-grid { grid-template-columns: 1fr; }
}
</style>
