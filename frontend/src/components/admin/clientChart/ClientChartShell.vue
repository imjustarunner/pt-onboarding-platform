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
  gap: 4px 18px;
  padding: 10px 16px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: var(--bg, #fff);
}
.cc-subnav__btn {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary, #64748b);
  font-size: 13px;
  font-weight: 650;
  padding: 8px 2px 10px;
  border-radius: 0;
  cursor: pointer;
}
.cc-subnav__btn:hover {
  color: var(--text-primary, #0f172a);
}
.cc-subnav__btn--active {
  background: transparent;
  border-bottom-color: var(--primary, #166534);
  color: var(--primary, #166534);
  box-shadow: none;
}
</style>
