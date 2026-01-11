<template>
  <div :style="brandingStyles">
    <slot />
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { loadAndApplyPlatformFonts } from '../utils/fontLoader';

const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

onMounted(async () => {
  await brandingStore.fetchPlatformBranding();
  
  // Load and apply platform fonts after branding is fetched
  if (brandingStore.platformBranding) {
    await loadAndApplyPlatformFonts(brandingStore.platformBranding);
  }
  
  // Only fetch agencies if user is authenticated and not a super admin
  // This prevents agency colors from affecting the login page
  if (authStore.isAuthenticated && authStore.user?.role !== 'super_admin') {
    await agencyStore.fetchUserAgencies();
  } else if (!authStore.isAuthenticated) {
    // Clear currentAgency on login page to ensure platform branding is used
    if (agencyStore.currentAgency) {
      agencyStore.setCurrentAgency(null);
    }
  }
});

// Watch for platform branding changes and reload fonts
watch(() => brandingStore.platformBranding, async (newBranding) => {
  if (newBranding) {
    await loadAndApplyPlatformFonts(newBranding);
  }
}, { deep: true });

const brandingStyles = computed(() => {
  const platform = brandingStore.platformBranding;
  // Calculate a lighter version of primary for gradients
  const primaryLight = brandingStore.primaryColor ? 
    brandingStore.primaryColor.replace(/#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/, (_, r, g, b) => {
      const lighten = (hex) => Math.min(255, parseInt(hex, 16) + 40).toString(16).padStart(2, '0');
      return `#${lighten(r)}${lighten(g)}${lighten(b)}`;
    }) : '#D4B04A';
  
  return {
    '--primary-color': brandingStore.primaryColor,
    '--secondary-color': brandingStore.secondaryColor,
    '--accent-color': brandingStore.accentColor,
    '--primary': brandingStore.primaryColor,
    '--primary-light': primaryLight,
    '--secondary': brandingStore.secondaryColor,
    '--accent': brandingStore.accentColor,
    '--success': platform?.success_color || '#2F8F83',
    '--error': platform?.error_color || '#CC3D3D',
    '--warning': platform?.warning_color || '#E6A700',
    '--bg-alt': platform?.background_color || '#F3F6FA',
    '--text-primary': brandingStore.secondaryColor,
    '--text-secondary': brandingStore.accentColor,
    '--border': brandingStore.accentColor
  };
});
</script>

<style scoped>
:deep(.btn-primary) {
  background-color: var(--primary-color);
}

:deep(.btn-primary:hover) {
  background-color: var(--secondary-color);
}
</style>

