<template>
  <section class="ov-card" data-tour="dash-overview-schedule">
    <header class="ov-card-head">
      <div class="ov-card-title-row">
        <span class="ov-card-icon ov-card-icon--purple" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </span>
        <h3 class="ov-card-title">My Schedule</h3>
      </div>
      <button type="button" class="ov-link" @click="$emit('navigate', 'my_schedule')">View Full Schedule</button>
    </header>

    <div class="ov-tabs" role="tablist">
      <button type="button" class="ov-tab ov-tab--active" role="tab" aria-selected="true">Today</button>
      <button type="button" class="ov-tab" role="tab" @click="$emit('navigate', 'my_schedule')">Week</button>
      <button type="button" class="ov-tab" role="tab" @click="$emit('navigate', 'my_schedule')">Month</button>
    </div>

    <div v-if="loading" class="ov-empty">Loading schedule…</div>
    <div v-else-if="!items.length" class="ov-empty">No appointments scheduled for today.</div>
    <ul v-else class="ov-timeline">
      <li v-for="item in items" :key="item.id" class="ov-timeline-row" :class="`is-${item.status}`">
        <div class="ov-timeline-rail" aria-hidden="true">
          <span class="ov-timeline-dot" />
        </div>
        <div class="ov-timeline-time">{{ item.timeLabel }}</div>
        <div class="ov-timeline-body">
          <div class="ov-timeline-title">{{ item.title }}</div>
          <div v-if="item.subtitle" class="ov-timeline-sub">{{ item.subtitle }}</div>
        </div>
        <span class="ov-status" :class="`ov-status--${item.status}`">{{ statusLabel(item.status) }}</span>
      </li>
    </ul>

    <footer class="ov-card-foot">{{ items.length }} appointment{{ items.length === 1 ? '' : 's' }} today</footer>
  </section>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
});
defineEmits(['navigate']);

const statusLabel = (s) => {
  if (s === 'completed') return 'Completed';
  if (s === 'in_progress') return 'In Progress';
  return 'Upcoming';
};
</script>

<style scoped>
.ov-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ov-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.ov-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ov-card-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ov-card-icon--purple { background: #f3e8ff; color: #7e22ce; }
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
.ov-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.ov-tab {
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
}
.ov-tab--active {
  background: #7c3aed;
  color: #fff;
}
.ov-empty {
  font-size: 13px;
  color: #6b7280;
  padding: 18px 0;
  text-align: center;
}
.ov-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
}
.ov-timeline-row {
  display: grid;
  grid-template-columns: 12px 88px 1fr auto;
  gap: 8px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
}
.ov-timeline-row:last-child { border-bottom: none; }
.ov-timeline-row.is-in_progress {
  background: #faf5ff;
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
  border-radius: 8px;
  border-bottom-color: transparent;
}
.ov-timeline-rail {
  display: flex;
  justify-content: center;
  padding-top: 5px;
}
.ov-timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c4b5fd;
  box-shadow: 0 0 0 3px #f3e8ff;
}
.is-completed .ov-timeline-dot { background: #22c55e; box-shadow: 0 0 0 3px #dcfce7; }
.is-in_progress .ov-timeline-dot { background: #7c3aed; box-shadow: 0 0 0 3px #ede9fe; }
.ov-timeline-time {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
  padding-top: 2px;
}
.ov-timeline-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.ov-timeline-sub {
  font-size: 12px;
  color: #6b7280;
  margin-top: 1px;
}
.ov-status {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.ov-status--completed { background: #dcfce7; color: #166534; }
.ov-status--in_progress { background: #ede9fe; color: #6b21a8; }
.ov-status--upcoming { background: #f3f4f6; color: #4b5563; }
.ov-card-foot {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f3f4f6;
  font-size: 12px;
  color: #6b7280;
}
@media (max-width: 560px) {
  .ov-timeline-row {
    grid-template-columns: 12px 1fr auto;
  }
  .ov-timeline-time {
    grid-column: 2;
    grid-row: 1;
  }
  .ov-timeline-body {
    grid-column: 2;
  }
  .ov-status {
    grid-column: 3;
    grid-row: 1 / span 2;
    align-self: center;
  }
}

[data-theme="dark"] .ov-card {
  background: #1e2126;
  border-color: #3a3f48;
}
[data-theme="dark"] .ov-card-icon--purple { background: #2e1a47; color: #c4b5fd; }
[data-theme="dark"] .ov-card-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-tab {
  background: #2a2f38;
  color: var(--text-secondary, #94a3b8);
}
[data-theme="dark"] .ov-tab--active {
  background: #7c3aed;
  color: #fff;
}
[data-theme="dark"] .ov-empty { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-timeline-row { border-bottom-color: #2d3240; }
[data-theme="dark"] .ov-timeline-row.is-in_progress {
  background: #1e1a2e;
  border-bottom-color: transparent;
}
[data-theme="dark"] .ov-timeline-time { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-timeline-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-timeline-sub { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-status--upcoming { background: #2a2f38; color: #94a3b8; }
[data-theme="dark"] .ov-status--completed { background: #14291e; color: #86efac; }
[data-theme="dark"] .ov-status--in_progress { background: #251a3e; color: #c4b5fd; }
[data-theme="dark"] .ov-card-foot {
  border-top-color: #2d3240;
  color: var(--text-secondary, #94a3b8);
}
</style>
