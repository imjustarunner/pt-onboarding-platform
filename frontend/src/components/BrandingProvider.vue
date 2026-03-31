<template>
  <div :style="brandingStyles">
    <slot />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { loadAndApplyPlatformFonts } from '../utils/fontLoader';

const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();

/**
 * Returns true when we are on a slug-prefixed route (/nlu/admin/...) and the
 * current agency in the store belongs to a DIFFERENT slug (e.g. ITSCO).
 * In that case, the route's portal theme must win — never let currentAgency
 * clobber it.
 */
const isOnDifferentOrgRoute = () => {
  const routeSlug = typeof route.params.organizationSlug === 'string'
    ? String(route.params.organizationSlug).trim().toLowerCase()
    : '';
  if (!routeSlug) return false;
  const a = agencyStore.currentAgency;
  if (!a) return false;
  const agSlug = String(a.slug || a.portal_url || a.portalUrl || '').trim().toLowerCase();
  return !!(agSlug && agSlug !== routeSlug);
};

/**
 * Belt-and-suspenders: imperatively sync :root CSS vars whenever the branding
 * store computeds change. This guarantees the DOM always reflects the current
 * palette even if the inline-style cascade on the BrandingProvider div lags.
 * watchEffect auto-tracks brandingStore.primaryColor etc. as reactive deps.
 */
watchEffect(() => {
  const root = document.documentElement;
  const primary = brandingStore.primaryColor;
  const secondary = brandingStore.secondaryColor;
  const accent = brandingStore.accentColor;
  if (primary) {
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-color', primary);
    root.style.setProperty('--agency-primary-color', primary);
  }
  if (secondary) {
    root.style.setProperty('--secondary', secondary);
    root.style.setProperty('--secondary-color', secondary);
    root.style.setProperty('--agency-secondary-color', secondary);
  }
  if (accent) {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-color', accent);
    root.style.setProperty('--agency-accent-color', accent);
  }
});

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
    // SKIP when we're already on a different org's slug route (e.g. superadmin on /nlu/... while
    // currentAgency is still ITSCO from localStorage) — the route guard already applied the correct theme.
    if (agencyStore.currentAgency?.id && !isOnDifferentOrgRoute()) {
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
// SKIP when on a different org's slug route so we never clobber the route's portal theme.
watch(
  () => agencyStore.currentAgency?.id,
  async (newId) => {
    if (!authStore.isAuthenticated || !newId) return;
    if (isOnDifferentOrgRoute()) return;
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

