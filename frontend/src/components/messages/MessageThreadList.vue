<script setup>
import { computed, ref } from 'vue';
import UserAvatar from '@/components/common/UserAvatar.vue';

const props = defineProps({
  threads: { type: Array, required: true },
  activeThreadId: { type: [Number, String], default: null },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['select', 'delete']);

const search = ref('');

function threadLabel(t) {
  if (t.thread_type === 'team') return t.thread_label || 'Team thread';
  if (t.thread_type === 'club') return t.thread_label || 'Club — Everyone';
  if (t.thread_type === 'group') {
    const others = t.participants || [];
    const names = others.map((p) => `${p.first_name || ''} ${p.last_name || ''}`.trim()).filter(Boolean);
    return names.length ? names.join(', ') : 'Group';
  }
  const o = t.other_participant;
  return o ? `${o.first_name || ''} ${o.last_name || ''}`.trim() || o.email || 'Direct message' : 'Direct message';
}

function threadKindBadge(t) {
  if (t.thread_type === 'team') return { text: 'Team', cls: 'badge--team' };
  if (t.thread_type === 'club') return { text: 'Club', cls: 'badge--club' };
  if (t.thread_type === 'group') return { text: 'Group', cls: 'badge--group' };
  return null;
}

const sortedThreads = computed(() => {
  // Team threads first, then club thread, then DMs/groups by recency.
  const order = (t) => {
    const tp = t.thread_type;
    if (tp === 'team') return 0;
    if (tp === 'club') return 1;
    return 2;
  };
  const arr = [...(props.threads || [])];
  arr.sort((a, b) => {
    const ord = order(a) - order(b);
    if (ord !== 0) return ord;
    const at = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : new Date(a.updated_at || 0).getTime();
    const bt = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : new Date(b.updated_at || 0).getTime();
    return bt - at;
  });
  return arr;
});

const filteredThreads = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return sortedThreads.value;
  return sortedThreads.value.filter((t) => threadLabel(t).toLowerCase().includes(q));
});

function previewSnippet(t) {
  const m = t.last_message?.body || '';
  if (!m) return 'No messages yet';
  return m.length > 80 ? `${m.slice(0, 77)}…` : m;
}

function relativeTime(t) {
  const d = t.last_message?.created_at || t.updated_at;
  if (!d) return '';
  const date = new Date(d);
  if (!Number.isFinite(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d2 = Math.floor(hr / 24);
  if (d2 < 7) return `${d2}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
</script>

<template>
  <div class="thread-list">
    <div class="thread-list-header">
      <input
        type="search"
        v-model="search"
        placeholder="Search messages…"
        class="thread-search"
      />
    </div>
    <div v-if="loading" class="muted thread-list-empty">Loading…</div>
    <div v-else-if="!filteredThreads.length" class="muted thread-list-empty">
      <strong>Your inbox is empty.</strong>
      <div>Start a new message or wait for your team thread.</div>
    </div>
    <ul v-else class="thread-list-items">
      <li
        v-for="t in filteredThreads"
        :key="t.thread_id"
        class="thread-list-item"
        :class="{ 'thread-list-item--active': Number(t.thread_id) === Number(activeThreadId) }"
        @click="emit('select', t)"
      >
        <div class="thread-avatar">
          <UserAvatar
            v-if="t.thread_type === 'direct' && t.other_participant"
            :photo-path="t.other_participant.profile_photo_path"
            :first-name="t.other_participant.first_name"
            :last-name="t.other_participant.last_name"
            size="md"
          />
          <div v-else class="avatar-placeholder">
            <span v-if="t.thread_type === 'team'">⚡</span>
            <span v-else-if="t.thread_type === 'club'">🏠</span>
            <span v-else>💬</span>
          </div>
        </div>
        <div class="thread-meta">
          <div class="thread-row-top">
            <div class="thread-name">{{ threadLabel(t) }}</div>
            <div class="thread-time">{{ relativeTime(t) }}</div>
          </div>
          <div class="thread-row-bottom">
            <span class="thread-snippet">{{ previewSnippet(t) }}</span>
            <span v-if="threadKindBadge(t)" class="thread-badge" :class="threadKindBadge(t).cls">{{ threadKindBadge(t).text }}</span>
            <span v-if="t.unread_count > 0" class="thread-unread">{{ t.unread_count }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.thread-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-right: 1px solid #e5e7eb;
}
.thread-list-header { padding: 10px; border-bottom: 1px solid #f1f5f9; }
.thread-search {
  width: 100%; padding: 8px 12px;
  border: 1px solid #d1d5db; border-radius: 999px;
  font-size: 14px; outline: none;
}
.thread-search:focus { border-color: #2563eb; }
.thread-list-empty { padding: 20px; color: #6b7280; text-align: center; }
.thread-list-items { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1 1 auto; }
.thread-list-item {
  display: flex; gap: 10px; padding: 10px 12px; cursor: pointer; align-items: center;
  border-bottom: 1px solid #f1f5f9;
}
.thread-list-item:hover { background: #f9fafb; }
.thread-list-item--active { background: #dbeafe; }
.thread-avatar { flex: 0 0 40px; }
.avatar-placeholder {
  width: 40px; height: 40px; border-radius: 999px;
  background: #e0e7ff; color: #1e3a8a;
  display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.thread-meta { flex: 1 1 auto; min-width: 0; }
.thread-row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.thread-name { font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.thread-time { font-size: 12px; color: #6b7280; flex: 0 0 auto; }
.thread-row-bottom { display: flex; gap: 6px; align-items: center; }
.thread-snippet { font-size: 13px; color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; min-width: 0; }
.thread-badge {
  flex: 0 0 auto;
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em;
}
.badge--team { background: #fef3c7; color: #92400e; }
.badge--club { background: #ede9fe; color: #5b21b6; }
.badge--group { background: #dcfce7; color: #166534; }
.thread-unread {
  background: #2563eb; color: #fff; font-weight: 700; font-size: 11px;
  border-radius: 999px; padding: 2px 7px; flex: 0 0 auto;
}
.muted { color: #6b7280; }
</style>
