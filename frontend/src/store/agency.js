import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

export const useAgencyStore = defineStore('agency', () => {
  const agencies = ref([]);
  const userAgencies = ref([]);
  const tracks = ref([]);
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
    try {
      const res = await api.get(`/agencies/${id}`);
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
        // Note: backend returns ALL agencies for super_admin, but ONLY the user's agencies for admin.
        const response = await api.get('/agencies');
        agencies.value = response.data;

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
    try {
      const { useAuthStore } = await import('./auth');
      const authStore = useAuthStore();
      
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
        
        const agencies = (await Promise.all(agencyPromises)).filter(a => a !== null);
        userAgencies.value = agencies;
        agencies.value = agencies;
        
        // Store agencies in localStorage for login redirect after logout
        const { storeUserAgencies } = await import('../utils/loginRedirect');
        storeUserAgencies(agencies);
        
        // If no current agency is set and user has agencies, set the first one
        if (!currentAgency.value && userAgencies.value.length > 0) {
          setCurrentAgency(userAgencies.value[0]);
        }
        
        return agencies;
      } else {
        // Regular users - use the API endpoint
        const response = await api.get('/users/me/agencies');
        userAgencies.value = response.data;
        agencies.value = response.data;
        
        // Store agencies in localStorage for login redirect after logout
        const { storeUserAgencies } = await import('../utils/loginRedirect');
        storeUserAgencies(response.data);
        
        // If no current agency is set and user has agencies, set the first one
        if (!currentAgency.value && userAgencies.value.length > 0) {
          setCurrentAgency(userAgencies.value[0]);
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

