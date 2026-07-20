<template>
  <div class="conv-list">
    <div class="conv-list__search">
      <div class="search-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="search"
          type="text"
          class="search-input"
          placeholder="Search conversations…"
          @input="debouncedLoad"
        />
        <button v-if="search" class="search-clear" type="button" @click="clearSearch">✕</button>
      </div>
      <button type="button" class="compose-btn" title="New conversation" @click="emit('compose')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <div class="conv-list__filters">
      <button
        v-for="f in filters"
        :key="f.key"
        type="button"
        class="filter-chip"
        :class="{ 'filter-chip--active': activeFilter === f.key }"
        @click="setFilter(f.key)"
      >
        {{ f.label }}
        <span v-if="f.key === 'unread' && unreadTotal > 0" class="filter-badge">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</span>
      </button>
    </div>

    <div v-if="loading && threads.length === 0" class="conv-list__items">
      <div v-for="i in 6" :key="i" class="thread-skeleton">
        <div class="skel skel-avatar" />
        <div class="skel-body">
          <div class="skel skel-line skel-line--name" />
          <div class="skel skel-line skel-line--preview" />
        </div>
      </div>
    </div>

    <div v-else-if="!loading && filtered.length === 0" class="conv-list__empty">
      <p v-if="search">No conversations match "{{ search }}"</p>
      <p v-else-if="activeFilter === 'unread'">No unread messages</p>
      <p v-else-if="activeFilter === 'mine'">No conversations assigned to you</p>
      <p v-else>No conversations yet.<br>Click <strong>+</strong> to start one.</p>
    </div>

    <ul v-else class="conv-list__items" role="listbox">
      <li
        v-for="t in pageRows"
        :key="t.client_id || ('contact-' + t.agency_contact_id)"
        class="thread-row"
        :class="{
          'thread-row--active': isActive(t),
          'thread-row--unread': t.unread_count > 0
        }"
        role="option"
        :aria-selected="isActive(t)"
        tabindex="0"
        @click="emit('select', t)"
        @keydown.enter="emit('select', t)"
      >
        <div class="thread-avatar">{{ avatarLetter(t) }}</div>
        <div class="thread-body">
          <div class="thread-top">
            <span class="thread-name">{{ t.client_name || t.client_initials || t.contact_name || 'Unknown' }}</span>
            <span class="thread-time">{{ relativeTime(t.last_message_at) }}</span>
          </div>
          <div class="thread-preview">
            <span v-if="t.care_state === 'escalated'" class="care-chip care-chip--escalated">Escalated</span>
            <span v-else-if="t.care_state === 'closed'" class="care-chip care-chip--closed">Closed</span>
            <span class="preview-dir" v-if="t.last_direction === 'OUTBOUND'">You: </span>
            <span class="preview-text">{{ truncate(t.last_body, 48) }}</span>
          </div>
        </div>
        <span v-if="t.unread_count > 0" class="unread-badge">
          {{ t.unread_count > 99 ? '99+' : t.unread_count }}
        </span>
      </li>
    </ul>

    <footer class="conv-list__footer">
      <div class="footer-meta">
        <span v-if="filtered.length">Showing {{ rangeLabel }} of {{ filtered.length }} conversations</span>
        <span v-else>No conversations</span>
        <div v-if="pageCount > 1" class="pager">
          <button type="button" class="page-btn" :disabled="page <= 1" @click="page -= 1">‹</button>
          <button
            v-for="p in pageButtons"
            :key="p"
            type="button"
            class="page-btn"
            :class="{ active: p === page }"
            @click="page = p"
          >{{ p }}</button>
          <button type="button" class="page-btn" :disabled="page >= pageCount" @click="page += 1">›</button>
        </div>
      </div>
      <div class="footer-status">
        <span class="online-dot" />
        <span>SMS Online</span>
        <button type="button" class="footer-gear" title="SMS settings" @click="emit('open-settings')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  activeClientId: { type: [Number, String], default: null },
  activeContactId: { type: [Number, String], default: null },
  activeTab: { type: String, default: 'clients' },
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['select', 'compose', 'open-settings']);

const auth = useAuthStore();
const myId = computed(() => Number(auth.user?.value?.id || auth.user?.id || 0) || 0);

const threads = ref([]);
const loading = ref(false);
const search = ref('');
const activeFilter = ref('all');
const page = ref(1);
const PAGE_SIZE = 8;

const filters = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'mine', label: 'Mine' }
];

const filtered = computed(() => {
  let list = threads.value;
  if (props.activeTab === 'clients') {
    list = list.filter((t) => !!t.client_id);
  } else if (props.activeTab === 'contacts') {
    list = list.filter((t) => !!t.agency_contact_id && !t.client_id);
  }

  if (activeFilter.value === 'unread') list = list.filter((t) => t.unread_count > 0);
  if (activeFilter.value === 'open') {
    list = list.filter((t) => !t.care_state || t.care_state !== 'closed');
  }
  if (activeFilter.value === 'closed') list = list.filter((t) => t.care_state === 'closed');
  if (activeFilter.value === 'mine') {
    list = list.filter((t) => Number(t.care_owner_user_id) === myId.value || Number(t.user_id) === myId.value);
  }
  return list;
});

const unreadTotal = computed(() =>
  threads.value.filter((t) => Number(t.unread_count) > 0).length
);

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const pageRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});
const rangeLabel = computed(() => {
  if (!filtered.value.length) return '0-0';
  const start = (page.value - 1) * PAGE_SIZE + 1;
  const end = Math.min(page.value * PAGE_SIZE, filtered.value.length);
  return `${start}-${end}`;
});
const pageButtons = computed(() => {
  const total = pageCount.value;
  const cur = page.value;
  const pages = new Set([1, total, cur, cur - 1, cur + 1].filter((p) => p >= 1 && p <= total));
  return Array.from(pages).sort((a, b) => a - b).slice(0, 5);
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
    if (page.value > pageCount.value) page.value = 1;
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
  page.value = 1;
}

function isActive(t) {
  if (t.client_id) return Number(props.activeClientId) === Number(t.client_id);
  if (t.agency_contact_id) return Number(props.activeContactId) === Number(t.agency_contact_id);
  return false;
}

function avatarLetter(t) {
  const name = t.client_name || t.client_initials || t.contact_name || '?';
  return name[0].toUpperCase();
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
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

defineExpose({ refresh: load });

onMounted(load);
watch(() => props.agencyId, load);
watch(filtered, () => {
  if (page.value > pageCount.value) page.value = 1;
});
</script>

<style scoped>
.conv-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--sms-surface, var(--surface-card, #fff));
  color: var(--sms-text, var(--text-primary, #0f172a));
}

.conv-list__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  flex-shrink: 0;
}

.search-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--sms-bg, var(--bg-secondary, #f4f6f8));
  border-radius: 10px;
  padding: 0 10px;
  gap: 6px;
  border: 1px solid transparent;
  transition: border-color 0.15s;
}
.search-wrap:focus-within {
  border-color: var(--primary, #2563eb);
}

.search-icon { width: 15px; height: 15px; color: var(--sms-muted, #9ca3af); flex-shrink: 0; }

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 9px 0;
  font-size: 0.875rem;
  outline: none;
  color: inherit;
}
.search-input::placeholder { color: var(--sms-muted, #9ca3af); }

.search-clear {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--sms-muted, #9ca3af);
  padding: 2px 4px;
}

.compose-btn {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 10px;
  background: var(--primary, #2563eb);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--primary, #2563eb) 35%, transparent);
}
.compose-btn svg { width: 18px; height: 18px; }
.compose-btn:hover { filter: brightness(1.05); }

.conv-list__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 14px 10px;
  flex-shrink: 0;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--sms-border, var(--border, #d4d8de));
  background: transparent;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--sms-muted, #6c7785);
}
.filter-chip--active {
  background: color-mix(in srgb, var(--primary, #2563eb) 16%, transparent);
  border-color: var(--primary, #2563eb);
  color: var(--primary, #2563eb);
}
.filter-badge {
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.conv-list__items {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}

.thread-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--sms-border, rgba(0,0,0,0.04));
  transition: background 0.1s;
  outline: none;
}
.thread-row:hover {
  background: color-mix(in srgb, var(--primary, #2563eb) 6%, transparent);
}
.thread-row--active {
  background: color-mix(in srgb, var(--primary, #2563eb) 12%, transparent);
}
.thread-row--unread .thread-name { font-weight: 800; }

.thread-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--primary, #2563eb) 18%, transparent);
  color: var(--primary, #2563eb);
}

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
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.thread-time {
  font-size: 0.72rem;
  color: var(--sms-muted, #6c7785);
  white-space: nowrap;
  flex-shrink: 0;
}

.thread-preview {
  font-size: 0.8rem;
  color: var(--sms-muted, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.care-chip {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
}
.care-chip--escalated {
  background: color-mix(in srgb, var(--warning, #d97706) 18%, transparent);
  color: var(--warning, #d97706);
}
.care-chip--closed {
  background: var(--sms-surface-2, #e2e8f0);
  color: var(--sms-muted, #64748b);
}

.unread-badge {
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  flex-shrink: 0;
}

.thread-skeleton {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px;
  border-bottom: 1px solid var(--sms-border, #f0f2f4);
}
.skel {
  background: linear-gradient(90deg, var(--sms-surface-2, #f0f2f4) 25%, var(--sms-border, #e8eaec) 50%, var(--sms-surface-2, #f0f2f4) 75%);
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
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.conv-list__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
  color: var(--sms-muted, #6c7785);
  font-size: 0.875rem;
}

.conv-list__footer {
  flex-shrink: 0;
  border-top: 1px solid var(--sms-border, var(--border, #e2e8f0));
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--sms-surface, #fff);
}

.footer-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.72rem;
  color: var(--sms-muted, #64748b);
}

.pager { display: flex; gap: 4px; align-items: center; }
.page-btn {
  min-width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--sms-border, #e2e8f0);
  background: transparent;
  color: var(--sms-muted, #64748b);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.page-btn.active {
  background: var(--primary, #2563eb);
  border-color: var(--primary, #2563eb);
  color: #fff;
}
.page-btn:disabled { opacity: 0.4; cursor: default; }

.footer-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--sms-muted, #64748b);
}
.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success, #22c55e);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success, #22c55e) 25%, transparent);
}
.footer-gear {
  margin-left: auto;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--sms-muted, #64748b);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}
.footer-gear svg { width: 16px; height: 16px; }
.footer-gear:hover { color: var(--primary, #2563eb); background: color-mix(in srgb, var(--primary, #2563eb) 10%, transparent); }
</style>
