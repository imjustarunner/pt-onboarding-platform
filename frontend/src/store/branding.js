import { defineStore } from 'pinia';
import { ref, computed, reactive } from 'vue';
import { useAgencyStore } from './agency';
import { useAuthStore } from './auth';
import { getPortalUrl } from '../utils/subdomain';
import api from '../services/api';
import { loadFont } from '../utils/fontLoader';
import { getBackendBaseUrl, toUploadsUrl } from '../utils/uploadsUrl';
import { trackPromise } from '../utils/pageLoader';
import { preloadImages } from '../utils/preloadImages';

// In-flight deduplication + short TTL cache for fetchAgencyTheme.
// Prevents duplicate HTTP requests on redirect-chain navigations (/:slug → /:slug/login).
const _themeInflight = new Map();  // cacheKey → Promise
const _themeCache    = new Map();  // cacheKey → { data, ts }
const THEME_CACHE_TTL_MS = 5000;

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

  // Any authenticated user may resolve icon id → file path (GET /icons/:id is read-only; not the icon index).
  const canFetchIconsApi = computed(() => !!authStore.isAuthenticated);

  const iconFilePathById = (id) => {
    const key = String(id ?? '').trim();
    if (!key) return null;
    return iconFilePathCache.value?.[key] || null;
  };

  const iconUrlById = (id) => {
    const fp = iconFilePathById(id);
    if (!fp) {
      // Lazy, best-effort resolution: if a caller has an icon_id but we don't have the file_path yet,
      // kick off a fetch in the background (admins/support/super_admin only).
      try {
        const key = String(id ?? '').trim();
        if (key && canFetchIconsApi.value && !iconFetchInFlight.has(key) && !(key in (iconFilePathCache.value || {}))) {
          prefetchIconIds([key]);
        }
      } catch {
        // ignore
      }
      return null;
    }
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
  // For BYOD/custom domains we resolve the portal identifier from the request host via backend.
  const portalHostPortalUrl = ref(null); // e.g., "agency2" (portal_url or slug)
  const portalAgency = ref(null);

  // Theme settings from portal agency
  const portalTheme = ref(null);

  /**
   * Reactive slug for the CURRENT ROUTE's organization prefix (e.g. "nlu", "itsco", "").
   * Set by the router guard's beforeEach on EVERY navigation so computeds re-fire correctly.
   * Using window.location.pathname is NOT reactive — that's why colors only changed once.
   */
  const activeRouteSlug = ref('');
  const setActiveRouteSlug = (slug) => {
    activeRouteSlug.value = String(slug || '').trim().toLowerCase();
  };

  /**
   * Palette cache: slug → colorPalette object.
   * Using Vue reactive() so that reading _palettesBySlug[slug] inside a computed
   * automatically creates a dependency — no manual version counter needed.
   * Persists across navigations: once fetched for a slug, any subsequent swap to
   * that slug resolves instantly without waiting for the async fetch.
   */
  const _palettesBySlug = reactive({});  // slug → colorPalette
  const _logosBySlug = reactive({});     // slug → logoUrl
  const _iconsBySlug = reactive({});     // slug → organization icon URL (favicon / nav mark)
  const _themeSettingsBySlug = reactive({}); // slug → themeSettings (parallel to slug theme fetch)

  /**
   * Returns true when portalAgency's theme should override currentAgency.
   *  1. No portal agency loaded             → false
   *  2. Not authenticated                    → true  (portal/login page)
   *  3. activeRouteSlug matches portalSlug   → true  (e.g. /nlu/... with nlu portal loaded)
   *  4. activeRouteSlug set but no match    → false  (portal data is stale from previous nav)
   *  5. No route slug (platform/unscoped)    → true only when no currentAgency set
   */
  const shouldApplyPortalAgencyThemeFirst = () => {
    if (!portalAgency.value) return false;
    if (!authStore.isAuthenticated) return true;

    const routeSlug = activeRouteSlug.value; // reactive — updates on every navigation ✓
    const portalSlug = String(portalAgency.value.slug || '').trim().toLowerCase();

    if (routeSlug) {
      // Route slug is the authority: portal wins only when slugs match.
      return !!(portalSlug && routeSlug === portalSlug);
    }

    // No slug-scoped route (platform mode).
    if (!agencyStore.currentAgency) return true;
    return false;
  };
  
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
  
  // Fetch agency theme by portal URL.
  // Concurrent calls for the same slug+context share one in-flight request; results are
  // cached for THEME_CACHE_TTL_MS to absorb rapid re-navigations (e.g. redirect chains).
  const fetchAgencyTheme = async (portalUrl, options = {}) => {
    if (!portalUrl) {
      portalAgency.value = null;
      portalTheme.value = null;
      return;
    }

    const pageContext = String(options.pageContext || '').trim().toLowerCase();
    const cacheKey = pageContext ? `${portalUrl}::${pageContext}` : portalUrl;

    // Apply cached theme immediately (zero-flash on rapid re-navigation)
    const cached = _themeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < THEME_CACHE_TTL_MS) {
      _applyThemeData(cached.data, portalUrl);
      return;
    }

    // Coalesce concurrent requests for the same key
    if (_themeInflight.has(cacheKey)) {
      return _themeInflight.get(cacheKey);
    }

    const promise = (async () => {
      try {
        const params = pageContext ? { pageContext } : {};
        const response = await api.get(`/agencies/portal/${portalUrl}/theme`, {
          params,
          skipGlobalLoading: true,
          timeout: 15000
        });
        _themeCache.set(cacheKey, { data: response.data, ts: Date.now() });
        _applyThemeData(response.data, portalUrl);
      } catch (err) {
        const status = Number(err?.response?.status || 0);
        if (import.meta.env.DEV && status !== 401 && status !== 403) {
          console.error('Failed to fetch agency theme:', err);
        }
        portalAgency.value = null;
        portalTheme.value = null;
      } finally {
        _themeInflight.delete(cacheKey);
      }
    })();

    _themeInflight.set(cacheKey, promise);
    return promise;
  };

  const _applyThemeData = (data, portalUrl) => {
    portalTheme.value = data;
    portalAgency.value = {
      name: data.agencyName,
      colorPalette: data.colorPalette || {},
      logoUrl: data.logoUrl,
      iconUrl: data.iconUrl || null,
      themeSettings: data.themeSettings || {},
      terminologySettings: data.terminologySettings || {},
      slug: String(portalUrl || '').trim().toLowerCase()
    };

    // Persist palette + logo by slug so any future navigation to this slug
    // resolves colors immediately from _palettesBySlug without waiting for a fetch.
    // Because _palettesBySlug is reactive(), Vue detects new keys being set and
    // automatically invalidates any computed that read _palettesBySlug[slugKey].
    const slugKey = String(portalUrl || '').trim().toLowerCase();
    if (slugKey) {
      const cp = data.colorPalette || {};
      if (Object.keys(cp).length > 0) {
        _palettesBySlug[slugKey] = cp;
      }
      if (data.logoUrl) {
        _logosBySlug[slugKey] = data.logoUrl;
      }
      if (data.iconUrl) {
        _iconsBySlug[slugKey] = data.iconUrl;
      } else {
        delete _iconsBySlug[slugKey];
      }
      _themeSettingsBySlug[slugKey] = data.themeSettings && typeof data.themeSettings === 'object'
        ? data.themeSettings
        : {};
    }

    applyTheme(data);
    const portalNorm = String(portalUrl || '').trim().toLowerCase();
    if (authStore.isAuthenticated && agencyStore.currentAgency && !shouldApplyPortalAgencyThemeFirst()) {
      const ag = agencyStore.currentAgency;
      const agKeys = [ag.slug, ag.portal_url, ag.portalUrl]
        .map((x) => String(x || '').trim().toLowerCase())
        .filter(Boolean);
      if (!portalNorm || agKeys.includes(portalNorm)) {
        syncDocumentThemeFromSelectedAgency();
      }
    }
  };

  /** Public marketing hub (/p/:slug) — theme from `/public/marketing-pages/:slug/theme`. */
  const fetchPublicMarketingHubTheme = async (hubSlug) => {
    const s = String(hubSlug || '').trim().toLowerCase();
    if (!s) {
      portalAgency.value = null;
      portalTheme.value = null;
      return;
    }
    try {
      const response = await api.get(`/public/marketing-pages/${encodeURIComponent(s)}/theme`, {
        params: {},
        skipGlobalLoading: true,
        skipAuthRedirect: true,
        timeout: 15000
      });
      portalTheme.value = response.data;
      portalAgency.value = {
        name: response.data.agencyName,
        colorPalette: response.data.colorPalette || {},
        logoUrl: response.data.logoUrl,
        iconUrl: response.data.iconUrl || null,
        themeSettings: response.data.themeSettings || {},
        terminologySettings: response.data.terminologySettings || {}
      };
      applyTheme(response.data);
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      if (import.meta.env.DEV && status !== 401 && status !== 403) {
        console.error('Failed to fetch public marketing hub theme:', err);
      }
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
    
    // Apply colors (accent falls back to primary so glows/buttons match when agencies only set one brand color).
    // Also set :root --primary/--secondary/--accent so var(--agency-*) and global fallbacks stay in sync when switching orgs.
    if (colorPalette.primary) {
      root.style.setProperty('--agency-primary-color', colorPalette.primary);
      root.style.setProperty('--primary', colorPalette.primary);
    }
    if (colorPalette.secondary) {
      root.style.setProperty('--agency-secondary-color', colorPalette.secondary);
      root.style.setProperty('--secondary', colorPalette.secondary);
    }
    if (colorPalette.accent) {
      root.style.setProperty('--agency-accent-color', colorPalette.accent);
      root.style.setProperty('--accent', colorPalette.accent);
    } else if (colorPalette.primary) {
      root.style.setProperty('--agency-accent-color', colorPalette.primary);
      root.style.setProperty('--accent', colorPalette.primary);
    }
    
    // Apply fonts (theme_settings.fontFamily or club palette font stored in color_palette.fontFamily)
    const resolvedFont = themeSettings.fontFamily || colorPalette.fontFamily;
    if (resolvedFont) {
      root.style.setProperty('--agency-font-family', resolvedFont);
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
    if (resolvedFont) {
      const extractFamily = (cssValue) => {
        const s = String(cssValue || '').trim();
        const m = s.match(/^['"]([^'"]+)['"]/);
        if (m?.[1]) return m[1];
        return s.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      };

      const familyName = extractFamily(resolvedFont);
      if (familyName) {
        api
          .get('/fonts/public', {
            params: { agencyId: brandingAgencyId || undefined, familyName },
            skipAuthRedirect: true
          })
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

  /**
   * Push selected agency palette to documentElement so :root --agency-* / --primary match store computeds.
   * Call after hydrate when switching orgs (dropdown) or after route theme when slug matches currentAgency.
   */
  const syncDocumentThemeFromSelectedAgency = () => {
    if (!authStore.isAuthenticated) return;
    const a = agencyStore.currentAgency;
    if (!a?.id) return;
    // Guard: if we're on a slug-prefixed route for a DIFFERENT org (e.g. superadmin on
    // /nlu/admin/... while currentAgency is still ITSCO), do NOT clobber the route's theme.
    const routeSlug = activeRouteSlug.value;
    if (routeSlug) {
      const agSlug = String(a.slug || a.portal_url || a.portalUrl || '').trim().toLowerCase();
      if (agSlug && agSlug !== routeSlug) return;
    }
    // Legacy guard: also check portalAgency.slug mismatch.
    if (portalAgency.value?.slug) {
      const agSlug = String(a.slug || a.portal_url || a.portalUrl || '').trim().toLowerCase();
      const pSlug = String(portalAgency.value.slug).trim().toLowerCase();
      if (agSlug && pSlug && agSlug !== pSlug) return;
    }
    let colorPalette = {};
    let themeSettings = {};
    try {
      colorPalette =
        typeof a.color_palette === 'string' ? JSON.parse(a.color_palette || '{}') : (a.color_palette || {});
    } catch {
      colorPalette = {};
    }
    try {
      themeSettings =
        typeof a.theme_settings === 'string' ? JSON.parse(a.theme_settings || '{}') : (a.theme_settings || {});
    } catch {
      themeSettings = {};
    }
    const pb = platformBranding.value || {};
    const mergedPalette = {
      ...colorPalette,
      primary: colorPalette.primary || pb.primary_color,
      secondary: colorPalette.secondary || pb.secondary_color,
      accent: colorPalette.accent || colorPalette.primary || pb.accent_color
    };
    const mergedThemeSettings = {
      ...themeSettings,
      ...(colorPalette.fontFamily && !themeSettings.fontFamily
        ? { fontFamily: colorPalette.fontFamily }
        : {})
    };
    // Club affiliations store uploaded fonts on the parent tenant (SSC/SSTC), not the club row.
    // Font resolution for /fonts/public must use that tenant id or custom faces won't load.
    const orgType = String(a.organization_type || '').toLowerCase();
    const parentTenantId = Number(a.affiliated_agency_id || 0) || null;
    const fontBrandingAgencyId =
      (orgType === 'affiliation' || orgType === 'clubwebapp') && parentTenantId ? parentTenantId : a.id;
    applyTheme({
      colorPalette: mergedPalette,
      themeSettings: mergedThemeSettings,
      brandingAgencyId: fontBrandingAgencyId,
      agencyId: a.id
    });
  };

  const setPortalThemeData = (themeData) => {
    if (!themeData) return;
    portalTheme.value = themeData;
    portalAgency.value = {
      name: themeData.agencyName || themeData.name || portalAgency.value?.name || null,
      colorPalette: themeData.colorPalette || {},
      logoUrl: themeData.logoUrl || null,
      iconUrl: themeData.iconUrl || null,
      themeSettings: themeData.themeSettings || {},
      terminologySettings: themeData.terminologySettings || {},
      slug: portalAgency.value?.slug || portalHostPortalUrl.value || null
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
      iconUrl: loginTheme.agency.iconUrl || null,
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

  const clearPortalHostOverride = () => {
    portalHostPortalUrl.value = null;
    try {
      const host = window.location.hostname;
      sessionStorage.removeItem(`__pt_portal_host__:${host}`);
    } catch {
      // ignore
    }
  };
  
  // In-flight guard: deduplicate concurrent initializePortalTheme calls (avoids canceled requests).
  let portalThemeInitPromise = null;

  // Initialize portal theme on app load
  const initializePortalTheme = async () => {
    if (portalThemeInitPromise) return portalThemeInitPromise;

    portalThemeInitPromise = (async () => {
      try {
        // 1) Subdomain pattern: <portal>.app.<base-domain>
        const subdomainPortal = getPortalUrl();
        if (subdomainPortal) {
          portalHostPortalUrl.value = subdomainPortal;
          try {
            const cacheKey = `__pt_portal_host__:${window.location.hostname}`;
            const payload = JSON.stringify({ portalUrl: subdomainPortal, ts: Date.now() });
            sessionStorage.setItem(cacheKey, payload);
            localStorage.setItem(cacheKey, payload);
          } catch {
            /* ignore */
          }
          await fetchAgencyTheme(subdomainPortal);
          return;
        }

        // 2) Custom domain pattern: app.agency2.com -> resolve via backend by Host header.
        const host = window.location.hostname;
        const cacheKey = `__pt_portal_host__:${host}`;
        const cachedRaw = sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const cachedPortal = String(cached?.portalUrl || '').trim();
          if (cachedPortal) {
            portalHostPortalUrl.value = cachedPortal;
            try {
              localStorage.setItem(cacheKey, cachedRaw);
            } catch {
              /* ignore */
            }
            await fetchAgencyTheme(cachedPortal);
            return;
          }
        }

        // Call backend to resolve host -> portalUrl.
        // Pass host explicitly when API is on a different domain (e.g. app.itsco.health frontend
        // calling Cloud Run API) so the backend can resolve custom domains correctly.
        const clientHost = window.location.hostname;
        const resp = await api.get('/agencies/resolve', {
          params: { host: clientHost, _t: Date.now() },
          skipGlobalLoading: true,
          timeout: 15000
        });
        const resolved = String(resp?.data?.portalUrl || '').trim();
        if (resolved) {
          portalHostPortalUrl.value = resolved;
          const payload = JSON.stringify({ portalUrl: resolved, ts: Date.now() });
          try {
            sessionStorage.setItem(cacheKey, payload);
            localStorage.setItem(cacheKey, payload);
          } catch {
            // ignore
          }
          await fetchAgencyTheme(resolved);
        }
      } catch {
        // best effort; do not block app load
      } finally {
        portalThemeInitPromise = null;
      }
    })();

    return portalThemeInitPromise;
  };

  /**
   * Resolve which agency's palette to use for color computeds.
   * Priority (highest → lowest):
   *   1. portalAgency (fetched from route slug) when slug matches current URL
   *   2. currentAgency (the agency the user explicitly selected in the brand switcher)
   *   3. platformBranding fallback
   * This ensures /nlu/... always shows NLU colors even when currentAgency is ITSCO.
   */
  const _resolveActivePalette = () => {
    const routeSlug = activeRouteSlug.value;

    // 1. Route-slug cached palette — reactive because _palettesBySlug is reactive().
    //    Persists across swaps; no race with portalAgency.slug.
    if (routeSlug) {
      const cached = _palettesBySlug[routeSlug];
      if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
        return { palette: cached, source: 'portal' };
      }
    }

    // 2. currentAgency palette — available immediately after selectAgencyBrand hydrates.
    //    API may return color_palette (snake) OR colorPalette (camel) depending on endpoint.
    const agency = agencyStore.currentAgency;
    if (agency) {
      const raw = agency.color_palette ?? agency.colorPalette;
      if (raw) {
        try {
          const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (p && typeof p === 'object' && Object.keys(p).length > 0) {
            return { palette: p, source: 'currentAgency' };
          }
        } catch { /* ignore */ }
      }
    }

    return { palette: null, source: 'platform' };
  };

  /**
   * Theme settings for the active branding context (route slug cache, else current agency).
   * Used for flags like useExtendedBrandingColors without extra fetches.
   */
  const _resolveActiveThemeSettings = () => {
    const routeSlug = activeRouteSlug.value;
    if (routeSlug) {
      const cached = _themeSettingsBySlug[routeSlug];
      if (cached && typeof cached === 'object') return cached;
    }
    const agency = agencyStore.currentAgency;
    if (agency) {
      const raw = agency.theme_settings ?? agency.themeSettings;
      if (raw) {
        try {
          return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          return {};
        }
      }
    }
    return {};
  };

  /** When false, only primary/secondary/accent drive UI; extended palette keys are ignored (still saved on the org). */
  const useExtendedBrandingColors = computed(() => {
    const ts = _resolveActiveThemeSettings();
    return ts?.useExtendedBrandingColors !== false;
  });

  // Primary color based on branding mode
  const primaryColor = computed(() => {
    const { palette } = _resolveActivePalette();
    return palette?.primary || platformBranding.value?.primary_color || '#C69A2B';
  });

  // Secondary color based on branding mode
  const secondaryColor = computed(() => {
    const { palette } = _resolveActivePalette();
    return palette?.secondary || platformBranding.value?.secondary_color || '#1D2633';
  });
  
  // Accent color based on branding mode
  const accentColor = computed(() => {
    const { palette } = _resolveActivePalette();
    return palette?.accent || palette?.primary || platformBranding.value?.accent_color || '#3A4C6B';
  });

  // Helper: get parsed palette from agency or portal (agency/portal overrides platform)
  const getPalette = () => {
    const { palette } = _resolveActivePalette();
    return palette;
  };

  // Extended palette (optional overrides; fallbacks preserve existing display)
  const primaryHover = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.primaryHover || p?.primary_hover;
      if (v) return v;
    }
    return primaryColor.value; // fallback: same as primary (no change)
  });

  const backgroundColor = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.backgroundColor || p?.background || p?.background_color;
      if (v) return v;
    }
    return platformBranding.value?.background_color || '#F3F6FA';
  });

  const secondaryBackground = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.secondaryBackground || p?.secondary_background;
      if (v) return v;
    }
    return '#FFFFFF';
  });

  const dividerColor = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.dividerColor || p?.divider || p?.divider_color;
      if (v) return v;
    }
    return '#E3E8EF';
  });

  const successColor = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.successColor || p?.success || p?.success_color;
      if (v) return v;
    }
    return platformBranding.value?.success_color || '#2F8F83';
  });

  const dataNumbersColor = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.dataNumbersColor || p?.dataNumbers || p?.data_numbers_color;
      if (v) return v;
    }
    return secondaryColor.value;
  });

  const textPrimaryColor = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.textPrimary || p?.text_primary;
      if (v) return v;
    }
    return secondaryColor.value; // current behavior: text-primary uses secondary
  });

  const textSecondaryColor = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.textSecondary || p?.text_secondary;
      if (v) return v;
    }
    return accentColor.value; // current behavior: text-secondary uses accent
  });

  const textMutedColor = computed(() => {
    const p = getPalette();
    if (useExtendedBrandingColors.value) {
      const v = p?.textMuted || p?.text_muted;
      if (v) return v;
    }
    return '#8A97A6';
  });

  // Tagline
  const betaFeedbackEnabled = computed(() => !!platformBranding.value?.beta_feedback_enabled);

  const tagline = computed(() => {
    return platformBranding.value?.tagline || 'The gold standard for behavioral health workflows.';
  });

  // Logo URL: Portal (when applicable), then selected org, then platform template for super_admin
  const logoUrl = computed(() => {
    const routeSlug = activeRouteSlug.value;
    // _logosBySlug is reactive() so reading [routeSlug] here creates a dep automatically.
    if (routeSlug && _logosBySlug[routeSlug]) {
      return _logosBySlug[routeSlug];
    }
    // Legacy fallback: portalAgency (kept for non-slug routes / portal host context)
    if (portalAgency.value?.logoUrl && !routeSlug) {
      return portalAgency.value.logoUrl;
    }
    const agency = agencyStore.currentAgency;
    if (agency?.logo_path) {
      return toUploadsUrl(agency.logo_path);
    }
    if (agency?.icon_file_path) {
      return toUploadsUrl(agency.icon_file_path);
    }
    if (agency?.logo_url) {
      if (agency.logo_url.startsWith('http://') || agency.logo_url.startsWith('https://')) {
        return agency.logo_url;
      }
      const apiBase = getBackendBaseUrl();
      return `${apiBase}${agency.logo_url.startsWith('/') ? '' : '/'}${agency.logo_url}`;
    }
    if (isSuperAdmin.value) {
      if (platformBranding.value?.organization_logo_url) {
        if (import.meta.env.DEV) {
          console.log('[Branding] Using organization_logo_url:', platformBranding.value.organization_logo_url);
        }
        return platformBranding.value.organization_logo_url;
      }
      if (platformBranding.value?.organization_logo_path) {
        const u = toUploadsUrl(platformBranding.value.organization_logo_path);
        if (import.meta.env.DEV) {
          console.log('[Branding] Constructed logoUrl from path:', {
            originalPath: platformBranding.value.organization_logo_path,
            finalUrl: u
          });
        }
        return u;
      }
      if (platformBranding.value?.organization_logo_icon_path) {
        return toUploadsUrl(String(platformBranding.value.organization_logo_icon_path));
      }
      if (platformBranding.value?.organization_logo_icon_id) {
        const url = iconUrlById(platformBranding.value.organization_logo_icon_id);
        if (url) return url;
      }
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
    return null;
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

  // Display logo URL (portal → selected org → platform template / login)
  const displayLogoUrl = computed(() => {
    const routeSlug = activeRouteSlug.value;
    // _logosBySlug is reactive() so reading [routeSlug] here creates a dep automatically.
    if (routeSlug && _logosBySlug[routeSlug]) {
      return addCacheBuster(_logosBySlug[routeSlug]);
    }
    // Legacy fallback: portalAgency (kept for non-slug routes / portal host context)
    if (portalAgency.value?.logoUrl && !routeSlug) {
      return addCacheBuster(portalAgency.value.logoUrl);
    }
    const agency = agencyStore.currentAgency;
    if (agency?.logo_path) {
      return addCacheBuster(toUploadsUrl(agency.logo_path));
    }
    if (agency?.icon_file_path) {
      return addCacheBuster(toUploadsUrl(agency.icon_file_path));
    }
    if (agency?.logo_url) {
      if (agency.logo_url.startsWith('http://') || agency.logo_url.startsWith('https://')) {
        return addCacheBuster(agency.logo_url);
      }
      const apiBase = getBackendBaseUrl();
      const fullUrl = `${apiBase}${agency.logo_url.startsWith('/') ? '' : '/'}${agency.logo_url}`;
      return addCacheBuster(fullUrl);
    }
    if (isSuperAdmin.value || !authStore.isAuthenticated) {
      if (platformBranding.value?.organization_logo_url) {
        if (import.meta.env.DEV) {
          console.log('[Branding] Using organization_logo_url for displayLogoUrl:', platformBranding.value.organization_logo_url);
        }
        return addCacheBuster(platformBranding.value.organization_logo_url);
      }
      if (platformBranding.value?.organization_logo_path) {
        const u = toUploadsUrl(platformBranding.value.organization_logo_path);
        if (import.meta.env.DEV) {
          console.log('[Branding] Constructed displayLogoUrl from path:', {
            originalPath: platformBranding.value.organization_logo_path,
            finalUrl: u
          });
        }
        return addCacheBuster(u);
      }
      if (platformBranding.value?.organization_logo_icon_path) {
        return addCacheBuster(toUploadsUrl(String(platformBranding.value.organization_logo_icon_path)));
      }
      if (platformBranding.value?.organization_logo_icon_id) {
        const url = iconUrlById(platformBranding.value.organization_logo_icon_id);
        if (url) return addCacheBuster(url);
      }
      if (import.meta.env.DEV && !window.location.pathname.includes('/intake/')) {
        console.warn('[Branding] No platform logo available for displayLogoUrl:', {
          hasOrgLogoUrl: !!platformBranding.value?.organization_logo_url,
          hasOrgLogoPath: !!platformBranding.value?.organization_logo_path,
          hasOrgLogoIconPath: !!platformBranding.value?.organization_logo_icon_path,
          hasOrgLogoIconId: !!platformBranding.value?.organization_logo_icon_id
        });
      }
      return null;
    }
    return null;
  });

  /** Master organization icon for compact chrome (nav, favicon) — prefers icon over wide logo. */
  const displayChromeIconUrl = computed(() => {
    const routeSlug = activeRouteSlug.value;
    if (routeSlug) {
      const cachedIcon = _iconsBySlug[routeSlug];
      if (cachedIcon) return addCacheBuster(cachedIcon);
      const pSlug = String(portalAgency.value?.slug || '').trim().toLowerCase();
      if (pSlug === routeSlug && portalAgency.value?.iconUrl) {
        return addCacheBuster(portalAgency.value.iconUrl);
      }
    } else if (portalAgency.value?.iconUrl) {
      return addCacheBuster(portalAgency.value.iconUrl);
    }
    const agency = agencyStore.currentAgency;
    if (agency?.icon_file_path) {
      return addCacheBuster(toUploadsUrl(agency.icon_file_path));
    }
    const iconId = agency?.icon_id ?? agency?.iconId;
    if (iconId) {
      const u = iconUrlById(iconId);
      if (u) return addCacheBuster(u);
    }
    if (isSuperAdmin.value || !authStore.isAuthenticated) {
      if (platformBranding.value?.organization_logo_icon_path) {
        return addCacheBuster(toUploadsUrl(String(platformBranding.value.organization_logo_icon_path)));
      }
      if (platformBranding.value?.organization_logo_icon_id) {
        const url = iconUrlById(platformBranding.value.organization_logo_icon_id);
        if (url) return addCacheBuster(url);
      }
    }
    return null;
  });
  
  // Get theme settings (fonts, login background, etc.)
  const themeSettings = computed(() => {
    if (shouldApplyPortalAgencyThemeFirst() && portalAgency.value?.themeSettings) {
      return portalAgency.value.themeSettings;
    }
    const a = agencyStore.currentAgency;
    if (a?.theme_settings) {
      try {
        return typeof a.theme_settings === 'string'
          ? JSON.parse(a.theme_settings)
          : (a.theme_settings || {});
      } catch {
        return {};
      }
    }
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
      return (
        agencyStore.currentAgency?.name ||
        platformBranding.value?.organization_name ||
        ''
      );
    }
    return agencyStore.currentAgency?.name || platformBranding.value?.organization_name || '';
  });

  // Get terminology setting (e.g., "People Operations", "Human Resources", etc.)
  const peopleOpsTerm = computed(() => {
    // For super admins, selected org terminology first (agency switcher), then platform
    if (isSuperAdmin.value) {
      if (agencyStore.currentAgency?.terminology_settings) {
        try {
          const terminology =
            typeof agencyStore.currentAgency.terminology_settings === 'string'
              ? JSON.parse(agencyStore.currentAgency.terminology_settings)
              : agencyStore.currentAgency.terminology_settings;
          if (terminology?.peopleOpsTerm && String(terminology.peopleOpsTerm).trim()) {
            return String(terminology.peopleOpsTerm).trim();
          }
        } catch {
          /* ignore */
        }
      }
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
      const agency = resolveAgencyByIdLocal(agencyId);
      const url = resolveFromOrg(resolveIconSourceOrganization(agency));
      if (url) return url;
    }

    // Priority 2: Platform-level icon
    return resolveFromOrg(platformBranding.value);
  };

  /**
   * Dashboard/school icon helpers accept org as undefined | null | object | numeric id.
   * Numeric ids must resolve to a full agency row so *_icon_path fields work (Dashboard passes currentAgencyId).
   */
  const resolveOrganizationParamForIcons = (organization) => {
    if (organization === undefined) return undefined;
    if (organization === null) return null;
    if (typeof organization === 'object') return organization;
    if (typeof organization === 'number') {
      const id = Number(organization);
      if (!Number.isFinite(id) || id <= 0) return undefined;
      const cur = agencyStore.currentAgency;
      if (cur && Number(cur.id || 0) === id) return cur;
      const userList = agencyStore.userAgencies;
      if (Array.isArray(userList)) {
        const found = userList.find((a) => Number(a?.id || 0) === id);
        if (found) return found;
      }
      const all = agencyStore.agencies;
      if (Array.isArray(all)) {
        const found = all.find((a) => Number(a?.id || 0) === id);
        if (found) return found;
      }
      return undefined;
    }
    return organization;
  };

  const parseThemeSettingsObject = (org) => {
    const raw = org?.theme_settings ?? org?.themeSettings;
    if (!raw) return {};
    if (typeof raw === 'object') return raw || {};
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  };

  const resolveAgencyByIdLocal = (agencyId) => {
    const id = Number(agencyId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const cur = agencyStore.currentAgency;
    if (cur && Number(cur.id || 0) === id) return cur;
    const all = Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [];
    const fromAll = all.find((a) => Number(a?.id || 0) === id);
    if (fromAll) return fromAll;
    const mine = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
    return mine.find((a) => Number(a?.id || 0) === id) || null;
  };

  const resolveIconSourceOrganization = (org) => {
    if (!org || typeof org !== 'object') return org;
    const orgType = String(org.organization_type || org.organizationType || 'agency').toLowerCase();
    const isChildOrg = ['school', 'program', 'learning', 'clinical', 'affiliation', 'clubwebapp'].includes(orgType);
    if (!isChildOrg) return org;
    const themeSettings = parseThemeSettingsObject(org);
    const useAffiliatedAgencyIcons = themeSettings.useAffiliatedAgencyIcons !== false;
    if (!useAffiliatedAgencyIcons) return org;
    const parentId = Number(
      org.affiliated_agency_id ??
      org.affiliatedAgencyId ??
      org.agency_id ??
      org.agencyId ??
      0
    );
    if (!Number.isFinite(parentId) || parentId <= 0 || parentId === Number(org.id || 0)) return org;
    const parent = resolveAgencyByIdLocal(parentId);
    return parent || org;
  };

  // Get icon URL for a specific "My Dashboard" card
  // Priority: org-level icon > platform-level icon > null
  // organization param is tri-state:
  // - undefined: use agencyStore.currentAgency
  // - null: force platform branding (ignore currentAgency)
  // - object: use that org as override
  // - number: resolve agency row by id (same icons as event portal + rail)
  const getDashboardCardIconUrl = (cardId, organization = undefined) => {
    const iconFieldMap = {
      checklist: 'my_dashboard_checklist_icon_path',
      momentum_list: 'my_dashboard_momentum_list_icon_path',
      training: 'my_dashboard_training_icon_path',
      documents: 'my_dashboard_documents_icon_path',
      my: 'my_dashboard_my_account_icon_path',
      my_schedule: 'my_dashboard_my_schedule_icon_path',
      clients: 'my_dashboard_clients_icon_path',
      on_demand_training: 'my_dashboard_on_demand_training_icon_path',
      payroll: 'my_dashboard_payroll_icon_path',
      submit: 'my_dashboard_submit_icon_path',
      communications: 'my_dashboard_communications_icon_path',
      chats: 'my_dashboard_chats_icon_path',
      contacts: 'my_dashboard_contacts_icon_path',
      staff: 'my_dashboard_staff_icon_path',
      notifications: 'my_dashboard_notifications_icon_path',
      supervision: 'my_dashboard_supervision_icon_path',
      clinical_note_generator: 'my_dashboard_clinical_note_generator_icon_path',
      tools_aids: 'my_dashboard_clinical_note_generator_icon_path',
      momentum_stickies: 'my_dashboard_momentum_stickies_icon_path',
      challenges: 'my_dashboard_training_icon_path',
      social_feeds: 'my_dashboard_communications_icon_path'
    };

    const field = iconFieldMap[cardId];
    if (!field) return null;

    const idField = field.replace(/_icon_path$/, '_icon_id');
    const orgParam = resolveOrganizationParamForIcons(organization);
    const orgBase = orgParam === undefined ? agencyStore.currentAgency : orgParam;
    const org = resolveIconSourceOrganization(orgBase);
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
    // momentum_list falls back to checklist when no dedicated icon set
    if (cardId === 'momentum_list') {
      return getDashboardCardIconUrl('checklist', organization);
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
      faq: 'school_portal_faq_icon_path',
      parent_qr: 'school_portal_parent_qr_icon_path',
      parent_sign: 'school_portal_parent_sign_icon_path',
      upload_packet: 'school_portal_upload_packet_icon_path',
      public_documents: 'school_portal_public_documents_icon_path',
      announcements: 'school_portal_announcements_icon_path',
      messages: 'school_portal_messages_icon_path'
    };
    const field = iconFieldMap[cardId];
    if (!field) return null;
    const idField = field.replace(/_icon_path$/, '_icon_id');

    const orgParam = resolveOrganizationParamForIcons(organization);
    const orgBase = orgParam === undefined ? agencyStore.currentAgency : orgParam;
    const org = resolveIconSourceOrganization(orgBase);
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
    // Messages card: fall back to chats icon (same as My Dashboard Communications/Chats cards)
    if (cardId === 'messages') {
      return getDashboardCardIconUrl('chats', organization);
    }
    return null;
  };

  // Admin dashboard quick-actions
  const getAdminQuickActionIconUrl = (actionKey, agencyOverride = null) => {
    const iconFieldMap = {
      progress_dashboard: 'progress_dashboard_icon_path',
      manage_clients: 'manage_clients_icon_path',
      manage_agencies: 'manage_agencies_icon_path',
      // Reuse the "My Dashboard" icon for Note Aid / Tools & Aids quick action.
      clinical_note_generator: 'my_dashboard_clinical_note_generator_icon_path',
      tools_aids: 'my_dashboard_clinical_note_generator_icon_path',
      school_overview: 'school_overview_icon_path',
      program_overview: 'program_overview_icon_path',
      manage_modules: 'manage_modules_icon_path',
      manage_documents: 'manage_documents_icon_path',
      manage_users: 'manage_users_icon_path',
      external_calendar_audit: 'external_calendar_audit_icon_path',
      skill_builders_availability: 'skill_builders_availability_icon_path',
      provider_availability_dashboard: 'provider_availability_dashboard_icon_path',
      executive_report: 'executive_report_icon_path',
      admin_dashboard: 'company_profile_icon_path',
      dashboard_notifications: 'dashboard_notifications_icon_path',
      dashboard_communications: 'dashboard_communications_icon_path',
      dashboard_chats: 'dashboard_chats_icon_path',
      dashboard_payroll: 'dashboard_payroll_icon_path',
      dashboard_billing: 'dashboard_billing_icon_path',
      platform_settings: 'platform_settings_icon_path',
      view_all_progress: 'view_all_progress_icon_path',
      settings: 'settings_icon_path',
      schedule: 'my_dashboard_my_schedule_icon_path',
      intake_links: 'intake_links_icon_path',
      audit_center: 'audit_center_icon_path',
      marketing_social: 'marketing_social_icon_path',
      presence: 'presence_icon_path',
      beta_feedback: 'beta_feedback_icon_path'
    };
    const field = iconFieldMap[actionKey];
    if (!field) return null;
    const idField = field.replace(/_icon_path$/, '_icon_id');

    const org = resolveIconSourceOrganization(agencyOverride || agencyStore.currentAgency);
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

  // Club quick action icons (Add Member, Add Season, Settings) - customizable per club
  const getClubQuickActionIconUrl = (actionKey, agencyOverride = null) => {
    const iconFieldMap = {
      add_member: 'club_add_member_icon_path',
      add_season: 'club_add_season_icon_path',
      settings: 'club_settings_icon_path'
    };
    const field = iconFieldMap[actionKey];
    if (!field) return null;
    const idField = field.replace(/_icon_path$/, '_icon_id');

    const org = resolveIconSourceOrganization(agencyOverride || agencyStore.currentAgency);
    if (org?.[field]) return toUploadsUrl(org[field]);
    if (org?.[idField]) {
      const url = iconUrlById(org[idField]);
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
    useExtendedBrandingColors,
    primaryHover,
    backgroundColor,
    secondaryBackground,
    dividerColor,
    successColor,
    dataNumbersColor,
    textPrimaryColor,
    textSecondaryColor,
    textMutedColor,
    logoUrl,
    displayLogoUrl,
    displayChromeIconUrl,
    plotTwistCoLogoUrl,
    agencyName,
    displayName,
    peopleOpsTerm,
    navigationTitle,
    betaFeedbackEnabled,
    tagline,
    platformBranding,
    fetchPlatformBranding,
    portalAgency,
    portalTheme,
    portalHostPortalUrl,
    themeSettings,
    loginBackground,
    fontFamily,
    fetchAgencyTheme,
    fetchPublicMarketingHubTheme,
    initializePortalTheme,
    applyTheme,
    syncDocumentThemeFromSelectedAgency,
    setPortalThemeData,
    setPortalThemeFromLoginTheme,
    clearPortalTheme,
    clearPortalHostOverride,
    getNotificationIconUrl,
    getDashboardCardIconUrl,
    getSchoolPortalCardIconUrl,
    getAdminQuickActionIconUrl,
    getClubQuickActionIconUrl,
    // Icon-id resolution helpers (admin/support/super_admin only)
    prefetchIconIds,
    iconUrlById,
    iconFilePathById,
    setPlatformBrandingFromResponse,
    // Route-scoped branding (set by router guard on every navigation)
    activeRouteSlug,
    setActiveRouteSlug
  };
});

