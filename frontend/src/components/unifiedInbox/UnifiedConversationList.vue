<script setup>
defineProps({
  conversations: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  selectedId: { type: [Number, String, null], default: null },
  filter: { type: String, default: 'all' }
});

const emit = defineEmits(['update:filter', 'select']);

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'needs_reply', label: 'Needs Reply' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'snoozed', label: 'Snoozed' }
];

function channelIcon(ch) {
  const m = {
    email: '✉',
    secure: '💬',
    sms: '📱',
    call: '📞',
    voicemail: '📞',
    internal: '👥',
    mention: '@'
  };
  return m[ch] || '✉';
}

function statusLabel(s) {
  const m = {
    new: 'New',
    needs_reply: 'Needs Reply',
    waiting_on_them: 'Waiting on Them',
    follow_up: 'Follow Up',
    resolved: 'Resolved'
  };
  return m[s] || s;
}

function statusClass(s) {
  if (s === 'needs_reply' || s === 'new') return 'needs';
  if (s === 'waiting_on_them') return 'waiting';
  if (s === 'follow_up') return 'follow';
  return '';
}

function formatWhen(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function initials(row) {
  const name = row.primary_participant_name || row.subject || '?';
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
</script>

<template>
  <section class="uc-list">
    <div class="uc-list-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        :class="{ on: filter === t.id }"
        @click="emit('update:filter', t.id)"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="uc-list-empty">Loading…</div>
    <div v-else-if="!conversations.length" class="uc-list-empty">
      No conversations in this view.
    </div>
    <ul v-else class="uc-list-items">
      <li
        v-for="row in conversations"
        :key="row.id"
        :class="{ on: selectedId === row.id, unread: row.is_unread }"
        @click="emit('select', row.id)"
      >
        <div class="uc-avatar" aria-hidden="true">{{ initials(row) }}</div>
        <div class="uc-list-main">
          <div class="uc-list-top">
            <span class="uc-list-name">
              <span class="uc-ch" :title="row.channel">{{ channelIcon(row.channel) }}</span>
              {{ row.primary_participant_name || row.inbox_display_name || 'Conversation' }}
            </span>
            <time>{{ formatWhen(row.last_message_at) }}</time>
          </div>
          <div class="uc-list-subject">{{ row.subject || '(no subject)' }}</div>
          <div class="uc-list-preview">{{ row.last_message_preview || '' }}</div>
          <div class="uc-list-tags">
            <span v-if="row.starred" class="uc-star" title="Starred">★</span>
            <span class="uc-pill" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</span>
          </div>
        </div>
        <span v-if="row.is_unread" class="uc-dot" aria-label="Unread" />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.uc-list {
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
}
.uc-list-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.uc-list-tabs button {
  border: none;
  background: transparent;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}
.uc-list-tabs button.on {
  background: #dcfce7;
  color: #14532d;
}
.uc-list-empty {
  padding: 28px 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9rem;
}
.uc-list-items {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}
.uc-list-items li {
  display: grid;
  grid-template-columns: 40px 1fr 10px;
  gap: 10px;
  padding: 12px 12px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  position: relative;
}
.uc-list-items li:hover { background: #f8fafc; }
.uc-list-items li.on { background: #f0fdf4; }
.uc-list-items li.unread .uc-list-name { font-weight: 700; }
.uc-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #dcfce7;
  color: #166534;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
}
.uc-list-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
}
.uc-list-name {
  font-size: 0.88rem;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.uc-ch { font-size: 0.8rem; }
.uc-list-top time { font-size: 0.72rem; color: #94a3b8; white-space: nowrap; }
.uc-list-subject {
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.uc-list-preview {
  font-size: 0.78rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.uc-list-tags { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.uc-star { color: #ca8a04; font-size: 0.85rem; }
.uc-pill {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
}
.uc-pill.needs { background: #dcfce7; color: #166534; }
.uc-pill.waiting { background: #dbeafe; color: #1d4ed8; }
.uc-pill.follow { background: #ffedd5; color: #c2410c; }
.uc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16a34a;
  align-self: center;
}
</style>
