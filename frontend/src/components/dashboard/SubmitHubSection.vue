<template>
  <section class="submit-hub__section" :style="themeStyle">
    <header class="submit-hub__section-head">
      <span class="submit-hub__section-icon" v-html="iconSvg" />
      <span class="submit-hub__section-title">{{ meta.title }}</span>
      <span class="submit-hub__section-tag">{{ meta.tag }}</span>
      <span v-if="meta.tagSecondary" class="submit-hub__section-tag submit-hub__section-tag--muted">{{ meta.tagSecondary }}</span>
    </header>
    <div class="submit-hub__section-body">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { getSubmitGroupMeta, getSubmitGroupThemeStyle } from '../../config/submitDisplayCategories';

const props = defineProps({
  groupId: { type: String, required: true },
});

const meta = computed(() => getSubmitGroupMeta(props.groupId));
const themeStyle = computed(() => getSubmitGroupThemeStyle(props.groupId));

const ICONS = {
  wallet: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 7v10a2 2 0 0 0 2 2h16v-5"/></svg>',
  clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  school: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>',
  car: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-2-3-2-3 2-3 2-2.7.6-3.5 1.1C5.7 11.3 5 12.1 5 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
};

const iconSvg = computed(() => ICONS[meta.value.icon] || ICONS.wallet);
</script>

<style scoped>
.submit-hub__section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-left: 4px solid var(--cat-accent, #166534);
  border-radius: 10px;
  margin-bottom: 14px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.submit-hub__section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: color-mix(in srgb, var(--cat-icon-bg, #fafafa) 55%, #fff);
  border-bottom: 1px solid #e5e7eb;
}

.submit-hub__section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--cat-icon-bg, #dcfce7);
  color: var(--cat-icon, #166534);
  flex-shrink: 0;
}

.submit-hub__section-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.submit-hub__section-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--cat-tag-bg, #ecfdf5);
  color: var(--cat-tag-color, #166534);
}

.submit-hub__section-tag--muted {
  background: var(--cat-tag-muted-bg, #eff6ff);
  color: var(--cat-tag-muted-color, #1d4ed8);
}

.submit-hub__section-body {
  padding: 14px 18px 18px;
}
</style>
