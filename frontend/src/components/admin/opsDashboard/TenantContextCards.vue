<template>
  <section
    v-if="showAny"
    class="tenant-context"
    :class="{ 'tenant-context--contents': useContents }"
    aria-label="School updates and events"
  >
    <article
      v-if="showSchoolUpdates"
      class="panel panel--feed"
      :style="orderStyles.schoolUpdates || undefined"
    >
      <div class="panel-header">
        <h2>School Updates &amp; Changes</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.caseloadHub || paths.schoolPortalsHub)">
          View All
        </button>
      </div>
      <p class="panel-blurb">Waitlists needing therapists, caseload gaps, full clinician spots, and school staff changes.</p>
      <div v-if="!schoolUpdates.length" class="empty">
        <span>No school updates right now</span>
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.caseloadHub || paths.schoolPortalsHub)">
          Open Caseload Hub
        </button>
      </div>
      <template v-else>
        <div class="feed-body">
          <ul class="item-list feed-list">
            <li v-for="u in visibleSchoolUpdates" :key="u.id" class="item-row feed-row">
              <div class="avatar" :class="u.kind">{{ updateGlyph(u.kind) }}</div>
              <div class="item-meta">
                <span class="item-name">{{ u.title }}</span>
                <span v-if="u.body" class="item-sub">{{ u.body }}</span>
                <span v-if="u.meta" class="item-meta-line">{{ u.meta }}</span>
              </div>
              <button
                type="button"
                class="mini-btn"
                @click="$emit('navigate', u.to || paths.caseloadHub)"
              >
                {{ u.cta || 'Open' }}
              </button>
            </li>
          </ul>
        </div>
        <div v-if="schoolUpdates.length > schoolPreviewLimit" class="more-row">
          <button
            v-if="!schoolExpanded"
            type="button"
            class="link-btn"
            @click="schoolExpanded = true"
          >
            Show more ({{ schoolUpdates.length - schoolPreviewLimit }} more)
          </button>
          <button
            v-else
            type="button"
            class="link-btn"
            @click="schoolExpanded = false"
          >
            Show less
          </button>
          <button
            type="button"
            class="link-btn"
            @click="$emit('navigate', paths.caseloadHub || paths.schoolPortalsHub)"
          >
            View all in Caseload Hub →
          </button>
        </div>
      </template>
    </article>

    <article
      v-if="showEvents"
      class="panel panel--feed"
      :style="orderStyles.events || undefined"
    >
      <div class="panel-header">
        <h2>Events</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.events)">
          View All
        </button>
      </div>
      <p class="panel-blurb">Program, school, and company events — soonest first (including today).</p>
      <div v-if="!events.length" class="empty">
        <span>No upcoming events</span>
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.events)">
          Browse all events
        </button>
      </div>
      <template v-else>
        <div class="feed-body">
          <ul class="item-list feed-list">
            <li v-for="e in visibleEvents" :key="e.id" class="item-row feed-row">
              <div class="avatar" :class="e.kind || 'event'">{{ eventGlyph(e.kind) }}</div>
              <div class="item-meta">
                <span class="item-name">{{ e.title }}</span>
                <span v-if="e.whenLabel" class="item-when">{{ e.whenLabel }}</span>
                <span v-if="e.subtitle" class="item-sub">{{ e.subtitle }}</span>
                <span v-if="e.meta" class="item-meta-line">{{ e.meta }}</span>
              </div>
              <button type="button" class="mini-btn" @click="$emit('navigate', e.to || paths.events)">
                {{ e.cta || 'Event Portal' }}
              </button>
            </li>
          </ul>
        </div>
        <div v-if="events.length > eventPreviewLimit" class="more-row">
          <button
            v-if="!eventsExpanded"
            type="button"
            class="link-btn"
            @click="eventsExpanded = true"
          >
            Show more ({{ events.length - eventPreviewLimit }} more)
          </button>
          <button
            v-else
            type="button"
            class="link-btn"
            @click="eventsExpanded = false"
          >
            Show less
          </button>
          <button type="button" class="link-btn" @click="$emit('navigate', paths.events)">
            View all events →
          </button>
        </div>
        <div v-else class="more-row">
          <button type="button" class="link-btn" @click="$emit('navigate', paths.events)">
            View all events →
          </button>
        </div>
      </template>
    </article>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  showSchoolUpdates: { type: Boolean, default: false },
  showEvents: { type: Boolean, default: true },
  schoolUpdates: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  paths: { type: Object, default: () => ({}) },
  orderStyles: { type: Object, default: () => ({}) },
  useContents: { type: Boolean, default: false }
});

defineEmits(['navigate']);

const schoolPreviewLimit = 6;
const eventPreviewLimit = 6;
const schoolExpanded = ref(false);
const eventsExpanded = ref(false);

const showAny = computed(() => props.showSchoolUpdates || props.showEvents);

const visibleSchoolUpdates = computed(() =>
  schoolExpanded.value
    ? props.schoolUpdates
    : props.schoolUpdates.slice(0, schoolPreviewLimit)
);

const visibleEvents = computed(() =>
  eventsExpanded.value
    ? props.events
    : props.events.slice(0, eventPreviewLimit)
);

const updateGlyph = (kind) => {
  if (kind === 'waitlist') return '⏳';
  if (kind === 'caseload') return '👥';
  if (kind === 'staff') return '🧑‍💼';
  if (kind === 'capacity' || kind === 'full') return '🟢';
  if (kind === 'slots') return '📆';
  if (kind === 'event') return '📅';
  return '📣';
};

const eventGlyph = (kind) => {
  if (kind === 'program') return '🧩';
  if (kind === 'school') return '🏫';
  return '📅';
};
</script>

<style scoped>
.tenant-context {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 0 0 14px;
}
.tenant-context--contents {
  display: contents;
}
@media (max-width: 900px) {
  .tenant-context:not(.tenant-context--contents) { grid-template-columns: 1fr; }
}
.tenant-context:not(.tenant-context--contents):has(> .panel:only-child) {
  grid-template-columns: 1fr;
}
.panel {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
  display: flex;
  flex-direction: column;
}
.panel--feed {
  height: 300px;
  min-height: 300px;
  max-height: 300px;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
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
  flex-shrink: 0;
}
.feed-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -4px;
  padding: 0 4px;
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
}
.item-row {
  display: flex;
  align-items: flex-start;
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
  font-size: 14px;
  font-weight: 800;
  flex-shrink: 0;
}
.avatar.waitlist {
  background: #fef2f2;
  color: #b91c1c;
}
.avatar.capacity, .avatar.full {
  background: #ecfdf5;
  color: #047857;
}
.avatar.caseload {
  background: #eff6ff;
  color: #1d4ed8;
}
.avatar.staff {
  background: #fffbeb;
  color: #b45309;
}
.avatar.program {
  background: #f5f3ff;
  color: #6d28d9;
}
.avatar.school {
  background: #ecfeff;
  color: #0e7490;
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
.item-when {
  font-size: 12px;
  font-weight: 800;
  color: var(--ops-primary, #1f6b4a);
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
.more-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
}
</style>
