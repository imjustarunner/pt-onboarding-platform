<template>
  <div class="user-multipicker" v-click-outside="closeDropdown">
    <div class="chips-input">
      <span
        v-for="u in selectedUsers"
        :key="`chip-${u.id}`"
        class="chip"
      >
        {{ displayName(u) }}
        <button type="button" class="chip-x" @click="remove(u.id)" title="Remove">×</button>
      </span>
      <input
        ref="inputEl"
        type="text"
        v-model="query"
        :placeholder="selectedUsers.length ? '' : placeholder"
        :disabled="loading"
        @focus="open = true"
        @keydown.down.prevent="moveCursor(1)"
        @keydown.up.prevent="moveCursor(-1)"
        @keydown.enter.prevent="commitCursor"
        @keydown.escape="closeDropdown"
        @keydown.backspace="onBackspace"
      />
    </div>
    <div v-if="open && filtered.length > 0" class="picker-dropdown">
      <div
        v-for="(u, i) in filtered.slice(0, 25)"
        :key="`mp-${u.id}`"
        class="picker-row"
        :class="{ 'picker-row--active': i === cursor }"
        @mousedown.prevent="add(u)"
        @mouseenter="cursor = i"
      >
        <div class="picker-row-name">{{ displayName(u) }}</div>
        <div class="picker-row-meta">
          <span>{{ u.email }}</span>
          <span v-if="u.role" class="role-pill">{{ u.role }}</span>
        </div>
      </div>
      <div v-if="filtered.length > 25" class="picker-more">
        Showing first 25 of {{ filtered.length }} matches.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  users: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Add…' },
  excludeIds: { type: Array, default: () => [] }
});
const emit = defineEmits(['update']);

const open = ref(false);
const query = ref('');
const cursor = ref(0);
const inputEl = ref(null);

const displayName = (u) => {
  const name = `${u?.firstName || ''} ${u?.lastName || ''}`.trim();
  return name || u?.email || `User ${u?.id || ''}`;
};

const selectedSet = computed(() => new Set(props.selectedIds || []));
const excludeSet = computed(() => new Set(props.excludeIds || []));

const selectedUsers = computed(() =>
  (props.selectedIds || [])
    .map((id) => props.users.find((u) => u.id === id))
    .filter(Boolean)
);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const all = (props.users || []).filter(
    (u) => !selectedSet.value.has(u.id) && !excludeSet.value.has(u.id)
  );
  if (!q) return all;
  return all.filter((u) => {
    const hay = `${u.firstName || ''} ${u.lastName || ''} ${u.email || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

watch(filtered, () => { cursor.value = 0; });

const closeDropdown = () => {
  open.value = false;
  query.value = '';
};

const add = (u) => {
  const next = Array.from(new Set([...(props.selectedIds || []), u.id]));
  emit('update', next);
  query.value = '';
  open.value = true;
  inputEl.value?.focus();
};
const remove = (id) => {
  emit('update', (props.selectedIds || []).filter((x) => x !== id));
};
const onBackspace = () => {
  if (query.value === '' && (props.selectedIds || []).length) {
    const next = [...props.selectedIds];
    next.pop();
    emit('update', next);
  }
};
const moveCursor = (delta) => {
  if (!open.value) open.value = true;
  const max = Math.min(filtered.value.length, 25);
  if (!max) return;
  cursor.value = (cursor.value + delta + max) % max;
};
const commitCursor = () => {
  const slice = filtered.value.slice(0, 25);
  const item = slice[cursor.value];
  if (item) add(item);
};

const vClickOutside = {
  mounted(el, binding) {
    el.__clickOutside__ = (e) => {
      if (!el.contains(e.target)) binding.value(e);
    };
    document.addEventListener('mousedown', el.__clickOutside__, true);
  },
  unmounted(el) {
    if (el.__clickOutside__) {
      document.removeEventListener('mousedown', el.__clickOutside__, true);
      el.__clickOutside__ = null;
    }
  }
};
</script>

<style scoped>
.user-multipicker { position: relative; width: 100%; }
.chips-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  background: white;
  min-height: 40px;
}
.chips-input input {
  flex: 1 1 120px;
  min-width: 100px;
  border: 0;
  outline: none;
  font-size: 14px;
  padding: 4px;
  background: transparent;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #ede9fe;
  color: #4338ca;
  border-radius: 999px;
  padding: 3px 8px 3px 10px;
  font-size: 12px;
  font-weight: 700;
}
.chip-x {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}
.chip-x:hover { color: #1e1b4b; }

.picker-dropdown {
  position: absolute;
  z-index: 30;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12));
}
.picker-row {
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.picker-row:last-child { border-bottom: 0; }
.picker-row--active, .picker-row:hover { background: rgba(79,70,229,0.08); }
.picker-row-name { font-weight: 700; color: var(--text-primary); }
.picker-row-meta {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
  align-items: center;
}
.role-pill {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f1f5f9;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.picker-more {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
  border-top: 1px solid var(--border);
}
</style>
