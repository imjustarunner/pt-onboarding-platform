<template>
  <div v-if="logoUrl || (showFallback && displayName)" class="branding-logo" :class="[sizeClass, { 'logo-only': logoOnly }]">
    <img
      v-if="logoUrl"
      :src="logoUrl"
      :alt="altText"
      class="logo-image"
      @error="handleImageError"
      @load="handleImageLoad"
    />
    <div v-else-if="showFallback && displayName" class="logo-fallback">
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
  },
  logoUrl: {
    type: String,
    default: null
  }
});

const brandingStore = useBrandingStore();
const logoUrl = computed(() => props.logoUrl || brandingStore.displayLogoUrl);
const displayName = computed(() => brandingStore.displayName);

const sizeClass = computed(() => `logo-${props.size}`);

const defaultAltText = computed(() => {
  const orgName = brandingStore.platformBranding?.organization_name || displayName.value || 'Platform';
  if (brandingStore.isSuperAdmin) {
    return orgName ? `${orgName} Logo` : 'Platform Logo';
  }
  return `${displayName.value || orgName || 'Platform'} Logo`;
});

const finalAltText = computed(() => props.altText || defaultAltText.value);

const handleImageLoad = () => {
  // Logo loaded successfully
  if (import.meta.env.DEV) {
    console.log('[BrandingLogo] Logo loaded successfully:', logoUrl.value);
  }
};

const handleImageError = (event) => {
  // Log the error for debugging
  console.warn('[BrandingLogo] Failed to load logo:', {
    logoUrl: logoUrl.value,
    error: event
  });
  
  // Hide broken image, show fallback if enabled
  if (props.showFallback) {
    event.target.style.display = 'none';
  } else {
    // If no fallback, hide the entire logo container
    event.target.closest('.branding-logo')?.style.setProperty('display', 'none');
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

