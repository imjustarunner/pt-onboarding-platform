<template>
  <div class="branding-logo" :class="[sizeClass, { 'logo-only': logoOnly }]">
    <img
      v-if="logoUrl"
      :src="logoUrl"
      :alt="altText"
      class="logo-image"
      @error="handleImageError"
    />
    <div v-else-if="showFallback" class="logo-fallback">
      <span class="fallback-text">{{ displayName }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useBrandingStore } from '../store/branding';

const props = defineProps({
  size: {
    type: String,
    default: 'medium', // 'small', 'medium', 'large', 'xlarge'
    validator: (value) => ['small', 'medium', 'large', 'xlarge'].includes(value)
  },
  logoOnly: {
    type: Boolean,
    default: false
  },
  showFallback: {
    type: Boolean,
    default: true
  },
  altText: {
    type: String,
    default: null
  }
});

const brandingStore = useBrandingStore();
const logoUrl = computed(() => brandingStore.displayLogoUrl);
const displayName = computed(() => brandingStore.displayName);

const sizeClass = computed(() => `logo-${props.size}`);

const defaultAltText = computed(() => {
  if (brandingStore.isSuperAdmin) {
    return 'PlotTwistCo Logo';
  }
  return `${displayName.value} Logo`;
});

const finalAltText = computed(() => props.altText || defaultAltText.value);

const handleImageError = (event) => {
  // Hide broken image, show fallback if enabled
  if (props.showFallback) {
    event.target.style.display = 'none';
  }
};
</script>

<style scoped>
.branding-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.logo-image {
  display: block;
  height: auto;
  max-width: 100%;
  object-fit: contain;
}

.logo-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--primary-color, var(--primary));
  letter-spacing: -0.02em;
}

.fallback-text {
  white-space: nowrap;
}

/* Size variants */
.logo-small .logo-image {
  height: 20px;
  max-height: 20px;
}

.logo-medium .logo-image {
  height: 40px;
  max-height: 40px;
}

.logo-large .logo-image {
  height: 60px;
  max-height: 60px;
}

.logo-xlarge .logo-image {
  height: 80px;
  max-height: 80px;
}

.logo-small .fallback-text {
  font-size: 14px;
}

.logo-medium .fallback-text {
  font-size: 18px;
}

.logo-large .fallback-text {
  font-size: 24px;
}

.logo-xlarge .fallback-text {
  font-size: 32px;
}

.logo-only {
  /* Remove any text/spacing when logo only */
}
</style>

