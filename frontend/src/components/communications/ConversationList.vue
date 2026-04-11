<template>
  <div class="conv-list">
    <!-- Search bar -->
    <div class="conv-list__search">
      <div class="search-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="search"
          type="text"
          class="search-input"
          placeholder="Search clients…"
          @input="debouncedLoad"
        />
        <button v-if="search" class="search-clear" type="button" @click="clearSearch">✕</button>
      </div>
    </div>

    <!-- Filter chips -->
    <div class="conv-list__filters">
      <button
        v-for="f in filters"
        :key="f.key"
        type="button"
        class="filter-chip"
        :class="{ 'filter-chip--active': activeFilter === f.key }"
        @click="setFilter(f.key)"
      >{{ f.label }}</button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading && threads.length === 0" class="conv-list__items">
      <div v-for="i in 6" :key="i" class="thread-skeleton">
        <div class="skel skel-avatar" />
        <div class="skel-body">
          <div class="skel skel-line skel-line--name" />
          <div class="skel skel-line skel-line--preview" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading && filtered.length === 0" class="conv-list__empty">
      <div class="empty-icon">💬</div>
      <p v-if="search">No conversations match "{{ search }}"</p>
      <p v-else-if="activeFilter === 'unread'">No unread messages</p>
      <p v-else>No conversations yet.<br>Click <strong>New</strong> to start one.</p>
    </div>

    <!-- Thread rows -->
    <ul v-else class="conv-list__items" role="listbox">
      <li
        v-for="t in filtered"
        :key="t.client_id"
        class="thread-row"
        :class="{
          'thread-row--active': activeClientId === t.client_id,
          'thread-row--unread': t.unread_count > 0
        }"
        role="option"
        :aria-selected="activeClientId === t.client_id"
        tabindex="0"
        @click="select(t)"
        @keydown.enter="select(t)"
      >
        <div class="thread-avatar" :style="avatarStyle(t)">
          {{ avatarLetter(t) }}
        </div>
        <div class="thread-body">
          <div class="thread-top">
            <span class="thread-name">{{ t.client_name || t.client_initials || 'Unknown' }}</span>
            <span class="thread-time">{{ relativeTime(t.last_message_at) }}</span>
          </div>
          <div class="thread-preview">
            <span class="preview-dir" v-if="t.last_direction === 'OUTBOUND'">You: </span>
            <span class="preview-text">{{ truncate(t.last_body, 55) }}</span>
          </div>
        </div>
        <span v-if="t.unread_count > 0" class="unread-badge">
          {{ t.unread_count > 99 ? '99+' : t.unread_count }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  activeClientId: { type: [Number, String], default: null },
  agencyId:       { type: [Number, String], default: null }
});

const emit = defineEmits(['select']);

const threads   = ref([]);
const loading   = ref(false);
const search    = ref('');
const activeFilter = ref('all');

const filters = [
  { key: 'all',    label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'inbound', label: 'Received' }
];

const filtered = computed(() => {
  let list = threads.value;
  if (activeFilter.value === 'unread')  list = list.filter((t) => t.unread_count > 0);
  if (activeFilter.value === 'inbound') list = list.filter((t) => t.last_direction === 'INBOUND');
  return list;
});

let debounceTimer = null;
function debouncedLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 350);
}

async function load() {
  loading.value = true;
  try {
    const params = { limit: 100 };
    if (props.agencyId) params.agencyId = props.agencyId;
    if (search.value.trim()) params.search = search.value.trim();
    const res = await api.get('/messages/threads', { params });
    threads.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    console.warn('[ConversationList] load error:', e?.message);
  } finally {
    loading.value = false;
  }
}

function clearSearch() {
  search.value = '';
  load();
}

function setFilter(key) {
  activeFilter.value = key;
}

function select(t) {
  emit('select', t);
}

function avatarLetter(t) {
  const name = t.client_name || t.client_initials || '?';
  return name[0].toUpperCase();
}

const palette = ['#dbeafe', '#d1fae5', '#fce7f3', '#fef3c7', '#ede9fe', '#fee2e2', '#e0f2fe'];
function avatarStyle(t) {
  const idx = (t.client_id || 0) % palette.length;
  const bg = palette[idx];
  const darkColors = ['#1d4ed8', '#065f46', '#9d174d', '#92400e', '#5b21b6', '#991b1b', '#0369a1'];
  return { background: bg, color: darkColors[idx] };
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function relativeTime(iso) {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1)  return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)   return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7)     return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Expose refresh so parent can trigger it after sending
defineExpose({ refresh: load });

onMounted(load);
watch(() => props.agencyId, load);
</script>

<style scoped>
.conv-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface-card, #fff);
  border-right: 1px solid var(--border, #e6e8ec);
}

/* Search */
.conv-list__search {
  padding: 12px 14px 8px;
  flex-shrink: 0;
}

.search-wrap {
  display: flex;
  align-items: center;
  background: #f4f6f8;
  border-radius: 8px;
  padding: 0 10px;
  gap: 6px;
  border: 1px solid transparent;
  transition: border-color 0.15s;
}
.search-wrap:focus-within { border-color: #7aa2ff; background: #fff; }

.search-icon { width: 15px; height: 15px; color: #9ca3af; flex-shrink: 0; }

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 8px 0;
  font-size: 0.875rem;
  outline: none;
  color: var(--text-primary, #1a1a2e);
}
.search-input::placeholder { color: #9ca3af; }

.search-clear {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: #9ca3af;
  padding: 2px 4px;
  line-height: 1;
}
.search-clear:hover { color: var(--text-primary, #1a1a2e); }

/* Filters */
.conv-list__filters {
  display: flex;
  gap: 6px;
  padding: 0 14px 10px;
  flex-shrink: 0;
}

.filter-chip {
  padding: 3px 11px;
  border-radius: 20px;
  border: 1px solid var(--border, #d4d8de);
  background: #fff;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  color: var(--text-secondary, #6c7785);
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.filter-chip--active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.filter-chip:hover:not(.filter-chip--active) { background: #f0f2f4; }

/* Items */
.conv-list__items {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}

/* Thread rows */
.thread-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border, #f0f2f4);
  transition: background 0.1s;
  position: relative;
  outline: none;
}
.thread-row:hover { background: #f8f9fa; }
.thread-row--active { background: #eff6ff; }
.thread-row--unread .thread-name { font-weight: 700; }
.thread-row--unread .preview-text { color: var(--text-primary, #1a1a2e); font-weight: 500; }
.thread-row:focus-visible { box-shadow: inset 0 0 0 2px #7aa2ff; }

/* Avatar */
.thread-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  flex-shrink: 0;
}

/* Body */
.thread-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.thread-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}

.thread-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.thread-time {
  font-size: 0.72rem;
  color: var(--text-secondary, #6c7785);
  white-space: nowrap;
  flex-shrink: 0;
}

.thread-preview {
  font-size: 0.8rem;
  color: var(--text-secondary, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-dir { color: var(--text-secondary, #9ca3af); }
.preview-text { }

/* Unread badge */
.unread-badge {
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  flex-shrink: 0;
}

/* Skeleton */
.thread-skeleton {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px;
  border-bottom: 1px solid var(--border, #f0f2f4);
}

.skel {
  background: linear-gradient(90deg, #f0f2f4 25%, #e8eaec 50%, #f0f2f4 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.skel-avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; }
.skel-body { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.skel-line { height: 10px; }
.skel-line--name { width: 55%; }
.skel-line--preview { width: 80%; }

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Empty */
.conv-list__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
  color: var(--text-secondary, #6c7785);
}
.empty-icon { font-size: 2.5rem; margin-bottom: 12px; opacity: 0.6; }
.conv-list__empty p { margin: 0; font-size: 0.875rem; line-height: 1.6; }
</style>
