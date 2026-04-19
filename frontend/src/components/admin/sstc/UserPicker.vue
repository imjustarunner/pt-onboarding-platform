<template>
  <div class="user-picker" v-click-outside="closeDropdown">
    <div class="picker-input-wrap">
      <input
        ref="inputEl"
        type="text"
        :value="displayValue"
        :placeholder="placeholder"
        :disabled="loading"
        @focus="onFocus"
        @input="onInput"
        @keydown.down.prevent="moveCursor(1)"
        @keydown.up.prevent="moveCursor(-1)"
        @keydown.enter.prevent="commitCursor"
        @keydown.escape="closeDropdown"
      />
      <button
        v-if="selected"
        type="button"
        class="clear-btn"
        title="Clear"
        @click="clear"
      >×</button>
    </div>
    <div v-if="open && filtered.length > 0" class="picker-dropdown">
      <div
        v-for="(u, i) in filtered.slice(0, 25)"
        :key="`up-${u.id}`"
        class="picker-row"
        :class="{ 'picker-row--active': i === cursor }"
        @mousedown.prevent="select(u)"
        @mouseenter="cursor = i"
      >
        <div class="picker-row-name">{{ displayName(u) }}</div>
        <div class="picker-row-meta">
          <span>{{ u.email }}</span>
          <span v-if="u.role" class="role-pill">{{ u.role }}</span>
        </div>
        <div v-if="(u.sstcMemberships || []).length" class="picker-row-clubs">
          <span
            v-for="m in u.sstcMemberships"
            :key="`um-${u.id}-${m.clubId}`"
            class="club-pill"
            :class="`role-${m.clubRole}`"
            :title="`${m.clubName} · ${m.clubRole}${m.isActive ? '' : ' (inactive)'}`"
          >
            {{ m.clubName }} · {{ shortRole(m.clubRole) }}
          </span>
        </div>
      </div>
      <div v-if="filtered.length > 25" class="picker-more">
        Showing first 25 of {{ filtered.length }} matches — keep typing to narrow.
      </div>
    </div>
    <div v-else-if="open && query && !loading" class="picker-empty">
      No matches.
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

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

const props = defineProps({
  users: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
  loading: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Search…' },
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

const shortRole = (role) => {
  if (role === 'manager') return 'mgr';
  if (role === 'assistant_manager') return 'asst';
  return 'mem';
};

const selected = computed(() =>
  props.users.find((u) => u.id === props.selectedId) || null
);
const displayValue = computed(() => {
  if (open.value) return query.value;
  return selected.value ? `${displayName(selected.value)} · ${selected.value.email}` : '';
});

const excludeSet = computed(() => new Set(props.excludeIds || []));

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const all = (props.users || []).filter((u) => !excludeSet.value.has(u.id));
  if (!q) return all;
  return all.filter((u) => {
    const hay = `${u.firstName || ''} ${u.lastName || ''} ${u.email || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

watch(filtered, () => { cursor.value = 0; });

const onFocus = () => {
  open.value = true;
  query.value = '';
};
const onInput = (e) => {
  query.value = e.target.value;
  open.value = true;
};
const closeDropdown = () => {
  open.value = false;
  query.value = '';
};
const select = (u) => {
  emit('update', u);
  closeDropdown();
  inputEl.value?.blur();
};
const clear = () => {
  emit('update', null);
  closeDropdown();
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
  if (item) select(item);
};
</script>

<style scoped>
.user-picker { position: relative; width: 100%; }
.picker-input-wrap { position: relative; }
.picker-input-wrap input {
  width: 100%;
  padding: 8px 32px 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
}
.clear-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: 0;
  font-size: 18px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-secondary);
}
.clear-btn:hover { background: rgba(0,0,0,0.06); color: var(--text-primary); }

.picker-dropdown, .picker-empty {
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
.picker-empty { padding: 10px 12px; color: var(--text-secondary); font-size: 13px; }
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
.picker-row-clubs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.club-pill {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: #e0e7ff;
  color: #3730a3;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.club-pill.role-manager { background: #dcfce7; color: #166534; }
.club-pill.role-assistant_manager { background: #fef3c7; color: #92400e; }
</style>
