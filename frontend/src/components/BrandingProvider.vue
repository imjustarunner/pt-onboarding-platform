<template>
  <div :style="brandingStyles">
    <slot />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { loadAndApplyPlatformFonts } from '../utils/fontLoader';

const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

// Track dark mode so we don't override its CSS variables with agency branding
const isDarkMode = ref(document.documentElement.getAttribute('data-theme') === 'dark');
const themeObserver = new MutationObserver(() => {
  isDarkMode.value = document.documentElement.getAttribute('data-theme') === 'dark';
});
onMounted(() => {
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});
onBeforeUnmount(() => themeObserver.disconnect());

onMounted(async () => {
  // Force refresh branding on login page (when not authenticated) to get latest template
  const forceRefresh = !authStore.isAuthenticated;
  await brandingStore.fetchPlatformBranding(forceRefresh);
  
  // Load and apply platform fonts after branding is fetched
  if (brandingStore.platformBranding) {
    await loadAndApplyPlatformFonts(brandingStore.platformBranding);
  }
  
  // Only fetch agencies if user is authenticated and not a super admin
  // This prevents agency colors from affecting the login page
  if (authStore.isAuthenticated && authStore.user?.role !== 'super_admin') {
    await agencyStore.fetchUserAgencies();
    // Best-effort: apply agency theme (fonts) if we already have a selected agency.
    if (agencyStore.currentAgency) {
      try {
        const colorPalette = typeof agencyStore.currentAgency.color_palette === 'string'
          ? JSON.parse(agencyStore.currentAgency.color_palette)
          : (agencyStore.currentAgency.color_palette || {});
        const themeSettings = typeof agencyStore.currentAgency.theme_settings === 'string'
          ? JSON.parse(agencyStore.currentAgency.theme_settings)
          : (agencyStore.currentAgency.theme_settings || {});
        brandingStore.applyTheme({
          brandingAgencyId: agencyStore.currentAgency.id,
          agencyId: agencyStore.currentAgency.id,
          colorPalette,
          themeSettings
        });
      } catch {
        // ignore
      }
    }
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

// Watch for agency switches and apply the agency theme settings (especially fonts).
watch(() => agencyStore.currentAgency, async (newAgency) => {
  if (!authStore.isAuthenticated) return;
  if (!newAgency) return;
  try {
    const colorPalette = typeof newAgency.color_palette === 'string'
      ? JSON.parse(newAgency.color_palette)
      : (newAgency.color_palette || {});
    const themeSettings = typeof newAgency.theme_settings === 'string'
      ? JSON.parse(newAgency.theme_settings)
      : (newAgency.theme_settings || {});
    brandingStore.applyTheme({
      brandingAgencyId: newAgency.id,
      agencyId: newAgency.id,
      colorPalette,
      themeSettings
    });
  } catch {
    // ignore
  }
}, { deep: false });

const brandingStyles = computed(() => {
  const platform = brandingStore.platformBranding;
  const dark = isDarkMode.value;
  // Calculate a lighter version of primary for gradients
  const primaryLight = brandingStore.primaryColor ?
    brandingStore.primaryColor.replace(/#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/, (_, r, g, b) => {
      const lighten = (hex) => Math.min(255, parseInt(hex, 16) + 40).toString(16).padStart(2, '0');
      return `#${lighten(r)}${lighten(g)}${lighten(b)}`;
    }) : '#D4B04A';

  const styles = {
    '--primary-color': brandingStore.primaryColor,
    '--secondary-color': brandingStore.secondaryColor,
    '--accent-color': brandingStore.accentColor,
    '--primary': brandingStore.primaryColor,
    '--primary-light': primaryLight,
    '--primary-hover': brandingStore.primaryHover,
    '--secondary': brandingStore.secondaryColor,
    '--accent': brandingStore.accentColor,
    '--success': brandingStore.successColor,
    '--error': platform?.error_color || '#CC3D3D',
    '--warning': platform?.warning_color || '#E6A700',
    '--data-numbers': brandingStore.dataNumbersColor,
    // Contrast-safe defaults for dark headers across agencies.
    '--header-text-color': '#ffffff',
    '--header-text-muted': 'rgba(255,255,255,0.85)',
    // Ensure typography variables inherit the agency font when set.
    '--font-body': 'var(--agency-font-family, var(--font-body))',
    '--font-header': 'var(--agency-font-family, var(--font-header))'
  };
  // When dark mode is on, do NOT override bg/text/border — let [data-theme="dark"] CSS rule apply
  if (!dark) {
    styles['--bg-primary'] = brandingStore.backgroundColor;
    styles['--bg-alt'] = brandingStore.backgroundColor;
    styles['--bg-secondary'] = brandingStore.secondaryBackground;
    styles['--divider'] = brandingStore.dividerColor;
    styles['--text-primary'] = brandingStore.textPrimaryColor;
    styles['--text-secondary'] = brandingStore.textSecondaryColor;
    styles['--text-muted'] = brandingStore.textMutedColor;
    styles['--border'] = brandingStore.accentColor;
  }
  return styles;
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

