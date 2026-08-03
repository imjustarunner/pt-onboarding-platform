<template>
  <div
    :class="fullPage ? 'cdp-page-shell' : 'modal-overlay'"
    @click.self="fullPage ? undefined : $emit('close')"
  >
    <div
      class="client-chart"
      :class="fullPage ? 'cdp-page-body' : 'modal-content large'"
      @click.stop
    >
      <slot name="header" />

      <div class="cc-tab-rail">
        <div class="modal-tabs" role="tablist" aria-label="Client record sections">
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
  alertItems: { type: Array, default: () => [] }
});

defineEmits(['close', 'update:activeTab', 'alert-click']);
</script>

<style scoped>
@import '../../../styles/client-chart.css';
</style>
