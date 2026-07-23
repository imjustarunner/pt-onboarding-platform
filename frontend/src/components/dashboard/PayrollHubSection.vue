<template>
  <section
    class="pay-hub__section"
    :style="themeStyle"
    :id="`payroll-section-${sectionId}`"
  >
    <button
      type="button"
      class="pay-hub__section-head"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <span class="pay-hub__chevron" :class="{ open: isOpen }">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </span>
      <span class="pay-hub__section-icon" v-html="iconSvg" />
      <span class="pay-hub__section-title">{{ meta.title }}</span>
      <span class="pay-hub__section-tag">{{ meta.tag }}</span>
      <span v-if="meta.tagSecondary" class="pay-hub__section-tag pay-hub__section-tag--muted">{{ meta.tagSecondary }}</span>
      <span v-if="itemCount != null" class="pay-hub__section-count">{{ itemCount }} {{ countLabel }}</span>
      <div v-if="$slots.actions" class="pay-hub__section-actions" @click.stop>
        <slot name="actions" />
      </div>
    </button>
    <div v-show="isOpen" class="pay-hub__section-body">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { getPayrollSectionMeta, getPayrollSectionThemeStyle } from '../../config/payrollDisplaySections';

const props = defineProps({
  sectionId: { type: String, required: true },
  open: { type: Boolean, default: true },
  itemCount: { type: Number, default: null },
  countLabel: { type: String, default: 'items' },
});

const meta = computed(() => getPayrollSectionMeta(props.sectionId));
const themeStyle = computed(() => getPayrollSectionThemeStyle(props.sectionId));
const isOpen = ref(props.open);

watch(
  () => props.open,
  (v) => {
    isOpen.value = v;
  }
);

const SECTION_ICONS = {
  wallet: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 7v10a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>',
  calendar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  car: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-2-3-2-3 2-3 2-2.7.6-3.5 1.1C5.7 11.3 5 12.1 5 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
  clipboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  receipt: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M12 16H8"/></svg>',
  card: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

const iconSvg = computed(() => SECTION_ICONS[meta.value.icon] || SECTION_ICONS.wallet);
</script>

<style scoped>
.pay-hub__section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-left: 4px solid var(--cat-accent, #0d9488);
  border-radius: 10px;
  margin-bottom: 14px;
  /* Allow inner tables (e.g. Service Codes) to scroll horizontally instead of clipping */
  overflow: visible;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.pay-hub__section-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: color-mix(in srgb, var(--cat-icon-bg, #fafafa) 55%, #fff);
  border: none;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  text-align: left;
}

.pay-hub__chevron {
  display: flex;
  color: #6b7280;
  transition: transform 0.2s;
}
.pay-hub__chevron.open {
  transform: rotate(90deg);
}

.pay-hub__section-icon {
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

.pay-hub__section-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.pay-hub__section-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--cat-tag-bg, #ecfdf5);
  color: var(--cat-tag-color, #166534);
}

.pay-hub__section-tag--muted {
  background: var(--cat-tag-muted-bg, #eff6ff);
  color: var(--cat-tag-muted-color, #1d4ed8);
}

.pay-hub__section-count {
  margin-left: auto;
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.pay-hub__section-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 8px;
}

.pay-hub__section-body {
  padding: 14px 18px 18px;
  min-width: 0;
  overflow-x: auto;
}

.pay-hub__section-body :deep(.table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.pay-hub__section-body :deep(.table th) {
  padding: 10px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  background: #fafafa;
  border-bottom: 1px solid #e5e7eb;
}

.pay-hub__section-body :deep(.table td) {
  padding: 12px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

.pay-hub__section-body :deep(.table-wrap) {
  overflow-x: auto;
  margin-top: 10px;
}
</style>
