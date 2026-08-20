<template>
  <div
    :class="fullPage ? 'cdp-page-shell' : 'cdp-chart-overlay'"
    @click.self="fullPage ? undefined : $emit('close')"
  >
    <div
      class="client-chart"
      :class="fullPage ? 'cdp-page-body' : 'modal-content large'"
      @click.stop
    >
      <div class="cc-surface">
        <slot name="header" />

        <div class="cc-tab-rail">
          <div class="modal-tabs" role="tablist" aria-label="Client record hubs">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab.id"
              :class="['tab-button', { active: activeTab === tab.id }]"
              @click="$emit('update:activeTab', tab.id)"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div
          v-if="subnav.length"
          class="cc-subnav"
          role="tablist"
          aria-label="Section within hub"
        >
          <button
            v-for="item in subnav"
            :key="item.id"
            type="button"
            class="cc-subnav__btn"
            :class="{ 'cc-subnav__btn--active': activeSub === item.id }"
            @click="$emit('update:activeSub', item.id)"
          >
            {{ item.label }}
          </button>
        </div>

        <div
          v-if="alertItems.length"
          class="cc-alert-bar cdp-alert-bar"
          role="status"
        >
          <button
            v-for="alert in alertItems"
            :key="alert.id"
            type="button"
            class="cc-alert-chip cdp-alert-chip"
            :class="alert.tone ? `cdp-alert-chip--${alert.tone}` : undefined"
            @click="$emit('alert-click', alert)"
          >
            {{ alert.label }}
          </button>
        </div>

        <div class="tab-content">
          <slot />
        </div>
      </div>

      <slot name="footer" />
      <slot name="modals" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  fullPage: { type: Boolean, default: false },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: 'overview' },
  subnav: { type: Array, default: () => [] },
  activeSub: { type: String, default: '' },
  alertItems: { type: Array, default: () => [] }
});

defineEmits(['close', 'update:activeTab', 'update:activeSub', 'alert-click']);
</script>

<style scoped>
@import '../../../styles/client-chart.css';

.cc-subnav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px 4px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
}
.cc-subnav__btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary, #64748b);
  font-size: 12px;
  font-weight: 650;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.cc-subnav__btn:hover {
  background: var(--bg, #fff);
  color: var(--text-primary, #0f172a);
}
.cc-subnav__btn--active {
  background: var(--bg, #fff);
  border-color: var(--border, #e2e8f0);
  color: var(--primary, #166534);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
</style>
