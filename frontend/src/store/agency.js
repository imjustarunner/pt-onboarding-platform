import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

export const useAgencyStore = defineStore('agency', () => {
  const agencies = ref([]);
  const userAgencies = ref([]);
  const tracks = ref([]);
  const currentAgency = ref(JSON.parse(localStorage.getItem('currentAgency') || 'null'));

  const setCurrentAgency = (agency) => {
    currentAgency.value = agency;
    localStorage.setItem('currentAgency', JSON.stringify(agency));
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
        // For admins/super admins, fetch all agencies
        const response = await api.get('/agencies');
        agencies.value = response.data;
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
        
        // If no current agency is set and user has agencies, set the first one
        if (!currentAgency.value && userAgencies.value.length > 0) {
          setCurrentAgency(userAgencies.value[0]);
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

  return {
    agencies,
    userAgencies,
    tracks,
    currentAgency,
    getAgencyTracks,
    setCurrentAgency,
    fetchAgencies,
    fetchUserAgencies,
    fetchTracks
  };
});

