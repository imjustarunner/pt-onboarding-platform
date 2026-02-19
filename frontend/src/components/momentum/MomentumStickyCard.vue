<template>
  <div
    class="momentum-sticky-card"
    :class="{ collapsed: sticky.is_collapsed, pinned: sticky.is_pinned, dragging: isDragging }"
    :style="cardStyle"
  >
    <div class="sticky-header" @dblclick="toggleCollapse">
      <div
        class="drag-handle"
        title="Drag to move"
        @mousedown="onHeaderMouseDown"
      >
        ⋮⋮
      </div>
      <input
        v-model="localTitle"
        class="sticky-title-input"
        placeholder="Title"
        @blur="saveTitle"
        @keydown.enter="saveTitle"
      />
      <div class="sticky-actions">
        <div class="color-picker">
          <button
            type="button"
            class="color-btn"
            :title="`Color: ${sticky.color || 'yellow'}`"
            :style="{ background: colorHex(sticky.color) }"
            @click.stop="showColorMenu = !showColorMenu"
          />
          <div v-if="showColorMenu" class="color-menu" @click.stop>
            <button
              v-for="c in colorOptions"
              :key="c.id"
              type="button"
              class="color-option"
              :style="{ background: c.hex }"
              :title="c.id"
              @click="changeColor(c.id)"
            />
          </div>
        </div>
        <button
          type="button"
          class="sticky-btn"
          :title="sticky.is_pinned ? 'Unpin' : 'Pin'"
          @click.stop="togglePin"
        >
          {{ sticky.is_pinned ? '📌' : '📍' }}
        </button>
        <button
          type="button"
          class="sticky-btn"
          :title="sticky.is_collapsed ? 'Expand' : 'Collapse'"
          @click.stop="toggleCollapse"
        >
          {{ sticky.is_collapsed ? '▼' : '▲' }}
        </button>
        <div class="more-menu-wrap">
          <button
            type="button"
            class="sticky-btn more-btn"
            title="More options"
            @click.stop="showMoreMenu = !showMoreMenu"
          >
            ⋮
          </button>
          <div v-if="showMoreMenu" class="more-menu" @click.stop>
            <button type="button" class="more-menu-item" @click="hideSticky">
              👁‍🗨 Hide
            </button>
            <button type="button" class="more-menu-item more-menu-item-danger" @click="openDeleteConfirm">
              Delete permanently…
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- Delete confirmation modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="delete-modal-backdrop" @click.self="showDeleteModal = false">
        <div class="delete-modal">
          <h3 class="delete-modal-title">{{ hasContent ? 'Delete sticky permanently?' : 'Delete this sticky?' }}</h3>
          <p v-if="hasContent" class="delete-modal-warn">
            This sticky has content. Deleting will also remove any tasks promoted from it from your Momentum List.
          </p>
          <p v-if="hasContent" class="delete-modal-hint">Type <strong>delete</strong> to confirm.</p>
          <input
            v-if="hasContent"
            v-model="deleteConfirmText"
            type="text"
            class="delete-modal-input"
            placeholder="Type delete"
            autocomplete="off"
          />
          <div class="delete-modal-actions">
            <button type="button" class="delete-modal-btn cancel" @click="showDeleteModal = false">
              Cancel
            </button>
            <button
              type="button"
              class="delete-modal-btn danger"
              :disabled="hasContent && deleteConfirmText.toLowerCase() !== 'delete'"
              @click="confirmDelete"
            >
              Delete permanently
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    <div v-show="!sticky.is_collapsed" class="sticky-body">
      <div class="entries">
        <div
          v-for="(entry, idx) in sticky.entries"
          :key="entry.id"
          class="entry-row"
          :class="{ checked: entry.is_checked }"
        >
          <button
            type="button"
            class="entry-check"
            :aria-label="entry.is_checked ? 'Uncheck' : 'Check'"
            @click="toggleEntryCheck(entry)"
          >
            <span v-if="entry.is_checked" class="checkmark">✓</span>
            <span v-else class="checkbox-empty"></span>
          </button>
          <div class="entry-content">
            <textarea
              v-model="entryTexts[idx]"
              class="entry-text"
              :rows="entry.is_expanded || (entry.text && entry.text.length > 40) ? 2 : 1"
              placeholder="Add item..."
              @blur="saveEntry(entry, idx)"
              @focus="expandEntry(entry)"
            />
          </div>
          <button
            type="button"
            class="entry-promote"
            title="Promote to task"
            @click="promoteEntry(entry)"
          >
            ↑
          </button>
          <button
            type="button"
            class="entry-delete"
            title="Remove"
            @click="deleteEntry(entry)"
          >
            ×
          </button>
        </div>
      </div>
      <button type="button" class="add-entry-btn" @click="addEntry">
        + Add item
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';

const props = defineProps({
  sticky: { type: Object, required: true },
  userId: { type: Number, default: null }
});

const emit = defineEmits(['update', 'delete', 'hide', 'position-change', 'add-entry', 'update-entry', 'delete-entry', 'promote-entry']);

const localTitle = ref(props.sticky.title);
const entryTexts = ref([]);
const showColorMenu = ref(false);
const showMoreMenu = ref(false);
const showDeleteModal = ref(false);
const deleteConfirmText = ref('');
const isDragging = ref(false);
const dragX = ref(0);
const dragY = ref(0);
let saveEntryTimer = null;

const colorOptions = [
  { id: 'yellow', hex: '#fef08a' },
  { id: 'pink', hex: '#fbcfe8' },
  { id: 'blue', hex: '#bfdbfe' },
  { id: 'green', hex: '#bbf7d0' },
  { id: 'purple', hex: '#e9d5ff' },
  { id: 'orange', hex: '#fed7aa' }
];

const colorHex = (id) => colorOptions.find((c) => c.id === (id || 'yellow'))?.hex ?? '#fef08a';

const hasContent = computed(() => {
  const entries = props.sticky?.entries ?? [];
  return entries.some((e) => String(e?.text || '').trim().length > 0);
});

const hideSticky = () => {
  showMoreMenu.value = false;
  emit('hide');
};

const openDeleteConfirm = () => {
  showMoreMenu.value = false;
  deleteConfirmText.value = '';
  showDeleteModal.value = true;
};

const confirmDelete = () => {
  if (hasContent.value && deleteConfirmText.value.toLowerCase() !== 'delete') return;
  showDeleteModal.value = false;
  emit('delete');
};

const changeColor = (id) => {
  showColorMenu.value = false;
  emit('update', { color: id });
};

const closeColorMenu = () => {
  showColorMenu.value = false;
};

const closeMoreMenu = () => {
  showMoreMenu.value = false;
};

watch(showColorMenu, (open) => {
  if (open) {
    setTimeout(() => document.addEventListener('click', closeColorMenu), 0);
  } else {
    document.removeEventListener('click', closeColorMenu);
  }
});

watch(showMoreMenu, (open) => {
  if (open) {
    setTimeout(() => document.addEventListener('click', closeMoreMenu), 0);
  } else {
    document.removeEventListener('click', closeMoreMenu);
  }
});

onUnmounted(() => {
  document.removeEventListener('click', closeColorMenu);
  document.removeEventListener('click', closeMoreMenu);
});

watch(
  () => props.sticky,
  (s) => {
    localTitle.value = s?.title ?? '';
    entryTexts.value = (s?.entries ?? []).map((e) => e.text);
  },
  { immediate: true, deep: true }
);

const cardStyle = computed(() => {
  const x = isDragging.value ? dragX.value : (props.sticky.position_x ?? 0);
  const y = isDragging.value ? dragY.value : (props.sticky.position_y ?? 0);
  return {
    left: `${x}px`,
    top: `${y}px`,
    '--sticky-bg': colorHex(props.sticky.color)
  };
});

const toggleCollapse = () => {
  emit('update', { is_collapsed: !props.sticky.is_collapsed });
};

const togglePin = () => {
  emit('update', { is_pinned: !props.sticky.is_pinned });
};

const saveTitle = () => {
  const t = localTitle.value?.trim();
  if (t !== props.sticky.title) {
    emit('update', { title: t || 'Untitled' });
  }
};

const addEntry = () => {
  emit('add-entry');
};

const toggleEntryCheck = (entry) => {
  emit('update-entry', { ...entry, is_checked: !entry.is_checked });
};

const expandEntry = (entry) => {
  if (!entry.is_expanded) emit('update-entry', { ...entry, is_expanded: true });
};

const deleteEntry = (entry) => {
  emit('delete-entry', entry);
};

const promoteEntry = (entry) => {
  emit('promote-entry', entry);
};


const saveEntry = (entry, idx) => {
  if (saveEntryTimer) clearTimeout(saveEntryTimer);
  saveEntryTimer = setTimeout(() => {
    const text = entryTexts.value[idx];
    if (text !== undefined && String(text).trim() !== entry.text) {
      emit('update-entry', { ...entry, text: String(text).trim() || '' });
    }
    saveEntryTimer = null;
  }, 400);
};

let dragStartX = 0;
let dragStartY = 0;
let posStartX = 0;
let posStartY = 0;

const onHeaderMouseDown = (e) => {
  e.preventDefault();
  isDragging.value = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  posStartX = props.sticky.position_x ?? 0;
  posStartY = props.sticky.position_y ?? 0;
  dragX.value = posStartX;
  dragY.value = posStartY;
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (e) => {
  if (!isDragging.value) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  dragX.value = Math.max(0, posStartX + dx);
  dragY.value = Math.max(0, posStartY + dy);
};

const onMouseUp = () => {
  if (!isDragging.value) return;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  isDragging.value = false;
  emit('update', { position_x: Math.round(dragX.value), position_y: Math.round(dragY.value) });
};
</script>

<style scoped>
.momentum-sticky-card {
  position: fixed;
  min-width: 220px;
  max-width: 280px;
  background: var(--sticky-bg, #fef08a);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  transition: box-shadow 0.2s;
}

.momentum-sticky-card:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.momentum-sticky-card.dragging {
  cursor: grabbing;
  opacity: 0.95;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.drag-handle {
  flex-shrink: 0;
  padding: 2px 6px;
  cursor: grab;
  color: rgba(0, 0, 0, 0.4);
  font-size: 12px;
  line-height: 1;
  user-select: none;
}

.drag-handle:hover {
  color: rgba(0, 0, 0, 0.7);
}

.momentum-sticky-card.dragging .drag-handle {
  cursor: grabbing;
}

.momentum-sticky-card.collapsed {
  min-width: 180px;
}

.momentum-sticky-card.pinned {
  border-color: rgba(234, 179, 8, 0.5);
}

.sticky-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px 8px 0 0;
}

.sticky-title-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  outline: none;
}

.sticky-title-input::placeholder {
  color: rgba(0, 0, 0, 0.4);
}

.sticky-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.color-picker {
  position: relative;
}

.color-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.color-btn:hover {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.2);
}

.color-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  padding: 6px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  z-index: 1000;
}

.color-option {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  cursor: pointer;
}

.color-option:hover {
  transform: scale(1.1);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3);
}

.sticky-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0.7;
}

.sticky-btn:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.08);
}

.more-menu-wrap {
  position: relative;
}

.more-btn {
  font-size: 16px;
  font-weight: bold;
}

.more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 160px;
  padding: 4px 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1001;
}

.more-menu-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.more-menu-item:hover {
  background: rgba(0, 0, 0, 0.06);
}

.more-menu-item-danger {
  color: #b91c1c;
}

.more-menu-item-danger:hover {
  background: rgba(185, 28, 28, 0.1);
}

.delete-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.delete-modal {
  background: white;
  border-radius: 12px;
  padding: 20px;
  max-width: 360px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.delete-modal-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}

.delete-modal-warn {
  margin: 0 0 8px;
  font-size: 13px;
  color: #374151;
}

.delete-modal-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7280;
}

.delete-modal-input {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 16px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.delete-modal-input:focus {
  outline: none;
  border-color: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.delete-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.delete-modal-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.delete-modal-btn.cancel {
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
}

.delete-modal-btn.cancel:hover {
  background: #f3f4f6;
}

.delete-modal-btn.danger {
  border: none;
  background: #b91c1c;
  color: white;
}

.delete-modal-btn.danger:hover:not(:disabled) {
  background: #991b1b;
}

.delete-modal-btn.danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sticky-body {
  padding: 8px 10px 12px;
  max-height: 280px;
  overflow-y: auto;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entry-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.entry-row.checked .entry-text,
.entry-row.checked .entry-text-inline {
  text-decoration: line-through;
  color: rgba(0, 0, 0, 0.5);
}

.entry-check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.checkmark {
  color: #16a34a;
}

.checkbox-empty {
  display: block;
}

.entry-content {
  flex: 1;
  min-width: 0;
}

.entry-text,
.entry-text-inline {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
}

.entry-text-inline {
  display: block;
  padding: 4px 0;
  color: rgba(0, 0, 0, 0.8);
  cursor: text;
}

.entry-text-inline:empty::before {
  content: 'Add item...';
  color: rgba(0, 0, 0, 0.4);
}

.entry-promote,
.entry-delete {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  opacity: 0.5;
  border-radius: 4px;
}

.entry-promote {
  font-size: 14px;
}

.entry-promote:hover,
.entry-delete:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.1);
}

.add-entry-btn {
  margin-top: 8px;
  padding: 6px 0;
  border: none;
  background: transparent;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
}

.add-entry-btn:hover {
  color: rgba(0, 0, 0, 0.8);
  background: rgba(0, 0, 0, 0.05);
}
</style>
