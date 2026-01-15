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
  const brandingVersion = ref(Date.now()); // Version for cache-busting logos

  // Portal agency (detected from subdomain)
  const portalAgency = ref(null);
  
  // Theme settings from portal agency
  const portalTheme = ref(null);
  
  // Fetch platform branding
  const fetchPlatformBranding = async (forceRefresh = false) => {
    try {
      // Add cache-busting parameter if force refresh is requested
      const params = forceRefresh ? { _t: Date.now() } : {};
      const response = await (await import('../services/api')).default.get('/platform-branding', { params });
      platformBranding.value = response.data;
      // Update branding version to force logo refresh
      brandingVersion.value = Date.now();
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

  const setPortalThemeData = (themeData) => {
    if (!themeData) return;
    portalTheme.value = themeData;
    portalAgency.value = {
      name: themeData.agencyName || themeData.name || portalAgency.value?.name || null,
      colorPalette: themeData.colorPalette || {},
      logoUrl: themeData.logoUrl || null,
      themeSettings: themeData.themeSettings || {},
      terminologySettings: themeData.terminologySettings || {}
    };
    applyTheme(themeData);
  };

  const setPortalThemeFromLoginTheme = (loginTheme) => {
    if (!loginTheme?.agency) return;
    setPortalThemeData({
      agencyName: loginTheme.agency.name,
      colorPalette: loginTheme.agency.colorPalette || {},
      logoUrl: loginTheme.agency.logoUrl || null,
      themeSettings: loginTheme.agency.themeSettings || {},
      terminologySettings: loginTheme.agency.terminologySettings || {}
    });
  };

  const clearPortalTheme = () => {
    portalAgency.value = null;
    portalTheme.value = null;

    // Clear any agency-specific CSS variables to avoid “flash” when returning to /login
    const root = document.documentElement;
    root.style.removeProperty('--agency-primary-color');
    root.style.removeProperty('--agency-secondary-color');
    root.style.removeProperty('--agency-accent-color');
    root.style.removeProperty('--agency-font-family');
    root.style.removeProperty('--agency-login-background');
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

  // Logo URL: Platform template logo or agency logo (no PlotTwistCo fallback)
  const logoUrl = computed(() => {
    // Portal theme takes precedence
    if (portalAgency.value?.logoUrl) {
      return portalAgency.value.logoUrl;
    }
    if (isSuperAdmin.value) {
      // Priority 1: Platform organization_logo_url (if set)
      if (platformBranding.value?.organization_logo_url) {
        if (import.meta.env.DEV) {
          console.log('[Branding] Using organization_logo_url:', platformBranding.value.organization_logo_url);
        }
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
        const logoUrl = `${apiBase}/uploads/${iconPath}`;
        if (import.meta.env.DEV) {
          console.log('[Branding] Constructed logoUrl from path:', {
            originalPath: platformBranding.value.organization_logo_path,
            cleanedPath: iconPath,
            finalUrl: logoUrl
          });
        }
        return logoUrl;
      }
      // No fallback - return null if no platform logo is set
      if (import.meta.env.DEV) {
        console.warn('[Branding] No platform logo available for logoUrl:', {
          hasOrgLogoUrl: !!platformBranding.value?.organization_logo_url,
          hasOrgLogoPath: !!platformBranding.value?.organization_logo_path
        });
      }
      return null;
    }
    // Check for logo_path first (uploaded), then logo_url (URL)
    const agency = agencyStore.currentAgency;
    if (agency?.logo_path) {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
      return `${apiBase}/${agency.logo_path}`;
    }
    return agency?.logo_url || null;
  });
  
  // Helper function to add cache-busting parameter to URL
  const addCacheBuster = (url) => {
    if (!url) return url;
    // Only add cache buster if URL doesn't already have query params
    // or if it's a local upload (not external URL)
    const isLocalUpload = url.includes('/uploads/') || url.startsWith('/');
    const hasQuery = url.includes('?');
    if (isLocalUpload && !hasQuery) {
      // Add branding version as cache buster for uploaded logos
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}v=${brandingVersion.value}`;
    }
    // For external URLs, add cache buster if no query params exist
    if (!hasQuery && !url.startsWith('http')) {
      return `${url}?v=${brandingVersion.value}`;
    }
    // For external URLs with existing query params, append version
    if (hasQuery && url.startsWith('http')) {
      return `${url}&v=${brandingVersion.value}`;
    }
    return url;
  };

  // Display logo URL (no PlotTwistCo fallback - show platform template logo or nothing)
  const displayLogoUrl = computed(() => {
    // Portal theme takes precedence
    if (portalAgency.value?.logoUrl) {
      return addCacheBuster(portalAgency.value.logoUrl);
    }
    if (isSuperAdmin.value || !authStore.isAuthenticated) {
      // Priority 1: Platform organization_logo_url (if set)
      if (platformBranding.value?.organization_logo_url) {
        if (import.meta.env.DEV) {
          console.log('[Branding] Using organization_logo_url for displayLogoUrl:', platformBranding.value.organization_logo_url);
        }
        return addCacheBuster(platformBranding.value.organization_logo_url);
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
        const logoUrl = `${apiBase}/uploads/${iconPath}`;
        if (import.meta.env.DEV) {
          console.log('[Branding] Constructed displayLogoUrl from path:', {
            originalPath: platformBranding.value.organization_logo_path,
            cleanedPath: iconPath,
            finalUrl: logoUrl
          });
        }
        return addCacheBuster(logoUrl);
      }
      // No fallback - return null if no platform logo is set (don't show PlotTwistCo logo)
      if (import.meta.env.DEV) {
        console.warn('[Branding] No platform logo available for displayLogoUrl:', {
          hasOrgLogoUrl: !!platformBranding.value?.organization_logo_url,
          hasOrgLogoPath: !!platformBranding.value?.organization_logo_path
        });
      }
      return null;
    }
    // Check for logo_path first (uploaded), then logo_url (URL)
    const agency = agencyStore.currentAgency;
    if (agency?.logo_path) {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
      let iconPath = agency.logo_path;
      if (iconPath.startsWith('/uploads/')) {
        iconPath = iconPath.substring('/uploads/'.length);
      } else if (iconPath.startsWith('/')) {
        iconPath = iconPath.substring(1);
      }
      const logoUrl = `${apiBase}/uploads/${iconPath}`;
      return addCacheBuster(logoUrl);
    }
    if (agency?.logo_url) {
      return addCacheBuster(agency.logo_url);
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

  // Get notification icon URL for a specific notification type
  // Priority: Agency-level icon > Platform-level icon > null (fallback to emoji)
  const toUploadsUrl = (filePath) => {
    if (!filePath) return null;
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';

    let clean = String(filePath);
    if (clean.startsWith('/uploads/')) clean = clean.substring('/uploads/'.length);
    else if (clean.startsWith('uploads/')) clean = clean.substring('uploads/'.length);
    else if (clean.startsWith('/')) clean = clean.substring(1);

    // Normalize legacy "icons/..." paths into uploads.
    if (clean.startsWith('icons/')) clean = `uploads/${clean}`;
    else if (!clean.startsWith('uploads/')) clean = `uploads/${clean}`;

    // Ensure we don't double-prefix.
    if (clean.startsWith('uploads/uploads/')) clean = clean.replace(/^uploads\/uploads\//, 'uploads/');

    return `${apiBase}/${clean}`;
  };

  const getNotificationIconUrl = (notificationType, agencyId = null) => {
    const iconFieldMap = {
      status_expired: 'status_expired_icon_path',
      temp_password_expired: 'temp_password_expired_icon_path',
      task_overdue: 'task_overdue_icon_path',
      onboarding_completed: 'onboarding_completed_icon_path',
      invitation_expired: 'invitation_expired_icon_path',
      first_login: 'first_login_icon_path',
      first_login_pending: 'first_login_pending_icon_path',
      password_changed: 'password_changed_icon_path'
    };

    const iconPathField = iconFieldMap[notificationType];
    if (!iconPathField) return null;

    // Priority 1: Agency-level icon (if agency is specified)
    if (agencyId !== null) {
      const agency = agencyStore.agencies?.find(a => a.id === agencyId);
      if (agency?.[iconPathField]) return toUploadsUrl(agency[iconPathField]);
    }

    // Priority 2: Platform-level icon
    const pb = platformBranding.value;
    if (pb?.[iconPathField]) return toUploadsUrl(pb[iconPathField]);

    return null;
  };

  // Get icon URL for a specific "My Dashboard" card
  // Priority: org-level icon > platform-level icon > null
  const getDashboardCardIconUrl = (cardId, organization = null) => {
    const iconFieldMap = {
      checklist: 'my_dashboard_checklist_icon_path',
      training: 'my_dashboard_training_icon_path',
      documents: 'my_dashboard_documents_icon_path',
      my: 'my_dashboard_my_account_icon_path',
      on_demand_training: 'my_dashboard_on_demand_training_icon_path'
    };

    const field = iconFieldMap[cardId];
    if (!field) return null;

    const org = organization || agencyStore.currentAgency;
    if (org?.[field]) return toUploadsUrl(org[field]);
    if (platformBranding.value?.[field]) return toUploadsUrl(platformBranding.value[field]);
    return null;
  };

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
    applyTheme,
    setPortalThemeData,
    setPortalThemeFromLoginTheme,
    clearPortalTheme,
    getNotificationIconUrl,
    getDashboardCardIconUrl
  };
});

