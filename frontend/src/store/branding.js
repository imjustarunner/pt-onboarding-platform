import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAgencyStore } from './agency';
import { useAuthStore } from './auth';
import { getPortalUrl } from '../utils/subdomain';
import api from '../services/api';
import { loadFont } from '../utils/fontLoader';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { trackPromise } from '../utils/pageLoader';
import { preloadImages } from '../utils/preloadImages';

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
  const platformBrandingFetchSeq = ref(0);

  // Icon file-path cache for resolving *_icon_id when *_icon_path is missing.
  // IMPORTANT: Do NOT fetch the full /icons index (it can be huge and slow).
  const iconFilePathCache = ref({}); // { [id]: file_path }
  const iconFetchInFlight = new Map(); // id -> Promise<string|null>

  const canFetchIconsApi = computed(() => {
    const r = String(authStore.user?.role || '').toLowerCase();
    return r === 'admin' || r === 'super_admin' || r === 'support';
  });

  const iconFilePathById = (id) => {
    const key = String(id ?? '').trim();
    if (!key) return null;
    return iconFilePathCache.value?.[key] || null;
  };

  const iconUrlById = (id) => {
    const fp = iconFilePathById(id);
    if (!fp) return null;
    return toUploadsUrl(fp);
  };

  const prefetchIconIds = async (ids) => {
    try {
      if (!canFetchIconsApi.value) return;
      const list = Array.from(new Set((ids || []).map((x) => String(x ?? '').trim()).filter(Boolean)));
      if (list.length === 0) return;

      const tasks = list.map((key) => {
        if (iconFilePathCache.value?.[key]) return Promise.resolve(iconFilePathCache.value[key]);
        if (iconFetchInFlight.has(key)) return iconFetchInFlight.get(key);

        const p = api
          .get(`/icons/${encodeURIComponent(key)}`)
          .then((res) => {
            const fp = res?.data?.file_path || null;
            iconFilePathCache.value = { ...iconFilePathCache.value, [key]: fp };
            return fp;
          })
          .catch(() => {
            iconFilePathCache.value = { ...iconFilePathCache.value, [key]: null };
            return null;
          })
          .finally(() => {
            iconFetchInFlight.delete(key);
          });

        iconFetchInFlight.set(key, p);
        return p;
      });

      await Promise.all(tasks);
    } catch {
      // ignore
    }
  };

  // Portal agency (detected from subdomain)
  const portalAgency = ref(null);
  
  // Theme settings from portal agency
  const portalTheme = ref(null);
  
  // Fetch platform branding
  const fetchPlatformBranding = async (forceRefresh = false) => {
    const seq = ++platformBrandingFetchSeq.value;
    try {
      // Add cache-busting parameter if force refresh is requested
      const params = forceRefresh ? { _t: Date.now() } : {};
      const response = await (await import('../services/api')).default.get('/platform-branding', { params });
      // Prevent stale/slow responses from clobbering newer platformBranding (race condition).
      if (seq !== platformBrandingFetchSeq.value) return;
      platformBranding.value = response.data;
      // Update branding version to force logo refresh
      brandingVersion.value = Date.now();

      // Best-effort: preload platform icons/logos so pages feel "fully populated" before the global loader disappears.
      try {
        const pb = platformBranding.value || {};
        // Best-effort: prefetch icon IDs so *_icon_id fallbacks resolve immediately.
        // (This matches how SettingsModal prefetches sidebar icons; we do it platform-wide here.)
        try {
          const ids = Object.entries(pb)
            .filter(([k, v]) => k.endsWith('_icon_id') && v !== null && v !== undefined && v !== '')
            .map(([, v]) => v);
          trackPromise(prefetchIconIds(ids), 'Loading…');
        } catch {
          // ignore
        }

        const paths = Object.entries(pb)
          .filter(([k, v]) => !!v && (k.endsWith('_icon_path') || k.endsWith('_logo_path') || k.endsWith('_icon_url') || k.endsWith('_logo_url')))
          .map(([, v]) => toUploadsUrl(String(v)))
          .filter(Boolean);
        trackPromise(preloadImages(paths, { concurrency: 6, timeoutMs: 8000 }), 'Loading…');
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Failed to fetch platform branding:', err);
      // Don't let a failed/stale request wipe already-correct state.
      if (seq !== platformBrandingFetchSeq.value) return;
      if (!platformBranding.value) {
        // Use defaults only if we have nothing at all.
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
    }
  };

  const setPlatformBrandingFromResponse = async (pb) => {
    // Treat direct-set as the newest state so older GETs can't overwrite it.
    platformBrandingFetchSeq.value++;
    platformBranding.value = pb || null;
    brandingVersion.value = Date.now();
    try {
      const next = pb || {};
      const ids = Object.entries(next)
        .filter(([k, v]) => k.endsWith('_icon_id') && v !== null && v !== undefined && v !== '')
        .map(([, v]) => v);
      await prefetchIconIds(ids);
    } catch {
      // ignore
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
    const brandingAgencyId = themeData.brandingAgencyId || themeData.agencyId || null;
    
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

    // Best-effort: if this font family refers to an uploaded font, load it so the CSS family resolves.
    // This is important for portal/login screens where we don't have auth but still need branded fonts.
    if (themeSettings.fontFamily) {
      const extractFamily = (cssValue) => {
        const s = String(cssValue || '').trim();
        const m = s.match(/^['"]([^'"]+)['"]/);
        if (m?.[1]) return m[1];
        return s.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      };

      const familyName = extractFamily(themeSettings.fontFamily);
      if (familyName) {
        api
          .get('/fonts/public', { params: { agencyId: brandingAgencyId || undefined, familyName } })
          .then((res) => {
            const fonts = res.data || [];
            if (Array.isArray(fonts) && fonts.length > 0) {
              // Load first available face for this family.
              loadFont(fonts[0]).catch(() => {});
            }
          })
          .catch(() => {});
      }
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
      brandingAgencyId: loginTheme.agency.brandingAgencyId || null,
      portalOrganizationId: loginTheme.agency.portalOrganizationId || null,
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
    if (!authStore.isAuthenticated) {
      return platformBranding.value?.primary_color || '#C69A2B'; // Auric Gold
    }
    // Use agency colors when an agency context is selected (including super_admin).
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
    if (!authStore.isAuthenticated) {
      return platformBranding.value?.secondary_color || '#1D2633'; // Deep Ink
    }
    // Use agency colors when an agency context is selected (including super_admin).
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
    if (!authStore.isAuthenticated) {
      return platformBranding.value?.accent_color || '#3A4C6B'; // Slate Blue
    }
    // Use agency colors when an agency context is selected (including super_admin).
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
      // Priority 3: Platform organization_logo_icon_path / organization_logo_icon_id (icon-based logo selection)
      if (platformBranding.value?.organization_logo_icon_path) {
        return toUploadsUrl(String(platformBranding.value.organization_logo_icon_path));
      }
      if (platformBranding.value?.organization_logo_icon_id) {
        const url = iconUrlById(platformBranding.value.organization_logo_icon_id);
        if (url) return url;
      }
      // No fallback - return null if no platform logo is set
      if (import.meta.env.DEV) {
        console.warn('[Branding] No platform logo available for logoUrl:', {
          hasOrgLogoUrl: !!platformBranding.value?.organization_logo_url,
          hasOrgLogoPath: !!platformBranding.value?.organization_logo_path,
          hasOrgLogoIconPath: !!platformBranding.value?.organization_logo_icon_path,
          hasOrgLogoIconId: !!platformBranding.value?.organization_logo_icon_id
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
    // Fallback to master icon (icon_id -> icon_file_path) when agency has no logo fields.
    if (agency?.icon_file_path) {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
      let iconPath = String(agency.icon_file_path);
      if (iconPath.startsWith('/uploads/')) iconPath = iconPath.substring('/uploads/'.length);
      else if (iconPath.startsWith('/')) iconPath = iconPath.substring(1);
      return `${apiBase}/uploads/${iconPath}`;
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
      // Priority 3: Platform organization_logo_icon_path / organization_logo_icon_id (icon-based logo selection)
      if (platformBranding.value?.organization_logo_icon_path) {
        return addCacheBuster(toUploadsUrl(String(platformBranding.value.organization_logo_icon_path)));
      }
      if (platformBranding.value?.organization_logo_icon_id) {
        const url = iconUrlById(platformBranding.value.organization_logo_icon_id);
        if (url) return addCacheBuster(url);
      }
      // No fallback - return null if no platform logo is set (don't show PlotTwistCo logo)
      if (import.meta.env.DEV) {
        console.warn('[Branding] No platform logo available for displayLogoUrl:', {
          hasOrgLogoUrl: !!platformBranding.value?.organization_logo_url,
          hasOrgLogoPath: !!platformBranding.value?.organization_logo_path,
          hasOrgLogoIconPath: !!platformBranding.value?.organization_logo_icon_path,
          hasOrgLogoIconId: !!platformBranding.value?.organization_logo_icon_id
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
    // Fallback to master icon (icon_id -> icon_file_path) when agency has no logo fields.
    if (agency?.icon_file_path) {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
      let iconPath = String(agency.icon_file_path);
      if (iconPath.startsWith('/uploads/')) iconPath = iconPath.substring('/uploads/'.length);
      else if (iconPath.startsWith('/')) iconPath = iconPath.substring(1);
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
  const getNotificationIconUrl = (notificationType, agencyId = null) => {
    const iconFieldBaseMap = {
      status_expired: 'status_expired_icon',
      temp_password_expired: 'temp_password_expired_icon',
      task_overdue: 'task_overdue_icon',
      onboarding_completed: 'onboarding_completed_icon',
      invitation_expired: 'invitation_expired_icon',
      first_login: 'first_login_icon',
      first_login_pending: 'first_login_pending_icon',
      password_changed: 'password_changed_icon',
      // Ticketing / school staff help desk
      support_ticket_created: 'support_ticket_created_icon'
    };

    const base = iconFieldBaseMap[notificationType];
    if (!base) return null;

    const iconPathField = `${base}_path`;
    const iconIdField = `${base}_id`;

    const resolveFromOrg = (org) => {
      if (!org) return null;
      if (org?.[iconPathField]) return toUploadsUrl(org[iconPathField]);
      if (org?.[iconIdField]) {
        const url = iconUrlById(org[iconIdField]);
        if (url) return url;
        // Best-effort: fetch icon path lazily so the UI can re-render with the icon.
        prefetchIconIds([org[iconIdField]]).catch(() => {});
      }
      return null;
    };

    // Priority 1: Agency-level icon (if agency is specified)
    if (agencyId !== null) {
      const agency = agencyStore.agencies?.find(a => a.id === agencyId);
      const url = resolveFromOrg(agency);
      if (url) return url;
    }

    // Priority 2: Platform-level icon
    return resolveFromOrg(platformBranding.value);
  };

  // Get icon URL for a specific "My Dashboard" card
  // Priority: org-level icon > platform-level icon > null
  // organization param is tri-state:
  // - undefined: use agencyStore.currentAgency
  // - null: force platform branding (ignore currentAgency)
  // - object: use that org as override
  const getDashboardCardIconUrl = (cardId, organization = undefined) => {
    const iconFieldMap = {
      checklist: 'my_dashboard_checklist_icon_path',
      training: 'my_dashboard_training_icon_path',
      documents: 'my_dashboard_documents_icon_path',
      my: 'my_dashboard_my_account_icon_path',
      my_schedule: 'my_dashboard_my_schedule_icon_path',
      on_demand_training: 'my_dashboard_on_demand_training_icon_path',
      payroll: 'my_dashboard_payroll_icon_path',
      submit: 'my_dashboard_submit_icon_path',
      communications: 'my_dashboard_communications_icon_path',
      chats: 'my_dashboard_chats_icon_path',
      notifications: 'my_dashboard_notifications_icon_path'
    };

    const field = iconFieldMap[cardId];
    if (!field) return null;

    const idField = field.replace(/_icon_path$/, '_icon_id');
    const org = organization === undefined ? agencyStore.currentAgency : organization;
    if (org?.[field]) return toUploadsUrl(org[field]);
    if (org?.[idField]) {
      const url = iconUrlById(org[idField]);
      if (url) return url;
    }
    if (platformBranding.value?.[field]) return toUploadsUrl(platformBranding.value[field]);
    if (platformBranding.value?.[idField]) {
      const url = iconUrlById(platformBranding.value[idField]);
      if (url) return url;
    }
    return null;
  };

  // Get icon URL for a specific School Portal home card
  // Priority: agency override > platform default > null
  // organization param follows the same tri-state convention as getDashboardCardIconUrl
  const getSchoolPortalCardIconUrl = (cardId, organization = undefined) => {
    const iconFieldMap = {
      providers: 'school_portal_providers_icon_path',
      days: 'school_portal_days_icon_path',
      roster: 'school_portal_roster_icon_path',
      skills_groups: 'school_portal_skills_groups_icon_path',
      contact_admin: 'school_portal_contact_admin_icon_path',
      school_staff: 'school_portal_school_staff_icon_path',
      parent_qr: 'school_portal_parent_qr_icon_path',
      parent_sign: 'school_portal_parent_sign_icon_path',
      upload_packet: 'school_portal_upload_packet_icon_path',
      public_documents: 'school_portal_public_documents_icon_path'
    };
    const field = iconFieldMap[cardId];
    if (!field) return null;
    const idField = field.replace(/_icon_path$/, '_icon_id');

    const org = organization === undefined ? agencyStore.currentAgency : organization;
    if (org?.[field]) return toUploadsUrl(org[field]);
    if (org?.[idField]) {
      const url = iconUrlById(org[idField]);
      if (url) return url;
    }
    if (platformBranding.value?.[field]) return toUploadsUrl(platformBranding.value[field]);
    if (platformBranding.value?.[idField]) {
      const url = iconUrlById(platformBranding.value[idField]);
      if (url) return url;
    }
    return null;
  };

  // Admin dashboard quick-actions
  const getAdminQuickActionIconUrl = (actionKey, agencyOverride = null) => {
    const iconFieldMap = {
      progress_dashboard: 'progress_dashboard_icon_path',
      manage_clients: 'manage_clients_icon_path',
      manage_agencies: 'manage_agencies_icon_path',
      school_overview: 'school_overview_icon_path',
      program_overview: 'school_overview_icon_path',
      manage_modules: 'manage_modules_icon_path',
      manage_documents: 'manage_documents_icon_path',
      manage_users: 'manage_users_icon_path',
      external_calendar_audit: 'external_calendar_audit_icon_path',
      skill_builders_availability: 'skill_builders_availability_icon_path',
      provider_availability_dashboard: 'company_profile_icon_path',
      executive_report: 'view_all_progress_icon_path',
      admin_dashboard: 'company_profile_icon_path',
      dashboard_notifications: 'dashboard_notifications_icon_path',
      dashboard_communications: 'dashboard_communications_icon_path',
      dashboard_chats: 'dashboard_chats_icon_path',
      dashboard_payroll: 'dashboard_payroll_icon_path',
      dashboard_billing: 'dashboard_billing_icon_path',
      platform_settings: 'platform_settings_icon_path',
      view_all_progress: 'view_all_progress_icon_path',
      settings: 'settings_icon_path'
    };
    const field = iconFieldMap[actionKey];
    if (!field) return null;
    const idField = field.replace(/_icon_path$/, '_icon_id');

    const org = agencyOverride || agencyStore.currentAgency;
    if (org?.[field]) return toUploadsUrl(org[field]);
    if (org?.[idField]) {
      const url = iconUrlById(org[idField]);
      if (url) return url;
    }
    if (platformBranding.value?.[field]) return toUploadsUrl(platformBranding.value[field]);
    if (platformBranding.value?.[idField]) {
      const url = iconUrlById(platformBranding.value[idField]);
      if (url) return url;
    }
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
    getDashboardCardIconUrl,
    getSchoolPortalCardIconUrl,
    getAdminQuickActionIconUrl,
    // Icon-id resolution helpers (admin/support/super_admin only)
    prefetchIconIds,
    iconUrlById,
    iconFilePathById,
    setPlatformBrandingFromResponse
  };
});

