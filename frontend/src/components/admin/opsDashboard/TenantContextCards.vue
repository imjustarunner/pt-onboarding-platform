<template>
  <section
    v-if="showAny"
    class="tenant-context"
    aria-label="Schools, events, and programs"
  >
    <article v-if="showSchoolUpdates" class="panel">
      <div class="panel-header">
        <h2>School Updates &amp; Changes</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.schoolPortals)">
          View All
        </button>
      </div>
      <p class="panel-blurb">Quick access to school portals with recent updates and changes.</p>
      <div v-if="!schools.length" class="empty">
        <span>No school portals loaded</span>
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.schoolPortalsHub)">
          Open School Portals
        </button>
      </div>
      <ul v-else class="item-list">
        <li v-for="s in schools.slice(0, 5)" :key="s.id" class="item-row">
          <div class="avatar">{{ initials(s.name) }}</div>
          <div class="item-meta">
            <span class="item-name">{{ s.name }}</span>
            <span v-if="s.subtitle" class="item-sub">{{ s.subtitle }}</span>
          </div>
          <button
            type="button"
            class="mini-btn"
            @click="$emit('navigate', schoolPortalTo(s))"
          >
            School Portal
          </button>
        </li>
      </ul>
      <div v-if="schoolStats.announcements > 0 || schoolStats.schoolCount > 0" class="stat-footer">
        <span v-if="schoolStats.schoolCount">{{ schoolStats.schoolCount }} schools</span>
        <span v-if="schoolStats.announcements">{{ schoolStats.announcements }} announcements</span>
      </div>
    </article>

    <article v-if="showEvents" class="panel">
      <div class="panel-header">
        <h2>Events</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.events)">
          View All
        </button>
      </div>
      <div v-if="!events.length" class="empty">
        <span>No upcoming company events</span>
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.events)">
          Manage Events
        </button>
      </div>
      <ul v-else class="item-list">
        <li v-for="e in events.slice(0, 5)" :key="e.id" class="item-row">
          <div class="avatar icon">📅</div>
          <div class="item-meta">
            <span class="item-name">{{ e.title }}</span>
            <span v-if="e.when" class="item-sub">{{ e.when }}</span>
          </div>
          <button type="button" class="mini-btn" @click="$emit('navigate', paths.events)">
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
  schools: { type: Array, default: () => [] },
  schoolStats: { type: Object, default: () => ({}) },
  events: { type: Array, default: () => [] },
  programStats: { type: Object, default: () => ({}) },
  paths: { type: Object, default: () => ({}) }
});

defineEmits(['navigate']);

const showAny = computed(
  () => props.showSchoolUpdates || props.showEvents || props.showPrograms
);

const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
};

const schoolPortalTo = (school) => {
  if (school?.portalPath) return school.portalPath;
  if (school?.slug && props.paths?.schoolPortalBase) {
    return `${props.paths.schoolPortalBase}/${school.slug}`;
  }
  return props.paths?.schoolPortals || props.paths?.schoolPortalsHub || '';
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
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 16%, #fff);
  color: var(--ops-primary, #1f6b4a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
}
.avatar.icon {
  font-size: 14px;
}
.item-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.item-name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-sub {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.stat-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}
</style>
