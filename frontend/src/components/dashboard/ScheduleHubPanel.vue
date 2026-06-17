<template>
  <div class="sched-hub">
    <header class="sched-hub__header">
      <div class="sched-hub__header-left">
        <div class="sched-hub__title-row">
          <span class="sched-hub__title-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <div>
            <h2 class="sched-hub__title">My Schedule</h2>
            <p class="sched-hub__active-title">{{ activeTitle }}</p>
          </div>
        </div>
        <p
          class="sched-hub__context"
          :class="{ 'sched-hub__context--other': contextIsOther }"
        >
          {{ contextLine }}
        </p>
      </div>
      <div v-if="$slots['header-actions']" class="sched-hub__header-actions">
        <slot name="header-actions" />
      </div>
    </header>

    <div v-if="views.length" class="sched-hub__stats">
      <button
        v-for="view in views"
        :key="view.id"
        type="button"
        class="sched-hub__stat"
        :class="{ 'sched-hub__stat--active': isViewActive(view) }"
        :style="isViewActive(view) ? getScheduleViewThemeStyle(view.id) : undefined"
        :aria-current="isViewActive(view) ? 'true' : undefined"
        @click="$emit('select-view', view.id)"
      >
        <span v-if="isViewActive(view)" class="sched-hub__stat-badge">Viewing</span>
        <div class="sched-hub__stat-icon" :style="{ background: view.theme.iconBg, color: view.theme.icon }">
          <span v-html="viewIcon(view.icon)" />
        </div>
        <div class="sched-hub__stat-text">
          <div class="sched-hub__stat-value">
            {{ view.statValue != null ? view.statValue : view.navLabel }}
          </div>
          <div class="sched-hub__stat-hint">{{ view.statHint }}</div>
        </div>
      </button>
    </div>

    <div v-if="showInfoBanner" class="sched-hub__banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <p>
        The highlighted card is your current view. Click another card to switch — no second menu needed.
      </p>
      <button type="button" class="sched-hub__banner-close" aria-label="Dismiss" @click="showInfoBanner = false">×</button>
    </div>

    <slot name="skill-builders" />

    <div ref="stageRef" class="sched-hub__stage">
      <slot name="toolbar" />
      <div class="sched-hub__content">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { getScheduleViewThemeStyle } from '../../config/scheduleDisplayViews';

const stageRef = ref(null);
defineExpose({
  getStageElement: () => stageRef.value,
});

const props = defineProps({
  activeView: { type: String, default: 'self' },
  activeTitle: { type: String, default: 'My schedule' },
  contextLine: { type: String, default: '' },
  contextIsOther: { type: Boolean, default: false },
  views: { type: Array, default: () => [] },
  skillBuildersActive: { type: Boolean, default: false },
});

defineEmits(['select-view']);

const showInfoBanner = ref(true);

const isViewActive = (view) => {
  if (view.isUtility) {
    return view.id === 'skill_builders' && props.skillBuildersActive;
  }
  return view.id === props.activeView;
};

const ICONS = {
  calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  users: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  briefcase: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
  spark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L6 21l2.3-7-6-4.6h7.6z"/></svg>',
  list: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
};

const viewIcon = (name) => ICONS[name] || ICONS.calendar;
</script>

<style scoped>
.sched-hub {
  --hub-green: #166534;
  --hub-border: #e5e7eb;
  --hub-muted: #6b7280;
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
  color: #111827;
}

.sched-hub__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.sched-hub__title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sched-hub__title-icon {
  display: flex;
  color: var(--hub-green);
  margin-top: 4px;
}

.sched-hub__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sched-hub__active-title {
  margin: 4px 0 0;
  font-size: 15px;
  font-weight: 700;
  color: #374151;
}

.sched-hub__context {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--hub-muted);
  max-width: 72ch;
}

.sched-hub__context--other {
  font-weight: 600;
  color: #92400e;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  max-width: none;
}

.sched-hub__header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.sched-hub__stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.sched-hub__stat {
  position: relative;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  width: 100%;
  padding: 18px 20px;
  text-align: left;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s, transform 0.12s;
  font: inherit;
  color: inherit;
  opacity: 0.88;
}

.sched-hub__stat:hover {
  opacity: 1;
  border-color: #9ca3af;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.sched-hub__stat:focus-visible {
  outline: 2px solid #166534;
  outline-offset: 2px;
  opacity: 1;
}

.sched-hub__stat--active {
  opacity: 1;
  border: 2px solid var(--cat-accent, #166534);
  border-left-width: 4px;
  background: color-mix(in srgb, var(--cat-icon-bg, #ecfdf5) 55%, #fff);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--cat-accent, #166534) 18%, transparent);
  transform: none;
}

.sched-hub__stat--active:hover {
  border-color: var(--cat-accent, #166534);
  background: color-mix(in srgb, var(--cat-icon-bg, #ecfdf5) 62%, #fff);
}

.sched-hub__stat-badge {
  position: absolute;
  top: 10px;
  right: 12px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--cat-accent, #166534);
  color: #fff;
}

.sched-hub__stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sched-hub__stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.sched-hub__stat-hint {
  font-size: 12px;
  color: var(--hub-muted);
  margin-top: 2px;
}

.sched-hub__banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #166534;
  font-size: 14px;
  line-height: 1.5;
}

.sched-hub__banner p {
  margin: 0;
  flex: 1;
}

.sched-hub__banner-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
}

.sched-hub__stage {
  background: #fff;
  border: 1px solid var(--hub-border);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  padding: 14px 16px 16px;
  min-width: 0;
}

.sched-hub__content {
  min-width: 0;
}
</style>
