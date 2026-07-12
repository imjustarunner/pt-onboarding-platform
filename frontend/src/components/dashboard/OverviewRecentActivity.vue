<template>
  <section class="ov-card" data-tour="dash-overview-activity">
    <header class="ov-card-head">
      <h3 class="ov-card-title">Recent Activity</h3>
      <button type="button" class="ov-link" @click="$emit('navigate', 'notifications')">View All</button>
    </header>

    <div v-if="!items.length" class="ov-empty">No recent notifications or open items.</div>
    <ul v-else class="ov-list">
      <li
        v-for="item in items"
        :key="item.id"
        class="ov-row"
        role="button"
        tabindex="0"
        @click="onClick(item)"
        @keydown.enter="onClick(item)"
      >
        <span class="ov-icon" :class="`ov-icon--${item.kind}`" aria-hidden="true">{{ iconFor(item.kind) }}</span>
        <div class="ov-body">
          <div class="ov-title" :class="{ unread: item.unread }">{{ item.title }}</div>
          <div v-if="item.subtitle" class="ov-sub">{{ item.subtitle }}</div>
        </div>
        <span v-if="item.at" class="ov-when">{{ formatWhen(item.at) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] }
});

const emit = defineEmits(['navigate']);

const iconFor = (kind) => {
  if (kind === 'tasks') return '✓';
  if (kind === 'tickets') return '🎫';
  if (kind === 'notes_to_sign') return '✍';
  return '🔔';
};

const formatWhen = (at) => {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / 60000))}m`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)}h`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const onClick = (item) => {
  if (item.kind === 'notification') emit('navigate', 'notifications');
  else emit('navigate', 'checklist');
};
</script>

<style scoped>
.ov-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.ov-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.ov-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.ov-link {
  background: none;
  border: none;
  color: #7c3aed;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.ov-link:hover { text-decoration: underline; }
.ov-empty { font-size: 13px; color: #6b7280; padding: 8px 0; }
.ov-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ov-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 4px;
  border-radius: 8px;
  cursor: pointer;
}
.ov-row:hover { background: #f9fafb; }
.ov-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
  background: #f3f4f6;
}
.ov-icon--notification { background: #dbeafe; }
.ov-icon--tasks { background: #dcfce7; }
.ov-icon--tickets { background: #fef3c7; }
.ov-icon--notes_to_sign { background: #f3e8ff; }
.ov-body { flex: 1; min-width: 0; }
.ov-title {
  font-size: 13px;
  color: #374151;
  line-height: 1.3;
}
.ov-title.unread { font-weight: 700; color: #111827; }
.ov-sub { font-size: 11px; color: #9ca3af; margin-top: 1px; }
.ov-when { font-size: 11px; color: #9ca3af; white-space: nowrap; }

[data-theme="dark"] .ov-card {
  background: #1e2126;
  border-color: #3a3f48;
}
[data-theme="dark"] .ov-card-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-empty { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-row:hover { background: #252930; }
[data-theme="dark"] .ov-icon { background: #2a2f38; }
[data-theme="dark"] .ov-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-title.unread { color: #e2e8f0; }
[data-theme="dark"] .ov-sub { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-when { color: #64748b; }
</style>
