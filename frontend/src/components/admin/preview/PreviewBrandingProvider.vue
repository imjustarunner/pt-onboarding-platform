<template>
  <div :style="brandingStyles">
    <slot />
    <PoweredByFooter />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useAgencyStore } from '../../../store/agency';
import { useBrandingStore } from '../../../store/branding';
import { loadAndApplyPlatformFonts } from '../../../utils/fontLoader';
import PoweredByFooter from '../../../components/PoweredByFooter.vue';
import api from '../../../services/api';

const props = defineProps({
  agencyId: {
    type: Number,
    required: true
  }
});

const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

// Force agency branding for preview (bypass super_admin check)
const brandingStyles = computed(() => {
  const agency = agencyStore.currentAgency;
  const platform = brandingStore.platformBranding;
  const themeSettings = agency?.theme_settings
    ? (typeof agency.theme_settings === 'string' ? JSON.parse(agency.theme_settings) : agency.theme_settings)
    : {};
  
  // Get agency color palette
  let colorPalette = {};
  if (agency?.color_palette) {
    colorPalette = typeof agency.color_palette === 'string' 
      ? JSON.parse(agency.color_palette)
      : agency.color_palette;
  }
  
  // Use agency colors if available, otherwise fall back to platform
  const primaryColor = colorPalette.primary || platform?.primary_color || '#C69A2B';
  const secondaryColor = colorPalette.secondary || platform?.secondary_color || '#1D2633';
  const accentColor = colorPalette.accent || platform?.accent_color || '#3A4C6B';
  
  // Calculate a lighter version of primary for gradients
  const primaryLight = primaryColor.replace(/#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/, (_, r, g, b) => {
    const lighten = (hex) => Math.min(255, parseInt(hex, 16) + 40).toString(16).padStart(2, '0');
    return `#${lighten(r)}${lighten(g)}${lighten(b)}`;
  });

  const loginBackground = themeSettings?.loginBackground
    ? themeSettings.loginBackground
    : `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
  
  return {
    '--primary-color': primaryColor,
    '--secondary-color': secondaryColor,
    '--accent-color': accentColor,
    '--primary': primaryColor,
    '--primary-light': primaryLight,
    '--secondary': secondaryColor,
    '--accent': accentColor,
    '--agency-font-family': themeSettings?.fontFamily || null,
    '--agency-login-background': loginBackground,
    '--success': platform?.success_color || '#2F8F83',
    '--error': platform?.error_color || '#CC3D3D',
    '--warning': platform?.warning_color || '#E6A700',
    '--bg-alt': platform?.background_color || '#F3F6FA',
    '--text-primary': secondaryColor,
    '--text-secondary': accentColor,
    '--border': accentColor
  };
});

onMounted(async () => {
  // Fetch agency data if not already set
  if (!agencyStore.currentAgency || agencyStore.currentAgency.id !== props.agencyId) {
    try {
      const response = await api.get(`/agencies/${props.agencyId}`);
      agencyStore.setCurrentAgency(response.data);
    } catch (error) {
      console.error('Failed to fetch agency for preview:', error);
    }
  }
  
  // Fetch platform branding for fallback colors
  await brandingStore.fetchPlatformBranding();
  
  // Load and apply platform fonts
  if (brandingStore.platformBranding) {
    await loadAndApplyPlatformFonts(brandingStore.platformBranding);
  }
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
