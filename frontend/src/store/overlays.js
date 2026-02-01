import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../services/api';

const keyFor = (agencyId, routeName) => `${String(agencyId)}::${String(routeName)}`;

export const useOverlaysStore = defineStore('overlays', () => {
  const cache = ref({}); // key -> { tutorial, helper, fetchedAt }
  const loadingKeys = ref({});

  const platformHelper = ref({
    enabled: true,
    imageUrl: null,
    imagePath: null,
    fetchedAt: null
  });

  const getCached = (agencyId, routeName) => {
    const k = keyFor(agencyId, routeName);
    return cache.value?.[k] || null;
  };

  const fetchRouteOverlays = async (agencyId, routeName) => {
    if (!agencyId || !routeName) return null;
    const k = keyFor(agencyId, routeName);
    if (loadingKeys.value[k]) return getCached(agencyId, routeName);

    try {
      loadingKeys.value = { ...loadingKeys.value, [k]: true };
      const resp = await api.get(`/overlays/agencies/${encodeURIComponent(String(agencyId))}/routes/${encodeURIComponent(String(routeName))}`);
      const payload = resp?.data || {};
      const next = {
        tutorial: payload.tutorial || null,
        helper: payload.helper || null,
        fetchedAt: Date.now()
      };
      cache.value = { ...(cache.value || {}), [k]: next };
      return next;
    } catch (e) {
      // Best-effort; treat as no overlays.
      const next = { tutorial: null, helper: null, fetchedAt: Date.now(), error: true };
      cache.value = { ...(cache.value || {}), [k]: next };
      return next;
    } finally {
      const copy = { ...(loadingKeys.value || {}) };
      delete copy[k];
      loadingKeys.value = copy;
    }
  };

  const publishTutorial = async ({ agencyId, routeName, tour }) => {
    if (!agencyId || !routeName) throw new Error('Missing agencyId or routeName');
    await api.put(
      `/overlays/agencies/${encodeURIComponent(String(agencyId))}/routes/${encodeURIComponent(String(routeName))}/tutorial`,
      { tour }
    );
    return await fetchRouteOverlays(agencyId, routeName);
  };

  const publishHelper = async ({ agencyId, routeName, helper }) => {
    if (!agencyId || !routeName) throw new Error('Missing agencyId or routeName');
    await api.put(
      `/overlays/agencies/${encodeURIComponent(String(agencyId))}/routes/${encodeURIComponent(String(routeName))}/helper`,
      { helper }
    );
    return await fetchRouteOverlays(agencyId, routeName);
  };

  const fetchPlatformHelper = async () => {
    try {
      const resp = await api.get('/overlays/platform/helper-settings');
      const data = resp?.data || {};
      platformHelper.value = {
        enabled: data.enabled !== false,
        imageUrl: data.imageUrl || null,
        imagePath: data.imagePath || null,
        fetchedAt: Date.now()
      };
      return platformHelper.value;
    } catch (e) {
      // best-effort
      return platformHelper.value;
    }
  };

  const uploadPlatformHelperImage = async (file) => {
    const form = new FormData();
    form.append('image', file);
    const resp = await api.post('/overlays/platform/helper-image', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    // Refresh cached settings
    await fetchPlatformHelper();
    return resp?.data || null;
  };

  return {
    cache,
    getCached,
    fetchRouteOverlays,
    publishTutorial,
    publishHelper,
    platformHelper,
    fetchPlatformHelper,
    uploadPlatformHelperImage
  };
});

