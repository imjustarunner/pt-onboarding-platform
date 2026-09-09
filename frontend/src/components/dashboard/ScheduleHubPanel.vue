<template>
  <div class="sched-hub" :class="{ 'sched-hub--platform': platformTheme, 'sched-hub--meta': metaOnlyHeader }">
    <header class="sched-hub__header">
      <div class="sched-hub__header-left">
        <p class="sched-hub__meta-line">Your calendar · your account</p>
        <p
          v-if="metaOnlyHeader && contextIsOther && contextLine"
          class="sched-hub__context sched-hub__context--other"
        >
          {{ contextLine }}
        </p>
        <div v-if="!metaOnlyHeader" class="sched-hub__title-row">
          <div class="sched-hub__title-switch" ref="titleSwitchRef">
            <button
              type="button"
              class="sched-hub__title-btn"
              :class="{ 'sched-hub__title-btn--menu': switchableViews.length > 1 }"
              :aria-expanded="switchableViews.length > 1 ? viewMenuOpen : undefined"
              :aria-haspopup="switchableViews.length > 1 ? 'listbox' : undefined"
              data-testid="schedule-hub-title-switch"
              @click="onTitleClick"
            >
              <span class="sched-hub__title-icon" aria-hidden="true" v-html="activeViewIcon" />
              <span class="sched-hub__title-text">{{ displayTitle }}</span>
              <span v-if="switchableViews.length > 1" class="sched-hub__viewing-badge">Viewing</span>
              <span
                v-if="switchableViews.length > 1"
                class="sched-hub__title-chev"
                aria-hidden="true"
              >▾</span>
            </button>
            <div
              v-if="viewMenuOpen && switchableViews.length > 1"
              class="sched-hub__view-menu"
              role="listbox"
              aria-label="Schedule views"
            >
              <button
                v-for="view in switchableViews"
                :key="view.id"
                type="button"
                class="sched-hub__view-menu-item"
                :class="{ on: isViewActive(view) }"
                role="option"
                :aria-selected="isViewActive(view)"
                @click="selectView(view.id)"
              >
                <span class="sched-hub__view-menu-ico" v-html="viewIcon(view.icon)" />
                <span class="sched-hub__view-menu-label">{{ view.navLabel || view.title }}</span>
                <span v-if="isViewActive(view)" class="sched-hub__view-menu-check">✓</span>
              </button>
            </div>
          </div>
          <p
            v-if="contextLine"
            class="sched-hub__context"
            :class="{ 'sched-hub__context--other': contextIsOther }"
          >
            {{ contextLine }}
          </p>
        </div>
      </div>
      <div v-if="$slots['header-actions']" class="sched-hub__header-actions">
        <slot name="header-actions" />
      </div>
    </header>

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
import { computed, onMounted, onUnmounted, ref } from 'vue';

const stageRef = ref(null);
const titleSwitchRef = ref(null);
const viewMenuOpen = ref(false);

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
  platformTheme: { type: Boolean, default: false },
  /** Thin meta row only — title lives in the schedule command bar. */
  metaOnlyHeader: { type: Boolean, default: false },
});

const emit = defineEmits(['select-view']);

/** Non-utility views that can be switched (My schedule / Supervisees / Employees / Schedule list). */
const switchableViews = computed(() =>
  (props.views || []).filter((v) => !v.isUtility)
);

const displayTitle = computed(() => {
  const active = switchableViews.value.find((v) => isViewActive(v));
  return active?.navLabel || active?.title || props.activeTitle || 'My schedule';
});

const activeViewIcon = computed(() => {
  const active = switchableViews.value.find((v) => isViewActive(v));
  return viewIcon(active?.icon || 'calendar');
});

const isViewActive = (view) => {
  if (view.isUtility) {
    return view.id === 'skill_builders' && props.skillBuildersActive;
  }
  return view.id === props.activeView;
};

const onTitleClick = () => {
  if (switchableViews.value.length <= 1) return;
  viewMenuOpen.value = !viewMenuOpen.value;
};

const selectView = (id) => {
  viewMenuOpen.value = false;
  emit('select-view', id);
};

const onDocClick = (e) => {
  if (!viewMenuOpen.value) return;
  if (titleSwitchRef.value && !titleSwitchRef.value.contains(e.target)) {
    viewMenuOpen.value = false;
  }
};

onMounted(() => document.addEventListener('click', onDocClick, true));
onUnmounted(() => document.removeEventListener('click', onDocClick, true));

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
  gap: 12px;
  margin-bottom: 8px;
}

.sched-hub__title-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.sched-hub__title-switch {
  position: relative;
}

.sched-hub__title-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 4px 6px 4px 4px;
  border: none;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: default;
  border-radius: 10px;
}

.sched-hub__title-btn--menu {
  cursor: pointer;
}

.sched-hub__title-btn--menu:hover {
  background: #f3f4f6;
}

.sched-hub__title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #166534;
}

.sched-hub__title-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.sched-hub__title-text {
  font-size: 1.15rem;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.01em;
}

.sched-hub__viewing-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #14532d;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sched-hub__title-chev {
  font-size: 0.75rem;
  color: #6b7280;
  margin-left: 2px;
}

.sched-hub__view-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 40;
  min-width: 220px;
  padding: 6px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
}

.sched-hub__view-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
}

.sched-hub__view-menu-item:hover {
  background: #f3f4f6;
}

.sched-hub__view-menu-item.on {
  background: #ecfdf5;
  color: #14532d;
}

.sched-hub__view-menu-ico {
  display: inline-flex;
  color: #166534;
}

.sched-hub__view-menu-ico :deep(svg) {
  width: 16px;
  height: 16px;
}

.sched-hub__view-menu-label {
  flex: 1;
}

.sched-hub__view-menu-check {
  font-weight: 800;
  color: #166534;
}

.sched-hub__context {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
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

.sched-hub--meta .sched-hub__header {
  align-items: center;
  margin-bottom: 6px;
}

.sched-hub__meta-line {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--hub-muted);
}

.sched-hub--meta .sched-hub__header-actions :deep(.btn),
.sched-hub--meta .sched-hub__header-actions :deep(a) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  box-shadow: none;
  color: #166534;
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}

.sched-hub--meta .sched-hub__header-actions :deep(.btn:hover),
.sched-hub--meta .sched-hub__header-actions :deep(a:hover) {
  background: #ecfdf5;
  color: #14532d;
}

.sched-hub__stage {
  min-width: 0;
}

.sched-hub__content {
  min-width: 0;
}

.sched-hub--platform .sched-hub__title-text {
  color: #0f172a;
}
</style>
