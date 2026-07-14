import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';
import { getCached, setCached } from '../utils/adminApiCache';
import {
  DEMO_WINDOW_AGENCY_KEY,
  getDemoWindowAgency,
  isDemoWindowSession
} from '../utils/demoWindowSession';

export const useAgencyStore = defineStore('agency', () => {
  const agencies = ref([]);
  const userAgencies = ref([]);
  const tracks = ref([]);
  let userAgenciesInFlight = null;
  /** Deduplicate parallel GET /agencies (super_admin); avoids 3× 300KB+ responses on one screen load. */
  let agenciesAllInFlight = null;
  const safeJsonParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const currentAgency = ref(
    isDemoWindowSession()
      ? (getDemoWindowAgency() || null)
      : safeJsonParse(localStorage.getItem('currentAgency') || 'null', null)
  );
  /**
   * platformMode: true when the super-admin explicitly chose "Platform" (no tenant scoping).
   * Prevents fetchUserAgencies from snapping currentAgency back to a default tenant.
   * Persisted in sessionStorage so it survives within-tab navigations but resets on new tab/reload
   * (which re-applies onMounted logic that resets super_admin to platform by default anyway).
   */
  const platformMode = ref(sessionStorage.getItem('__pt_platform_mode__') === '1');

  /**
   * Bumped on every explicit tenant / Platform selection so BrandingProvider’s watch re-runs even when
   * the user returns to the same agency id (e.g. NLU → ITSCO → NLU). Vue skips the watcher when the
   * watched string is unchanged — without this, :root theme stops updating after a few clicks.
   */
  const brandingContextGeneration = ref(0);
  const bumpBrandingContextGeneration = () => {
    brandingContextGeneration.value += 1;
  };

  // --- hydrateAgencyById guards -------------------------------------------
  // hydrateAgencyById is driven by reactive watchers (BrandingProvider, agency
  // resolution, etc.). If any dependency flaps, naive re-entry hammers
  // GET /agencies/:id and — before the global circuit breaker — exhausted the
  // browser socket pool (net::ERR_INSUFFICIENT_RESOURCES), taking the whole app
  // down. Even with the breaker in place, an unguarded loop still floods the
  // console and pins the main thread (thousands of "Failed to hydrate agency"
  // logs) so the app never renders. These guards make repeated calls cheap and
  // idempotent:
  //   1. one in-flight request per id (dedup),
  //   2. a short negative cache so a failing / breaker-tripped id is not
  //      refetched every tick,
  //   3. no-op state writes when nothing actually changed, so we never feed an
  //      identity-based watcher a fresh object and spin the loop faster,
  //   4. rate-limited error logging.
  const _hydrateInflight = new Map();   // id -> Promise
  const _hydrateFailUntil = new Map();  // id -> timestamp (skip refetch until)
  const HYDRATE_FAIL_COOLDOWN_MS = 10000;
  let _hydrateLastLogAt = 0;

  const _shallowAgencyEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  };

  const _applyHydrated = (full) => {
    const mergeOrPush = (arrRef, allowPush) => {
      const arr = Array.isArray(arrRef.value) ? arrRef.value.slice() : [];
      const idx = arr.findIndex((a) => Number(a?.id) === Number(full.id));
      if (idx >= 0) {
        const merged = { ...arr[idx], ...full };
        // Idempotent: skip the reassignment when nothing changed.
        if (_shallowAgencyEqual(arr[idx], merged)) return;
        arr[idx] = merged;
      } else if (allowPush) {
        arr.push(full);
      } else {
        return; // user scope: only merge, never add unrelated orgs
      }
      arrRef.value = arr;
    };
    // Catalog list: always attach so UIs can resolve names by id (e.g. schedule "Agencies shown" chips).
    mergeOrPush(agencies, true);
    // User scope: only merge; do not add unrelated orgs to "my memberships".
    mergeOrPush(userAgencies, false);
    if (Number(currentAgency.value?.id) === Number(full.id)) {
      const merged = { ...currentAgency.value, ...full };
      // Idempotent: only reassign (new object identity + localStorage write) when
      // the merged result actually differs. Prevents object-identity churn from
      // re-triggering any watcher that observes currentAgency by reference.
      if (!_shallowAgencyEqual(currentAgency.value, merged)) {
        currentAgency.value = merged;
        localStorage.setItem('currentAgency', JSON.stringify(merged));
      }
    }
  };

  const hydrateAgencyById = async (agencyId) => {
    const id = Number(agencyId);
    if (!Number.isInteger(id) || id < 1) return null;
    const url = `/agencies/${id}`;

    const cached = getCached(url);
    if (cached) {
      _applyHydrated(cached);
      return cached;
    }

    // Skip refetch while a recent failure (incl. circuit-breaker trip) is cooling down.
    if (Date.now() < (_hydrateFailUntil.get(id) || 0)) return null;

    // Deduplicate concurrent / rapid repeat calls for the same id.
    const existing = _hydrateInflight.get(id);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const res = await api.get(url);
        const full = res.data;
        if (!full?.id) return null;
        _applyHydrated(full);
        setCached(url, {}, full);
        _hydrateFailUntil.delete(id);
        return full;
      } catch (e) {
        _hydrateFailUntil.set(id, Date.now() + HYDRATE_FAIL_COOLDOWN_MS);
        const now = Date.now();
        if (now - _hydrateLastLogAt > 2000) {
          _hydrateLastLogAt = now;
          console.error('Failed to hydrate agency:', e);
        }
        return null;
      } finally {
        _hydrateInflight.delete(id);
      }
    })();
    _hydrateInflight.set(id, promise);
    return promise;
  };

  const setCurrentAgency = (agency) => {
    currentAgency.value = agency;
    if (isDemoWindowSession()) {
      try {
        if (agency) sessionStorage.setItem(DEMO_WINDOW_AGENCY_KEY, JSON.stringify(agency));
        else sessionStorage.removeItem(DEMO_WINDOW_AGENCY_KEY);
      } catch {
        // ignore
      }
    } else {
      localStorage.setItem('currentAgency', JSON.stringify(agency));
    }
    bumpBrandingContextGeneration();
    if (agency?.id) {
      // Switching to a specific tenant clears explicit platform mode.
      platformMode.value = false;
      if (!isDemoWindowSession()) {
        sessionStorage.removeItem('__pt_platform_mode__');
      }
      hydrateAgencyById(agency.id);
    }
  };

  /** Explicitly enter platform mode (super-admin only). Clears currentAgency and prevents snap-back. */
  const setPlatformMode = () => {
    platformMode.value = true;
    sessionStorage.setItem('__pt_platform_mode__', '1');
    currentAgency.value = null;
    if (!isDemoWindowSession()) {
      localStorage.setItem('currentAgency', JSON.stringify(null));
    }
    bumpBrandingContextGeneration();
  };

  const fetchAgencies = async (userId = null) => {
    try {
      // If userId is provided, fetch user's assigned agencies
      if (userId) {
        const url = `/users/${userId}/agencies`;
        const response = await api.get(url);
        agencies.value = response.data;
        userAgencies.value = response.data;
        
        // Set default agency if none selected and user has agencies
        if (!currentAgency.value && agencies.value.length > 0) {
          setCurrentAgency(agencies.value[0]);
        }
      } else {
        if (!agenciesAllInFlight) {
          agenciesAllInFlight = (async () => {
            const url = '/agencies';
            const cached = getCached(url);
            const response = cached ? { data: cached } : await api.get(url);
            agencies.value = response.data;
            if (!cached) setCached(url, {}, response.data);

            try {
              const { useAuthStore } = await import('./auth');
              const authStore = useAuthStore();
              const role = String(authStore.user?.role || '').toLowerCase();
              if (role && role !== 'super_admin') {
                userAgencies.value = response.data;
                if (!currentAgency.value && !platformMode.value && userAgencies.value.length > 0) {
                  setCurrentAgency(userAgencies.value[0]);
                }
              }
            } catch {
              // ignore; best-effort
            }
            return response.data;
          })();
        }
        try {
          await agenciesAllInFlight;
        } finally {
          agenciesAllInFlight = null;
        }
      }

      // If a current agency is already persisted, ensure we hydrate it so downstream UI
      // (dashboard card icons, theme settings, etc.) gets the full shape.
      if (currentAgency.value?.id) {
        hydrateAgencyById(currentAgency.value.id);
      }
    } catch (error) {
      console.error('Failed to fetch agencies:', error);
    }
  };

  const fetchUserAgencies = async () => {
    if (userAgenciesInFlight) return await userAgenciesInFlight;
    userAgenciesInFlight = (async () => {
    try {
      const { useAuthStore } = await import('./auth');
      const authStore = useAuthStore();
      const roleNorm = String(authStore.user?.role || '').toLowerCase();

      const pickPortalKey = (org) => String(org?.portal_url || org?.portalUrl || org?.slug || '').trim().toLowerCase();
      const inferPreferredPortalFromRuntime = () => {
        try {
          // Preferred source: explicit slug in path (e.g. /itsco/login or /nlu/dashboard).
          const pathname = String(window.location?.pathname || '/');
          const first = pathname.split('/').filter(Boolean)[0] || '';
          const reserved = new Set([
            'login', 'admin', 'dashboard', 'logout', 'schools', 'kiosk',
            'passwordless-login', 'reset-password', 'change-password', 'intake'
          ]);
          const slugCandidate = String(first).trim().toLowerCase();
          if (slugCandidate && !reserved.has(slugCandidate)) return slugCandidate;

          // Fallback: host-resolved portal cache (set by branding initialization).
          const host = String(window.location?.hostname || '').trim().toLowerCase();
          if (host) {
            const raw = sessionStorage.getItem(`__pt_portal_host__:${host}`);
            if (raw) {
              const parsed = JSON.parse(raw);
              const p = String(parsed?.portalUrl || '').trim().toLowerCase();
              if (p) return p;
            }
          }
        } catch {
          // ignore
        }
        return null;
      };

      const pickDefaultAgencyForUser = (list) => {
        const arr = Array.isArray(list) ? list : [];
        if (!arr.length) return null;
        // Club managers: first path segment is the Summit *platform* slug (e.g. ssc), which matches the
        // tenant agency row—not the club affiliation. Prefer affiliation before portal-key matching.
        if (roleNorm === 'club_manager') {
          const affiliation = arr.find((a) => {
            const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
            return t === 'affiliation';
          });
          if (affiliation) return affiliation;
        }
        const preferredPortal = inferPreferredPortalFromRuntime();
        if (preferredPortal) {
          const preferred = arr.find((a) => pickPortalKey(a) === preferredPortal);
          if (preferred) return preferred;
        }
        if (roleNorm === 'school_staff') {
          // School staff should land in portal orgs (school/program/learning), not the parent agency.
          const portal = arr.find((a) => {
            const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
            return t === 'school' || t === 'program' || t === 'learning';
          }) || null;
          if (portal) return portal;
        }
        // Club managers with Summit Stats Club (affiliation) access should default to the club.
        // Admins/backoffice roles who are also club members should stay on their work tenant.
        if (roleNorm === 'club_manager') {
          const affiliation = arr.find((a) => {
            const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
            return t === 'affiliation';
          });
          if (affiliation) return affiliation;
        }
        return arr[0] || null;
      };

      const syncCurrentAgencyForUser = (list) => {
        const arr = Array.isArray(list) ? list : [];
        if (roleNorm === 'super_admin' || platformMode.value) return;
        if (!arr.length) {
          currentAgency.value = null;
          localStorage.setItem('currentAgency', JSON.stringify(null));
          return;
        }
        const currentId = Number(currentAgency.value?.id || 0);
        const currentType = String(currentAgency.value?.organization_type || currentAgency.value?.organizationType || '').toLowerCase();
        const isPortal = currentType === 'school' || currentType === 'program' || currentType === 'learning';
        const isAffiliation = currentType === 'affiliation';
        const hasAffiliation = arr.some((a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'affiliation');
        const preferredPortal = inferPreferredPortalFromRuntime();
        const currentPortal = pickPortalKey(currentAgency.value);
        const hasPreferredMismatch = !!(preferredPortal && preferredPortal !== currentPortal);
        const currentAgencyStillAccessible =
          currentId > 0 && arr.some((a) => Number(a?.id || 0) === currentId);
        // Only snap non-admin users with an affiliation back to the club — admins who are
        // also club members should be able to stay on their work tenant without being overridden.
        const snapToAffiliation = hasAffiliation && !isAffiliation && roleNorm === 'club_manager';
        const shouldOverride =
          !currentAgency.value ||
          !currentAgencyStillAccessible ||
          hasPreferredMismatch ||
          (roleNorm === 'school_staff' && !isPortal) ||
          snapToAffiliation;
        if (shouldOverride) {
          const def = pickDefaultAgencyForUser(arr);
          if (def) setCurrentAgency(def);
        }
      };
      
      // For approved employees, use agencyIds from the user object
      if (authStore.user?.type === 'approved_employee' && authStore.user?.agencyIds) {
        // Fetch agency details for each agency ID
        const agencyPromises = authStore.user.agencyIds.map(async (agencyId) => {
          try {
            const response = await api.get(`/agencies/${agencyId}`);
            return response.data;
          } catch (err) {
            console.error(`Failed to fetch agency ${agencyId}:`, err);
            return null;
          }
        });
        
        const agencyList = (await Promise.all(agencyPromises)).filter(a => a !== null);
        userAgencies.value = agencyList;
        agencies.value = agencyList;
        
        // Store agencies in localStorage for login redirect after logout
        const { storeUserAgencies } = await import('../utils/loginRedirect');
        storeUserAgencies(agencyList);
        syncCurrentAgencyForUser(userAgencies.value);
        
        return agencyList;
      } else {
        // Regular users - use the API endpoint
        const response = await api.get('/users/me/agencies');
        userAgencies.value = response.data;
        agencies.value = response.data;
        
        // Store agencies in localStorage for login redirect after logout
        const { storeUserAgencies } = await import('../utils/loginRedirect');
        storeUserAgencies(response.data);
        syncCurrentAgencyForUser(userAgencies.value);

        // If a current agency is already persisted, ensure we hydrate it so downstream UI
        // (dashboard card icons, theme settings, etc.) gets the full shape.
        if (currentAgency.value?.id) {
          hydrateAgencyById(currentAgency.value.id);
        }
        
        return response.data;
      }
    } catch (error) {
      console.error('Failed to fetch user agencies:', error);
      return [];
    }
    })();
    try {
      return await userAgenciesInFlight;
    } finally {
      userAgenciesInFlight = null;
    }
  };

  const fetchTracks = async (agencyId = null) => {
    try {
      const params = agencyId ? { agencyId } : {};
      // Support both endpoints for backward compatibility
      const response = await api.get('/training-focuses', { params });
      tracks.value = response.data;
    } catch (error) {
      console.error('Failed to fetch training focuses:', error);
    }
  };

  const getAgencyTracks = computed(() => {
    if (!currentAgency.value) return [];
    return tracks.value.filter(t => t.agency_id === currentAgency.value.id);
  });

  const userAgencyCount = computed(() => {
    return Array.isArray(userAgencies.value) ? userAgencies.value.length : 0;
  });

  /** True if user is associated with exactly one tenant (no dropdown/switcher should be shown). */
  const hasSingleTenantAssociation = computed(() => {
    return userAgencyCount.value === 1 && !platformMode.value;
  });

  /** Whether to show tenant/branding dropdown or agency switcher in header (hide for single-tenant users). */
  const shouldShowTenantDropdown = computed(() => {
    return userAgencyCount.value > 1 || platformMode.value || (userAgencies.value || []).some(a => a?.isMultiTenant || false);
  });

  const superviseePortalSlugs = ref([]);
  let superviseePortalSlugsFetched = false;
  let superviseePortalSlugsUserId = null;
  const fetchSuperviseePortalSlugs = async () => {
    const { useAuthStore } = await import('./auth');
    const { isSupervisor } = await import('../utils/helpers');
    const authStore = useAuthStore();
    const currentUserId = authStore.user?.id ?? null;
    if (currentUserId !== superviseePortalSlugsUserId) {
      superviseePortalSlugsFetched = false;
      superviseePortalSlugsUserId = currentUserId;
      superviseePortalSlugs.value = [];
    }
    if (superviseePortalSlugsFetched) return;
    try {
      const isProviderPlus = String(authStore.user?.role || '').toLowerCase() === 'provider_plus';
      if (!authStore.user || (!isSupervisor(authStore.user) && !isProviderPlus)) {
        superviseePortalSlugsFetched = true;
        return;
      }
      const response = await api.get('/users/me/supervisee-portal-slugs');
      superviseePortalSlugs.value = Array.isArray(response.data?.slugs) ? response.data.slugs : [];
    } catch {
      superviseePortalSlugs.value = [];
    } finally {
      superviseePortalSlugsFetched = true;
    }
  };

  return {
    agencies,
    userAgencies,
    tracks,
    currentAgency,
    platformMode,
    brandingContextGeneration,
    getAgencyTracks,
    setCurrentAgency,
    setPlatformMode,
    hydrateAgencyById,
    fetchAgencies,
    fetchUserAgencies,
    fetchTracks,
    superviseePortalSlugs,
    fetchSuperviseePortalSlugs,
    userAgencyCount,
    hasSingleTenantAssociation,
    shouldShowTenantDropdown
  };
});
