<template>
  <div :style="brandingStyles">
    <slot />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

/** Settings uses the tenant picker; selected tenant should drive :root colors/fonts even on /itsco/admin/settings. */
const isAdminSettingsBrandingRoute = computed(() => {
  const n = route.name;
  return n === 'Settings' || n === 'OrganizationSettings';
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
    // SKIP when we're already on a different org's slug route — except Settings, where the picker is authoritative.
    if (agencyStore.currentAgency?.id && (!isOnDifferentOrgRoute() || isAdminSettingsBrandingRoute.value)) {
      try {
        await agencyStore.hydrateAgencyById(agencyStore.currentAgency.id);
        brandingStore.syncDocumentThemeFromSelectedAgency({
          skipRouteSlugGuard: isAdminSettingsBrandingRoute.value
        });
        // syncDocumentThemeFromSelectedAgency bails when the club slug (e.g. "yss") doesn't match
        // the platform route slug (e.g. "ssc"). For affiliation-type agencies (SSC clubs), apply
        // the theme directly so colors and custom fonts load on the first visit — not just after
        // visiting Club Settings.
        const a = agencyStore.currentAgency;
        const orgType = String(a?.organization_type || '').toLowerCase();
        if ((orgType === 'affiliation' || orgType === 'clubwebapp') && a?.id) {
          try {
            const cp = typeof a.color_palette === 'string'
              ? JSON.parse(a.color_palette || '{}')
              : (a.color_palette || {});
            if (cp && (cp.fontFamily || cp.primary)) {
              const parentTenantId = Number(a.affiliated_agency_id || 0) || null;
              const fontBrandingAgencyId = (orgType === 'affiliation' || orgType === 'clubwebapp') && parentTenantId ? parentTenantId : a.id;
              brandingStore.applyTheme({
                colorPalette: cp,
                themeSettings: typeof a.theme_settings === 'string'
                  ? JSON.parse(a.theme_settings || '{}')
                  : (a.theme_settings || {}),
                brandingAgencyId: fontBrandingAgencyId,
                agencyId: a.id
              });
            }
          } catch { /* ignore parse errors */ }
        }
      } catch {
        // ignore
      }
    } else if (!agencyStore.currentAgency?.id && agencyStore.platformMode) {
      try {
        await brandingStore.syncDocumentThemeFromPlatformBranding();
        if (brandingStore.platformBranding) {
          await loadAndApplyPlatformFonts(brandingStore.platformBranding);
        }
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

// Agency selected → tenant colors; Platform chip (no agency + platformMode) → platform colors on :root.
// IMPORTANT: watch a stable primitive string, not `[id, platformMode]` (new array each run).
// Include agencyStore.brandingContextGeneration so re-selecting the same tenant (NLU→ITSCO→NLU) still re-runs —
// otherwise Vue skips the callback when id+platformMode match the previous cycle.
watch(
  () => {
    const rawId = agencyStore.currentAgency?.id;
    const n = rawId != null && rawId !== '' ? Number(rawId) : NaN;
    const idKey = Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : '';
    const gen = agencyStore.brandingContextGeneration;
    return `${idKey}:${agencyStore.platformMode ? 1 : 0}:${gen}`;
  },
  async (key) => {
    if (!authStore.isAuthenticated) return;
    /** If brandingContextGeneration changes while we await, a newer pick started — don’t clobber :root. */
    const myGen = agencyStore.brandingContextGeneration;
    const parts = String(key || '').split(':');
    const idPart = parts[0] || '';
    const pmPart = parts[1] || '0';
    const newId = idPart ? Number(idPart, 10) : null;
    const platformMode = pmPart === '1';

    if (newId) {
      if (isOnDifferentOrgRoute() && !isAdminSettingsBrandingRoute.value) return;
      try {
        await agencyStore.hydrateAgencyById(newId);
        if (agencyStore.brandingContextGeneration !== myGen) return;
        brandingStore.syncDocumentThemeFromSelectedAgency({
          skipRouteSlugGuard: isAdminSettingsBrandingRoute.value
        });
        if (agencyStore.brandingContextGeneration !== myGen) return;
        const a = agencyStore.currentAgency;
        const orgType = String(a?.organization_type || '').toLowerCase();
        if ((orgType === 'affiliation' || orgType === 'clubwebapp') && a?.id) {
          try {
            const cp = typeof a.color_palette === 'string'
              ? JSON.parse(a.color_palette || '{}')
              : (a.color_palette || {});
            if (cp && (cp.fontFamily || cp.primary)) {
              const parentTenantId = Number(a.affiliated_agency_id || 0) || null;
              const fontBrandingAgencyId = (orgType === 'affiliation' || orgType === 'clubwebapp') && parentTenantId ? parentTenantId : a.id;
              brandingStore.applyTheme({
                colorPalette: cp,
                themeSettings: typeof a.theme_settings === 'string'
                  ? JSON.parse(a.theme_settings || '{}')
                  : (a.theme_settings || {}),
                brandingAgencyId: fontBrandingAgencyId,
                agencyId: a.id
              });
            }
          } catch { /* ignore parse errors */ }
        }
      } catch {
        // ignore
      }
      return;
    }

    if (platformMode && !newId) {
      try {
        await brandingStore.syncDocumentThemeFromPlatformBranding();
        if (agencyStore.brandingContextGeneration !== myGen) return;
        if (brandingStore.platformBranding) {
          await loadAndApplyPlatformFonts(brandingStore.platformBranding);
        }
      } catch {
        // ignore
      }
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

