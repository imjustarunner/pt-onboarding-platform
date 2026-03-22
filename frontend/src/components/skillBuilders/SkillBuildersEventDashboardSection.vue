<template>
  <section
    v-if="!railMode"
    class="sb-dash-section"
    :class="{ 'sb-dash-section-collapsed': collapsed }"
  >
    <button
      type="button"
      class="sb-dash-head"
      :aria-expanded="String(!collapsed)"
      :aria-controls="panelId"
      :id="headingId"
      @click="toggle"
    >
      <span class="sb-dash-head-main">
        <span v-if="iconUrl && !iconFailed" class="sb-dash-icon-wrap" aria-hidden="true">
          <img class="sb-dash-icon" :src="iconUrl" alt="" @error="iconFailed = true" />
        </span>
        <span class="sb-dash-title">{{ title }}</span>
        <span v-if="badge" class="sb-dash-badge">{{ badge }}</span>
      </span>
      <span class="sb-dash-chevron" aria-hidden="true">{{ collapsed ? '▸' : '▾' }}</span>
    </button>
    <div v-show="!collapsed" class="sb-dash-body" :id="panelId" role="region" :aria-labelledby="headingId">
      <slot />
    </div>
  </section>
  <section v-else class="sb-dash-section sb-dash-section-rail">
    <header class="sb-dash-rail-head">
      <span v-if="iconUrl && !iconFailed" class="sb-dash-icon-wrap" aria-hidden="true">
        <img class="sb-dash-icon" :src="iconUrl" alt="" @error="iconFailed = true" />
      </span>
      <h2 class="sb-dash-rail-title" :id="headingId">{{ title }}</h2>
      <span v-if="badge" class="sb-dash-badge sb-dash-rail-badge">{{ badge }}</span>
    </header>
    <div class="sb-dash-body sb-dash-body-rail" role="region" :aria-labelledby="headingId">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  sectionId: { type: String, required: true },
  title: { type: String, required: true },
  badge: { type: String, default: '' },
  /** Agency / platform dashboard icon (My Dashboard icon keys resolved in parent). */
  iconUrl: { type: String, default: '' },
  /** Left-rail + single panel (school portal style); hides accordion chrome. */
  railMode: { type: Boolean, default: false },
  /** Controlled from parent for deep-linking */
  open: { type: Boolean, default: undefined },
  defaultOpen: { type: Boolean, default: false }
});

const iconFailed = ref(false);

watch(
  () => props.iconUrl,
  () => {
    iconFailed.value = false;
  }
);

const emit = defineEmits(['update:open']);

const internalOpen = ref(props.defaultOpen);

watch(
  () => props.open,
  (v) => {
    if (typeof v === 'boolean') internalOpen.value = v;
  },
  { immediate: true }
);

const collapsed = computed(() => {
  if (typeof props.open === 'boolean') return !props.open;
  return !internalOpen.value;
});

function toggle() {
  if (typeof props.open === 'boolean') {
    emit('update:open', !props.open);
  } else {
    internalOpen.value = !internalOpen.value;
  }
}

const headingId = computed(() => `sb-dash-h-${props.sectionId}`);
const panelId = computed(() => `sb-dash-p-${props.sectionId}`);
</script>

<style scoped>
.sb-dash-section {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  margin-bottom: 12px;
  overflow: hidden;
}
.sb-dash-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  background: linear-gradient(180deg, rgba(15, 118, 110, 0.06), #fff);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--text-primary, #0f172a);
}
.sb-dash-head:hover {
  background: linear-gradient(180deg, rgba(15, 118, 110, 0.1), #fff);
}
.sb-dash-head-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.sb-dash-icon-wrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(15, 118, 110, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.sb-dash-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
.sb-dash-title {
  font-weight: 800;
  font-size: 1.02rem;
  color: var(--primary, #0f766e);
}
.sb-dash-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
}
.sb-dash-chevron {
  flex-shrink: 0;
  font-size: 0.9rem;
  opacity: 0.65;
}
.sb-dash-body {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.sb-dash-section-collapsed .sb-dash-body {
  display: none;
}
.sb-dash-section-rail {
  margin-bottom: 0;
}
.sb-dash-body-rail {
  padding: 0 4px 8px;
  border-top: none;
}
.sb-dash-rail-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 4px 4px 14px;
  margin-bottom: 2px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sb-dash-rail-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-weight: 800;
  font-size: 1.12rem;
  line-height: 1.25;
  color: var(--primary, #0f766e);
}
.sb-dash-rail-badge {
  flex-shrink: 0;
}
</style>
