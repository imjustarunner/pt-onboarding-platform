import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';
import { getCached, setCached } from '../utils/adminApiCache';

export const useAgencyStore = defineStore('agency', () => {
  const agencies = ref([]);
  const userAgencies = ref([]);
  const tracks = ref([]);
  let userAgenciesInFlight = null;
  const safeJsonParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const currentAgency = ref(safeJsonParse(localStorage.getItem('currentAgency') || 'null', null));

  const hydrateAgencyById = async (agencyId) => {
    const id = Number(agencyId);
    if (!Number.isInteger(id) || id < 1) return null;
    const url = `/agencies/${id}`;
    const cached = getCached(url);
    if (cached) {
      const full = cached;
      const replaceIn = (arrRef) => {
        const arr = Array.isArray(arrRef.value) ? arrRef.value.slice() : [];
        const idx = arr.findIndex((a) => Number(a?.id) === Number(full.id));
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...full };
          arrRef.value = arr;
        }
      };
      replaceIn(agencies);
      replaceIn(userAgencies);
      if (Number(currentAgency.value?.id) === Number(full.id)) {
        currentAgency.value = { ...currentAgency.value, ...full };
        localStorage.setItem('currentAgency', JSON.stringify(currentAgency.value));
      }
      return full;
    }
    try {
      const res = await api.get(url);
      const full = res.data;
      if (!full?.id) return null;

      // Update lists (best-effort).
      const replaceIn = (arrRef) => {
        const arr = Array.isArray(arrRef.value) ? arrRef.value.slice() : [];
        const idx = arr.findIndex((a) => Number(a?.id) === Number(full.id));
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...full };
          arrRef.value = arr;
        }
      };
      replaceIn(agencies);
      replaceIn(userAgencies);

      // If current agency matches, update it too.
      if (Number(currentAgency.value?.id) === Number(full.id)) {
        currentAgency.value = { ...currentAgency.value, ...full };
        localStorage.setItem('currentAgency', JSON.stringify(currentAgency.value));
      }
      setCached(url, {}, full);
      return full;
    } catch (e) {
      console.error('Failed to hydrate agency:', e);
      return null;
    }
  };

  const setCurrentAgency = (agency) => {
    currentAgency.value = agency;
    localStorage.setItem('currentAgency', JSON.stringify(agency));
    // Best-effort: hydrate with full agency record (includes icon paths + theme settings).
    if (agency?.id) {
      hydrateAgencyById(agency.id);
    }
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
        // For admins/super admins, fetch agencies.
        const url = '/agencies';
        const cached = getCached(url);
        const response = cached ? { data: cached } : await api.get(url);
        agencies.value = response.data;
        if (!cached) setCached(url, {}, response.data);

        // If this user is NOT a super_admin, treat this as their user-agency list too,
        // and ensure we set a default current agency for downstream UI (e.g. Quick Actions icon overrides).
        try {
          const { useAuthStore } = await import('./auth');
          const authStore = useAuthStore();
          const role = String(authStore.user?.role || '').toLowerCase();
          if (role && role !== 'super_admin') {
            userAgencies.value = response.data;
            if (!currentAgency.value && userAgencies.value.length > 0) {
              setCurrentAgency(userAgencies.value[0]);
            }
          }
        } catch {
          // ignore; best-effort
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
        return arr[0] || null;
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
        
        // School staff should default to a SCHOOL org (not the parent agency),
        // so they land in the school portal experience.
        if (userAgencies.value.length > 0) {
          const currentType = String(currentAgency.value?.organization_type || currentAgency.value?.organizationType || '').toLowerCase();
          const isPortal = currentType === 'school' || currentType === 'program' || currentType === 'learning';
          const preferredPortal = inferPreferredPortalFromRuntime();
          const currentPortal = pickPortalKey(currentAgency.value);
          const hasPreferredMismatch = !!(preferredPortal && preferredPortal !== currentPortal);
          const shouldOverride = !currentAgency.value || hasPreferredMismatch || (roleNorm === 'school_staff' && !isPortal);
          if (shouldOverride) {
            const def = pickDefaultAgencyForUser(userAgencies.value);
            if (def) setCurrentAgency(def);
          }
        }
        
        return agencyList;
      } else {
        // Regular users - use the API endpoint
        const response = await api.get('/users/me/agencies');
        userAgencies.value = response.data;
        agencies.value = response.data;
        
        // Store agencies in localStorage for login redirect after logout
        const { storeUserAgencies } = await import('../utils/loginRedirect');
        storeUserAgencies(response.data);
        
        // School staff should default to a SCHOOL org (not the parent agency),
        // so they land in the school portal experience.
        if (userAgencies.value.length > 0) {
          const currentType = String(currentAgency.value?.organization_type || currentAgency.value?.organizationType || '').toLowerCase();
          const isPortal = currentType === 'school' || currentType === 'program' || currentType === 'learning';
          const preferredPortal = inferPreferredPortalFromRuntime();
          const currentPortal = pickPortalKey(currentAgency.value);
          const hasPreferredMismatch = !!(preferredPortal && preferredPortal !== currentPortal);
          const shouldOverride = !currentAgency.value || hasPreferredMismatch || (roleNorm === 'school_staff' && !isPortal);
          if (shouldOverride) {
            const def = pickDefaultAgencyForUser(userAgencies.value);
            if (def) setCurrentAgency(def);
          }
        }

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
      if (!authStore.user || !isSupervisor(authStore.user)) {
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
    getAgencyTracks,
    setCurrentAgency,
    hydrateAgencyById,
    fetchAgencies,
    fetchUserAgencies,
    fetchTracks,
    superviseePortalSlugs,
    fetchSuperviseePortalSlugs
  };
});

