<template>
  <section class="ov-card" data-tour="dash-overview-events">
    <header class="ov-card-head">
      <h3 class="ov-card-title">Today's Events</h3>
      <button type="button" class="ov-link" @click="$emit('view-all')">View All</button>
    </header>

    <div v-if="featured" class="ov-featured" :class="{ 'is-live': featured.isLive }">
      <div class="ov-featured-top">
        <span v-if="featured.isLive" class="ov-live">Live Now</span>
        <span class="ov-featured-title">{{ featured.title }}</span>
      </div>
      <div class="ov-featured-meta">{{ featured.subtitle }}</div>
      <div v-if="whereText(featured)" class="ov-featured-where">{{ whereText(featured) }}</div>
      <button
        v-if="featured.joinUrl"
        type="button"
        class="ov-join"
        @click="$emit('join', featured)"
      >
        Join Meeting
      </button>
      <button
        v-else-if="featured.kind === 'supervision'"
        type="button"
        class="ov-join"
        @click="$emit('navigate', supervisionTab)"
      >
        Open Supervision
      </button>
    </div>
    <div v-else class="ov-empty">No events coming up soon.</div>

    <ul v-if="upcomingList.length" class="ov-event-list">
      <li v-for="ev in upcomingList" :key="ev.id" class="ov-event-row">
        <div class="ov-date-tile">
          <span class="ov-date-day">{{ dayNum(ev.startMs) }}</span>
          <span class="ov-date-mon">{{ monthShort(ev.startMs) }}</span>
        </div>
        <div class="ov-event-body">
          <div class="ov-event-title">{{ ev.title }}</div>
          <div class="ov-event-sub">{{ ev.subtitle }}</div>
          <div v-if="whereText(ev)" class="ov-event-where">{{ whereText(ev) }}</div>
        </div>
      </li>
    </ul>

    <button type="button" class="ov-link ov-link--block" @click="$emit('view-all')">View All Events</button>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  featured: { type: Object, default: null },
  events: { type: Array, default: () => [] },
  isSupervisor: { type: Boolean, default: false }
});

defineEmits(['navigate', 'view-all', 'join']);

const supervisionTab = computed(() => (props.isSupervisor ? 'supervision' : 'my_supervision'));

const upcomingList = computed(() => {
  const fid = props.featured?.id;
  return (props.events || []).filter((e) => e.id !== fid).slice(0, 4);
});

const dayNum = (ms) => {
  if (ms == null) return '—';
  return String(new Date(ms).getDate());
};
const monthShort = (ms) => {
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString([], { month: 'short' });
};

/** Prefer school affiliation, then explicit location / whereLine. */
function whereText(ev) {
  if (!ev) return '';
  if (ev.whereLine) return ev.whereLine;
  const school = String(ev.schoolName || '').trim();
  const loc = String(ev.location || '').trim();
  if (school && loc && school.toLowerCase() !== loc.toLowerCase()) return `${school} · ${loc}`;
  if (school) return school;
  if (loc) return loc;
  return '';
}
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
.ov-link--block {
  display: block;
  width: 100%;
  text-align: center;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f3f4f6;
}
.ov-featured {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.ov-featured.is-live {
  background: #ede9fe;
  border-color: #c4b5fd;
}
.ov-live {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fff;
  background: #7c3aed;
  padding: 2px 7px;
  border-radius: 999px;
  margin-bottom: 6px;
}
.ov-featured-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.ov-featured-meta {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}
.ov-featured-where {
  font-size: 12px;
  color: #4b5563;
  margin-top: 4px;
  font-weight: 600;
}
.ov-join {
  margin-top: 10px;
  width: 100%;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.ov-join:hover { background: #6d28d9; }
.ov-empty { font-size: 13px; color: #6b7280; padding: 8px 0 12px; }
.ov-event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ov-event-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.ov-date-tile {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: #f3f4f6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ov-date-day { font-size: 14px; font-weight: 700; color: #111827; line-height: 1; }
.ov-date-mon { font-size: 10px; color: #6b7280; text-transform: uppercase; }
.ov-event-title { font-size: 13px; font-weight: 600; color: #111827; }
.ov-event-sub { font-size: 12px; color: #6b7280; }
.ov-event-where {
  font-size: 11px;
  color: #4b5563;
  font-weight: 600;
  margin-top: 2px;
}

[data-theme="dark"] .ov-card {
  background: #1e2126;
  border-color: #3a3f48;
}
[data-theme="dark"] .ov-card-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-featured {
  background: #1e1a2e;
  border-color: #3b1f6e;
}
[data-theme="dark"] .ov-featured.is-live {
  background: #251a3e;
  border-color: #5b21b6;
}
[data-theme="dark"] .ov-featured-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-featured-meta { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-featured-where { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-event-where { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-link--block { border-top-color: #3a3f48; }
[data-theme="dark"] .ov-date-tile { background: #2a2f38; }
[data-theme="dark"] .ov-date-day { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-date-mon { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-event-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-event-sub { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-empty { color: var(--text-secondary, #94a3b8); }
</style>
