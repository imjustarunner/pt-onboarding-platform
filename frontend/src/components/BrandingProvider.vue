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
  
  // Fetch agencies for authenticated users so agency branding can be applied
  if (authStore.isAuthenticated) {
    if (authStore.user?.role === 'super_admin') {
      await agencyStore.fetchAgencies();
      // Hydrate currentAgency from localStorage so it has color_palette
      if (agencyStore.currentAgency?.id) {
        await agencyStore.hydrateAgencyById(agencyStore.currentAgency.id);
      }
    } else {
      await agencyStore.fetchUserAgencies();
    }
    // Best-effort: full agency row + :root CSS vars when a selection already exists (e.g. persisted currentAgency).
    if (agencyStore.currentAgency?.id) {
      try {
        await agencyStore.hydrateAgencyById(agencyStore.currentAgency.id);
        brandingStore.syncDocumentThemeFromSelectedAgency();
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

// Watch for agency switches: hydrate full row (palette on list payloads is often missing), then sync :root + fonts.
watch(
  () => agencyStore.currentAgency?.id,
  async (newId) => {
    if (!authStore.isAuthenticated || !newId) return;
    try {
      await agencyStore.hydrateAgencyById(newId);
      brandingStore.syncDocumentThemeFromSelectedAgency();
    } catch {
      // ignore
    }
  }
);

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

