<template>
  <section
    v-if="showAny"
    class="tenant-context"
    aria-label="Schools, events, and programs"
  >
    <article v-if="showSchoolUpdates" class="panel">
      <div class="panel-header">
        <h2>School Updates &amp; Changes</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.schoolPortalsHub || paths.schoolPortals)">
          View All
        </button>
      </div>
      <p class="panel-blurb">Running list of school portal announcements and changes as they occur.</p>
      <div v-if="!schoolUpdates.length" class="empty">
        <span>No school updates yet</span>
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.schoolPortalsHub)">
          Open School Portals
        </button>
      </div>
      <ul v-else class="item-list feed-list">
        <li v-for="u in schoolUpdates.slice(0, 6)" :key="u.id" class="item-row feed-row">
          <div class="avatar" :class="u.kind">{{ updateGlyph(u.kind) }}</div>
          <div class="item-meta">
            <span class="item-name">{{ u.title }}</span>
            <span v-if="u.body" class="item-sub">{{ u.body }}</span>
            <span v-if="u.meta" class="item-meta-line">{{ u.meta }}</span>
          </div>
          <button
            type="button"
            class="mini-btn"
            @click="$emit('navigate', u.to || paths.schoolPortalsHub)"
          >
            Open
          </button>
        </li>
      </ul>
    </article>

    <article v-if="showEvents" class="panel">
      <div class="panel-header">
        <h2>Events</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.events)">
          View All
        </button>
      </div>
      <div v-if="!events.length" class="empty">
        <span>No upcoming events</span>
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.events)">
          Manage Events
        </button>
      </div>
      <ul v-else class="item-list feed-list">
        <li v-for="e in events.slice(0, 6)" :key="e.id" class="item-row feed-row">
          <div class="avatar icon">📅</div>
          <div class="item-meta">
            <span class="item-name">{{ e.title }}</span>
            <span v-if="e.subtitle" class="item-sub">{{ e.subtitle }}</span>
            <span v-if="e.meta" class="item-meta-line">{{ e.meta }}</span>
          </div>
          <button type="button" class="mini-btn" @click="$emit('navigate', e.to || paths.events)">
            Open
          </button>
        </li>
      </ul>
    </article>

    <article v-if="showPrograms" class="panel">
      <div class="panel-header">
        <h2>Programs</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.programs)">
          View All
        </button>
      </div>
      <div class="stat-rows">
        <div class="stat-row">
          <span>Affiliated Programs</span>
          <strong>{{ programStats.programs || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Learning Orgs</span>
          <strong>{{ programStats.learning || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Training Modules</span>
          <strong>{{ programStats.modules || 0 }}</strong>
        </div>
      </div>
      <div class="cta-row">
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.programs)">
          Program Overview
        </button>
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.modules)">
          Modules
        </button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  showSchoolUpdates: { type: Boolean, default: false },
  showEvents: { type: Boolean, default: true },
  showPrograms: { type: Boolean, default: false },
  schoolUpdates: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  programStats: { type: Object, default: () => ({}) },
  paths: { type: Object, default: () => ({}) }
});

defineEmits(['navigate']);

const showAny = computed(
  () => props.showSchoolUpdates || props.showEvents || props.showPrograms
);

const updateGlyph = (kind) => {
  if (kind === 'event') return '📅';
  if (kind === 'splash') return '📢';
  return '📣';
};
</script>

<style scoped>
.tenant-context {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 0 0 16px;
}
@media (max-width: 1100px) {
  .tenant-context { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 700px) {
  .tenant-context { grid-template-columns: 1fr; }
}
.panel {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
  min-height: 180px;
  display: flex;
  flex-direction: column;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.panel-header h2 {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 800;
  color: var(--ops-primary, #1f6b4a);
}
.panel-blurb {
  margin: 0 0 10px;
  font-size: 12px;
  color: #64748b;
}
.link-btn {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.link-btn:hover { text-decoration: underline; }
.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: #94a3b8;
  padding: 8px 0;
  flex: 1;
}
.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}
.item-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.feed-row { align-items: flex-start; }
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 16%, #fff);
  color: var(--ops-primary, #1f6b4a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
}
.avatar.icon, .avatar.event, .avatar.splash, .avatar.announcement {
  font-size: 14px;
}
.item-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.item-name {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-sub {
  font-size: 12px;
  color: #475569;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.item-meta-line {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
}
.mini-btn {
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 30%, #e2e8f0);
  background: #fff;
  color: var(--ops-primary, #1f6b4a);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.mini-btn:hover {
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 8%, #fff);
}
.stat-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #475569;
}
.stat-row strong {
  font-size: 15px;
  color: #0f172a;
}
.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
