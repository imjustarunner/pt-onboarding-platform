import { computed } from 'vue';

const DEFAULTS = {
  primary: '#1e4d3b',
  secondary: '#2d6a4f',
  accent: '#c4a574',
  backgroundColor: '#f7f5f2',
  textPrimary: '#1a2e24',
  textMuted: '#5c6b63',
  fontFamily: "'Segoe UI', 'Avenir Next', 'Nunito Sans', system-ui, sans-serif"
};

/**
 * Build CSS custom properties from a public-form branding payload.
 * @param {import('vue').Ref|import('vue').ComputedRef|object|null} brandingRef
 */
export function useDigitalFormTheme(brandingSource) {
  const branding = computed(() => {
    const raw = brandingSource?.value !== undefined ? brandingSource.value : brandingSource;
    return raw && typeof raw === 'object' ? raw : {};
  });

  const palette = computed(() => branding.value.colorPalette || branding.value.color_palette || {});

  const shellVars = computed(() => {
    const p = palette.value || {};
    return {
      '--df-primary': p.primary || DEFAULTS.primary,
      '--df-secondary': p.secondary || DEFAULTS.secondary,
      '--df-accent': p.accent || DEFAULTS.accent,
      '--df-bg': p.backgroundColor || p.secondaryBackground || DEFAULTS.backgroundColor,
      '--df-text': p.textPrimary || DEFAULTS.textPrimary,
      '--df-muted': p.textMuted || p.textSecondary || DEFAULTS.textMuted,
      '--df-font': branding.value.fontFamily || branding.value.themeSettings?.fontFamily || DEFAULTS.fontFamily
    };
  });

  const logoUrl = computed(
    () =>
      branding.value.logoUrl ||
      branding.value.organizationLogoUrl ||
      branding.value.agencyLogoUrl ||
      ''
  );

  const agencyLogoUrl = computed(() => branding.value.agencyLogoUrl || logoUrl.value || '');
  const organizationLogoUrl = computed(() => branding.value.organizationLogoUrl || '');

  const programTitle = computed(
    () =>
      branding.value.programTitle ||
      branding.value.organizationName ||
      branding.value.agencyName ||
      'Intake & Registration'
  );

  const agencyName = computed(() => branding.value.agencyName || '');
  const organizationName = computed(() => branding.value.organizationName || '');

  return {
    branding,
    palette,
    shellVars,
    logoUrl,
    agencyLogoUrl,
    organizationLogoUrl,
    programTitle,
    agencyName,
    organizationName,
    DEFAULTS
  };
}
