<template>
  <Teleport to="body">
    <div v-if="count > 0" class="bulk-bar">
      <div class="bulk-bar__inner">
        <span class="bulk-bar__count">{{ count }} selected</span>

        <button
          v-if="showOpenNotes"
          type="button"
          class="bulk-bar__btn bulk-bar__btn--open"
          :disabled="busy"
          @click="$emit('open-notes')"
        >
          Open in Note Aid
        </button>

        <button type="button" class="bulk-bar__btn bulk-bar__btn--complete" :disabled="busy" @click="$emit('complete')">
          <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Complete
        </button>

        <label class="bulk-bar__field">
          <select :disabled="busy || !users.length" :title="users.length ? 'Assign selected tasks' : 'No assignable users'" @change="onAssign">
            <option value="" selected disabled>Assign to…</option>
            <option v-for="u in users" :key="userId(u)" :value="String(userId(u))">{{ userLabel(u) }}</option>
          </select>
        </label>

        <label class="bulk-bar__field">
          <input type="date" :disabled="busy" @change="onDueDate" title="Set due date" />
        </label>

        <label class="bulk-bar__field">
          <select :disabled="busy" @change="onPriority">
            <option value="" selected disabled>Priority…</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <div class="bulk-bar__field bulk-bar__field--menu" ref="categoryMenuRoot">
          <button
            type="button"
            class="bulk-bar__menu-btn"
            :disabled="busy"
            @click="categoryOpen = !categoryOpen"
          >
            Categories…
          </button>
          <div v-if="categoryOpen" class="bulk-bar__category-menu">
            <p class="bulk-bar__category-head">Set categories</p>
            <label
              v-for="c in categoryOptions"
              :key="c.value"
              class="bulk-bar__category-option"
              :class="{ on: categoryDraft.includes(c.value) }"
            >
              <input v-model="categoryDraft" type="checkbox" :value="c.value" />
              {{ c.label }}
            </label>
            <div class="bulk-bar__category-actions">
              <button type="button" class="bulk-bar__category-apply" :disabled="busy" @click="applyCategories">
                Apply
              </button>
              <button type="button" class="bulk-bar__category-cancel" @click="closeCategoryMenu">Cancel</button>
            </div>
          </div>
        </div>

        <label v-if="typeDefs.length" class="bulk-bar__field">
          <select :disabled="busy" @change="onType">
            <option value="" selected disabled>Type…</option>
            <option v-for="t in typeDefs" :key="t.id" :value="String(t.id)">{{ t.label }}</option>
          </select>
        </label>

        <label class="bulk-bar__field">
          <select :disabled="busy" @change="onStatus">
            <option value="" selected disabled>Status…</option>
            <option value="pending">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting">Waiting</option>
            <option value="completed">Completed</option>
          </select>
        </label>

        <button type="button" class="bulk-bar__clear" @click="$emit('clear')">Clear</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { TASK_CATEGORIES, normalizeTaskCategories } from '../../utils/taskCategories';

defineProps({
  count: { type: Number, default: 0 },
  users: { type: Array, default: () => [] },
  typeDefs: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  showOpenNotes: { type: Boolean, default: false }
});

const emit = defineEmits(['complete', 'assign', 'due-date', 'priority', 'categories', 'type', 'status', 'open-notes', 'clear']);

const categoryOptions = TASK_CATEGORIES;
const categoryOpen = ref(false);
const categoryDraft = ref([]);
const categoryMenuRoot = ref(null);

function onDocumentMouseDown(ev) {
  if (!categoryOpen.value) return;
  if (categoryMenuRoot.value?.contains(ev.target)) return;
  closeCategoryMenu();
}

onMounted(() => document.addEventListener('mousedown', onDocumentMouseDown, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentMouseDown, true));

function closeCategoryMenu() {
  categoryOpen.value = false;
  categoryDraft.value = [];
}

function applyCategories() {
  emit('categories', normalizeTaskCategories(categoryDraft.value));
  closeCategoryMenu();
}

function userId(u) {
  return Number(u?.id ?? u?.user_id ?? 0);
}

function userLabel(u) {
  const name = [u.first_name ?? u.firstName, u.last_name ?? u.lastName].filter(Boolean).join(' ');
  return name || u.email || `User #${userId(u)}`;
}

function onAssign(ev) {
  const val = ev.target.value;
  if (val === '') return;
  emit('assign', Number(val));
  ev.target.value = '';
}

function onDueDate(ev) {
  const val = ev.target.value;
  if (!val) return;
  emit('due-date', val);
  ev.target.value = '';
}

function onPriority(ev) {
  const val = ev.target.value;
  if (val === '') return;
  emit('priority', val);
  ev.target.value = '';
}

function onType(ev) {
  const val = ev.target.value;
  if (val === '') return;
  emit('type', val);
  ev.target.value = '';
}

function onStatus(ev) {
  const val = ev.target.value;
  if (val === '') return;
  emit('status', val);
  ev.target.value = '';
}
</script>

<style scoped>
.bulk-bar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 940;
}

.bulk-bar__inner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0f172a;
  color: #fff;
  padding: 10px 14px;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.3);
  flex-wrap: wrap;
  max-width: calc(100vw - 32px);
}

.bulk-bar__count {
  font-size: 12px;
  font-weight: 700;
  padding-right: 6px;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
  white-space: nowrap;
}

.bulk-bar__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  background: #16a34a;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.bulk-bar__btn svg { width: 12px; height: 12px; }
.bulk-bar__btn:hover { background: #15803d; }
.bulk-bar__btn:disabled { opacity: 0.6; cursor: default; }
.bulk-bar__btn--open {
  background: #0f766e !important;
}
.bulk-bar__btn--open:hover:not(:disabled) {
  background: #0d5f59 !important;
}

.bulk-bar__field select,
.bulk-bar__field input {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.bulk-bar__field select option { color: #0f172a; }
.bulk-bar__field input[type="date"] { color-scheme: dark; }

.bulk-bar__field--menu { position: relative; }
.bulk-bar__menu-btn {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
}
.bulk-bar__menu-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
.bulk-bar__menu-btn:disabled { opacity: 0.6; cursor: default; }

.bulk-bar__category-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 950;
  min-width: 220px;
  max-height: 280px;
  overflow: auto;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24);
}
.bulk-bar__category-head {
  margin: 0 0 6px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #94a3b8;
}
.bulk-bar__category-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}
.bulk-bar__category-option:hover,
.bulk-bar__category-option.on { background: #eef2ff; color: #3730a3; }
.bulk-bar__category-option input { margin: 0; }
.bulk-bar__category-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}
.bulk-bar__category-apply,
.bulk-bar__category-cancel {
  flex: 1;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 8px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
}
.bulk-bar__category-apply {
  background: #0f766e;
  color: #fff;
}
.bulk-bar__category-apply:hover:not(:disabled) { background: #0d9488; }
.bulk-bar__category-apply:disabled { opacity: 0.6; cursor: default; }
.bulk-bar__category-cancel {
  background: #f1f5f9;
  color: #475569;
}
.bulk-bar__category-cancel:hover { background: #e2e8f0; }

.bulk-bar__clear {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
}
.bulk-bar__clear:hover { color: #fff; }

@media (max-width: 700px) {
  .bulk-bar__inner { max-width: calc(100vw - 24px); }
}
</style>
