<template>
  <div
    class="momentum-sticky-card"
    :class="{ collapsed: sticky.is_collapsed, pinned: sticky.is_pinned }"
    :style="cardStyle"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >
    <div class="sticky-header" @dblclick="toggleCollapse">
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
        <button
          type="button"
          class="sticky-btn sticky-btn-delete"
          title="Delete"
          @click.stop="deleteSticky"
        >
          ×
        </button>
      </div>
    </div>
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

const emit = defineEmits(['update', 'delete', 'position-change', 'add-entry', 'update-entry', 'delete-entry', 'promote-entry']);

const localTitle = ref(props.sticky.title);
const entryTexts = ref([]);
const showColorMenu = ref(false);
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

const changeColor = (id) => {
  showColorMenu.value = false;
  emit('update', { color: id });
};

const closeColorMenu = () => {
  showColorMenu.value = false;
};

watch(showColorMenu, (open) => {
  if (open) {
    setTimeout(() => document.addEventListener('click', closeColorMenu), 0);
  } else {
    document.removeEventListener('click', closeColorMenu);
  }
});

onUnmounted(() => {
  document.removeEventListener('click', closeColorMenu);
});

watch(
  () => props.sticky,
  (s) => {
    localTitle.value = s?.title ?? '';
    entryTexts.value = (s?.entries ?? []).map((e) => e.text);
  },
  { immediate: true, deep: true }
);

const cardStyle = computed(() => ({
  left: `${props.sticky.position_x ?? 0}px`,
  top: `${props.sticky.position_y ?? 0}px`,
  '--sticky-bg': colorHex(props.sticky.color)
}));

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

const deleteSticky = () => {
  emit('delete');
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

const onDragStart = (e) => {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', props.sticky.id);
  e.target.classList.add('dragging');
};

const onDragEnd = (e) => {
  e.target.classList.remove('dragging');
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
  cursor: grab;
  z-index: 100;
  transition: box-shadow 0.2s;
}

.momentum-sticky-card:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.momentum-sticky-card.dragging {
  cursor: grabbing;
  opacity: 0.9;
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
  gap: 8px;
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

.sticky-btn-delete {
  font-size: 18px;
  line-height: 1;
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
