<template>
  <div v-if="showPoweredBy" class="powered-by-footer">
    <div class="powered-by-content">
      <span class="powered-by-text">Platform powered by</span>
      <img
        :src="plotTwistCoLogoUrl"
        alt="PlotTwistCo"
        class="powered-by-logo"
        @error="handleLogoError"
      />
      <span class="powered-by-name">PlotTwistCo</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useBrandingStore } from '../store/branding';

const brandingStore = useBrandingStore();
const showPoweredBy = computed(() => brandingStore.showPoweredBy);
const plotTwistCoLogoUrl = computed(() => brandingStore.plotTwistCoLogoUrl);

const handleLogoError = (event) => {
  // Hide logo if it fails to load, show text only
  event.target.style.display = 'none';
};
</script>

<style scoped>
.powered-by-footer {
  padding: 16px 24px;
  text-align: center;
  border-top: 1px solid var(--border);
  background: var(--bg-alt, #f8fafc);
  margin-top: auto;
}

.powered-by-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary, #64748b);
  font-size: 12px;
  font-weight: 500;
}

.powered-by-text {
  color: var(--text-secondary, #64748b);
}

.powered-by-logo {
  height: 16px;
  width: auto;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.powered-by-logo:hover {
  opacity: 1;
}

.powered-by-name {
  color: var(--text-secondary, #64748b);
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>

