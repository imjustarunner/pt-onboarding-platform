import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAgencyStore } from './agency';
import { useAuthStore } from './auth';
import { getPortalUrl } from '../utils/subdomain';
import api from '../services/api';

export const useBrandingStore = defineStore('branding', () => {
  const agencyStore = useAgencyStore();
  const authStore = useAuthStore();
  
  // Role-based computed properties
  const userRole = computed(() => authStore.user?.role || null);
  const isSuperAdmin = computed(() => userRole.value === 'super_admin');
  const isAgencyAdmin = computed(() => userRole.value === 'admin');
  
  // PlotTwistCo logo URL (for super admin)
  const plotTwistCoLogoUrl = computed(() => {
    // Use SVG logo (PNG can be added later if needed)
    return '/logos/plottwistco-logo.svg';
  });
  
  // Branding mode: 'plotTwistCo', 'agency', or 'default'
  const brandingMode = computed(() => {
    if (isSuperAdmin.value) return 'plotTwistCo';
    if (isAgencyAdmin.value || agencyStore.currentAgency) return 'agency';
    return 'default';
  });
  
  // Show "powered by" for non-super-admin users
  const showPoweredBy = computed(() => {
    return !isSuperAdmin.value;
  });
  
  // Platform branding (fetched from API)
  const platformBranding = ref(null);
  
  // Portal agency (detected from subdomain)
  const portalAgency = ref(null);
  
  // Theme settings from portal agency
  const portalTheme = ref(null);
  
  // Fetch platform branding
  const fetchPlatformBranding = async () => {
    try {
      const response = await (await import('../services/api')).default.get('/platform-branding');
      platformBranding.value = response.data;
    } catch (err) {
      console.error('Failed to fetch platform branding:', err);
      // Use defaults if fetch fails
      platformBranding.value = {
        primary_color: '#C69A2B',
        secondary_color: '#1D2633',
        accent_color: '#3A4C6B',
        success_color: '#2F8F83',
        background_color: '#F3F6FA',
        error_color: '#CC3D3D',
        warning_color: '#E6A700',
        tagline: 'The gold standard for behavioral health workflows.'
      };
    }
  };
  
  // Fetch agency theme by portal URL
  const fetchAgencyTheme = async (portalUrl) => {
    if (!portalUrl) {
      portalAgency.value = null;
      portalTheme.value = null;
      return;
    }
    
    try {
      const response = await api.get(`/agencies/portal/${portalUrl}/theme`);
      portalTheme.value = response.data;
      portalAgency.value = {
        name: response.data.agencyName,
        colorPalette: response.data.colorPalette || {},
        logoUrl: response.data.logoUrl,
        themeSettings: response.data.themeSettings || {},
        terminologySettings: response.data.terminologySettings || {}
      };
      
      // Apply theme to CSS variables
      applyTheme(response.data);
    } catch (err) {
      console.error('Failed to fetch agency theme:', err);
      portalAgency.value = null;
      portalTheme.value = null;
    }
  };
  
  // Apply theme to CSS variables
  const applyTheme = (themeData) => {
    const root = document.documentElement;
    const colorPalette = themeData.colorPalette || {};
    const themeSettings = themeData.themeSettings || {};
    
    // Apply colors
    if (colorPalette.primary) {
      root.style.setProperty('--agency-primary-color', colorPalette.primary);
    }
    if (colorPalette.secondary) {
      root.style.setProperty('--agency-secondary-color', colorPalette.secondary);
    }
    if (colorPalette.accent) {
      root.style.setProperty('--agency-accent-color', colorPalette.accent);
    }
    
    // Apply fonts
    if (themeSettings.fontFamily) {
      root.style.setProperty('--agency-font-family', themeSettings.fontFamily);
    }
    
    // Apply login background
    if (themeSettings.loginBackground) {
      root.style.setProperty('--agency-login-background', themeSettings.loginBackground);
    } else if (colorPalette.primary) {
      // Use primary color as gradient if no background specified
      root.style.setProperty('--agency-login-background', `linear-gradient(135deg, ${colorPalette.primary} 0%, ${colorPalette.secondary || colorPalette.primary} 100%)`);
    }
  };
  
  // Initialize portal theme on app load
  const initializePortalTheme = async () => {
    const portalUrl = getPortalUrl();
    if (portalUrl) {
      await fetchAgencyTheme(portalUrl);
    }
  };

  // Primary color based on branding mode
  const primaryColor = computed(() => {
    // Portal theme takes precedence (for login page and subdomain portals)
    if (portalAgency.value?.colorPalette?.primary) {
      return portalAgency.value.colorPalette.primary;
    }
    // Always use platform branding if user is not authenticated (e.g., on login page)
    if (!authStore.isAuthenticated || isSuperAdmin.value) {
      return platformBranding.value?.primary_color || '#C69A2B'; // Auric Gold
    }
    // Only use agency colors if user is authenticated and not super admin
    if (agencyStore.currentAgency?.color_palette) {
      const palette = typeof agencyStore.currentAgency.color_palette === 'string' 
        ? JSON.parse(agencyStore.currentAgency.color_palette)
        : agencyStore.currentAgency.color_palette;
      return palette.primary || (platformBranding.value?.primary_color || '#C69A2B');
    }
    return platformBranding.value?.primary_color || '#C69A2B'; // Default
  });

  // Secondary color based on branding mode
  const secondaryColor = computed(() => {
    // Portal theme takes precedence
    if (portalAgency.value?.colorPalette?.secondary) {
      return portalAgency.value.colorPalette.secondary;
    }
    // Always use platform branding if user is not authenticated (e.g., on login page)
    if (!authStore.isAuthenticated || isSuperAdmin.value) {
      return platformBranding.value?.secondary_color || '#1D2633'; // Deep Ink
    }
    // Only use agency colors if user is authenticated and not super admin
    if (agencyStore.currentAgency?.color_palette) {
      const palette = typeof agencyStore.currentAgency.color_palette === 'string' 
        ? JSON.parse(agencyStore.currentAgency.color_palette)
        : agencyStore.currentAgency.color_palette;
      return palette.secondary || (platformBranding.value?.secondary_color || '#1D2633');
    }
    return platformBranding.value?.secondary_color || '#1D2633';
  });
  
  // Accent color based on branding mode
  const accentColor = computed(() => {
    // Portal theme takes precedence
    if (portalAgency.value?.colorPalette?.accent) {
      return portalAgency.value.colorPalette.accent;
    }
    // Always use platform branding if user is not authenticated (e.g., on login page)
    if (!authStore.isAuthenticated || isSuperAdmin.value) {
      return platformBranding.value?.accent_color || '#3A4C6B'; // Slate Blue
    }
    // Only use agency colors if user is authenticated and not super admin
    if (agencyStore.currentAgency?.color_palette) {
      const palette = typeof agencyStore.currentAgency.color_palette === 'string' 
        ? JSON.parse(agencyStore.currentAgency.color_palette)
        : agencyStore.currentAgency.color_palette;
      return palette.accent || (platformBranding.value?.accent_color || '#3A4C6B');
    }
    return platformBranding.value?.accent_color || '#3A4C6B';
  });

  // Tagline
  const tagline = computed(() => {
    return platformBranding.value?.tagline || 'The gold standard for behavioral health workflows.';
  });

  // Logo URL: PlotTwistCo for super admin, agency logo for others
  const logoUrl = computed(() => {
    // Portal theme takes precedence
    if (portalAgency.value?.logoUrl) {
      return portalAgency.value.logoUrl;
    }
    if (isSuperAdmin.value) {
      // Priority 1: Platform organization_logo_url (if set)
      if (platformBranding.value?.organization_logo_url) {
        return platformBranding.value.organization_logo_url;
      }
      // Priority 2: Platform organization_logo_path (from icon library)
      if (platformBranding.value?.organization_logo_path) {
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
        let iconPath = platformBranding.value.organization_logo_path;
        if (iconPath.startsWith('/uploads/')) {
          iconPath = iconPath.substring('/uploads/'.length);
        } else if (iconPath.startsWith('/')) {
          iconPath = iconPath.substring(1);
        }
        return `${apiBase}/uploads/${iconPath}`;
      }
      // Priority 3: Fallback to PlotTwistCo logo
      return plotTwistCoLogoUrl.value;
    }
    return agencyStore.currentAgency?.logo_url || null;
  });
  
  // Display logo URL (with fallback)
  const displayLogoUrl = computed(() => {
    // Portal theme takes precedence
    if (portalAgency.value?.logoUrl) {
      return portalAgency.value.logoUrl;
    }
    if (isSuperAdmin.value) {
      // Priority 1: Platform organization_logo_url (if set)
      if (platformBranding.value?.organization_logo_url) {
        return platformBranding.value.organization_logo_url;
      }
      // Priority 2: Platform organization_logo_path (from icon library)
      if (platformBranding.value?.organization_logo_path) {
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
        let iconPath = platformBranding.value.organization_logo_path;
        if (iconPath.startsWith('/uploads/')) {
          iconPath = iconPath.substring('/uploads/'.length);
        } else if (iconPath.startsWith('/')) {
          iconPath = iconPath.substring(1);
        }
        return `${apiBase}/uploads/${iconPath}`;
      }
      // Priority 3: Fallback to PlotTwistCo logo
      return plotTwistCoLogoUrl.value;
    }
    if (agencyStore.currentAgency?.logo_url) {
      return agencyStore.currentAgency.logo_url;
    }
    return null;
  });
  
  // Get theme settings (fonts, login background, etc.)
  const themeSettings = computed(() => {
    return portalAgency.value?.themeSettings || {};
  });
  
  // Get login background
  const loginBackground = computed(() => {
    const settings = themeSettings.value;
    if (settings.loginBackground) {
      return settings.loginBackground;
    }
    // Fallback to gradient from primary color
    const primary = primaryColor.value;
    const secondary = secondaryColor.value;
    return `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`;
  });
  
  // Get font family
  const fontFamily = computed(() => {
    const settings = themeSettings.value;
    return settings.fontFamily || null;
  });

  const agencyName = computed(() => {
    return agencyStore.currentAgency?.name || platformBranding.value?.organization_name || '';
  });
  
  // Display name for branding
  const displayName = computed(() => {
    if (isSuperAdmin.value) {
      return platformBranding.value?.organization_name || '';
    }
    return agencyStore.currentAgency?.name || platformBranding.value?.organization_name || '';
  });

  // Get terminology setting (e.g., "People Operations", "Human Resources", etc.)
  const peopleOpsTerm = computed(() => {
    // For super admins, check platform branding first
    if (isSuperAdmin.value) {
      if (platformBranding.value?.people_ops_term && platformBranding.value.people_ops_term.trim()) {
        return platformBranding.value.people_ops_term.trim();
      }
      return 'People Operations'; // Default for super admin
    }
    
    // For login page (not authenticated), use platform branding
    if (!authStore.isAuthenticated) {
      if (platformBranding.value?.people_ops_term && platformBranding.value.people_ops_term.trim()) {
        return platformBranding.value.people_ops_term.trim();
      }
      return 'People Operations'; // Default for login page
    }
    
    // For regular users/admins, check agency terminology first, then platform branding
    if (agencyStore.currentAgency?.terminology_settings) {
      const terminology = typeof agencyStore.currentAgency.terminology_settings === 'string'
        ? JSON.parse(agencyStore.currentAgency.terminology_settings)
        : agencyStore.currentAgency.terminology_settings;
      
      if (terminology.peopleOpsTerm && terminology.peopleOpsTerm.trim()) {
        return terminology.peopleOpsTerm.trim();
      }
    }
    
    // Fallback to platform branding
    if (platformBranding.value?.people_ops_term && platformBranding.value.people_ops_term.trim()) {
      return platformBranding.value.people_ops_term.trim();
    }
    
    return 'People Operations'; // Default fallback
  });

  // Navigation title: "Company Name People Operations" or "Company Name Human Resources", etc.
  const navigationTitle = computed(() => {
    try {
      const name = displayName.value || platformBranding.value?.organization_name || '';
      const term = peopleOpsTerm.value || 'People Operations';
      if (!name) {
        return term; // Just return the term if no organization name is set
      }
      const title = `${name} ${term}`;
      // Ensure we always return a non-empty string
      return title.trim() || term;
    } catch (error) {
      console.error('Error computing navigation title:', error);
      return peopleOpsTerm.value || 'People Operations';
    }
  });

  return {
    userRole,
    isSuperAdmin,
    isAgencyAdmin,
    brandingMode,
    showPoweredBy,
    primaryColor,
    secondaryColor,
    accentColor,
    logoUrl,
    displayLogoUrl,
    plotTwistCoLogoUrl,
    agencyName,
    displayName,
    peopleOpsTerm,
    navigationTitle,
    tagline,
    platformBranding,
    fetchPlatformBranding,
    portalAgency,
    portalTheme,
    themeSettings,
    loginBackground,
    fontFamily,
    fetchAgencyTheme,
    initializePortalTheme,
    applyTheme
  };
});

