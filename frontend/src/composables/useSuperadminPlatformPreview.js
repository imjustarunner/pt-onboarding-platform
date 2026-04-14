import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';

export function useSuperadminPlatformPreview(options = {}) {
  const route = options.route || useRoute();
  const authStore = options.authStore || useAuthStore();
  const agencyStore = options.agencyStore || useAgencyStore();

  const isSuperadminPreview = computed(() => {
    return String(authStore.user?.role || '').trim().toLowerCase() === 'super_admin' &&
      String(route.query?.previewMode || '').trim().toLowerCase() === 'superadmin';
  });

  const previewAgencyId = computed(() => {
    return Number(route.query?.previewAgencyId || agencyStore.currentAgency?.id || 0) || null;
  });

  const previewProgramId = computed(() => {
    return Number(route.query?.previewProgramId || route.query?.programId || 0) || null;
  });

  const previewTargetId = computed(() => {
    const raw = String(route.query?.previewTargetId || '').trim();
    return raw || null;
  });

  const previewQuery = computed(() => {
    if (!isSuperadminPreview.value) return {};
    return {
      previewMode: 'superadmin',
      ...(previewAgencyId.value ? { previewAgencyId: String(previewAgencyId.value) } : {}),
      ...(previewProgramId.value ? { previewProgramId: String(previewProgramId.value) } : {}),
      ...(previewTargetId.value ? { previewTargetId: previewTargetId.value } : {})
    };
  });

  const appendPreviewQueryToRoute = (to, extraQuery = {}) => {
    if (!isSuperadminPreview.value) {
      if (typeof to === 'string' && Object.keys(extraQuery || {}).length) {
        return { path: to, query: extraQuery };
      }
      if (typeof to === 'object' && to) {
        return {
          ...to,
          query: { ...(to.query || {}), ...(extraQuery || {}) }
        };
      }
      return to;
    }

    if (typeof to === 'string') {
      return {
        path: to,
        query: { ...previewQuery.value, ...(extraQuery || {}) }
      };
    }

    if (typeof to === 'object' && to) {
      return {
        ...to,
        query: { ...(to.query || {}), ...previewQuery.value, ...(extraQuery || {}) }
      };
    }

    return to;
  };

  const ensurePreviewAgencyContext = async () => {
    if (!isSuperadminPreview.value || !previewAgencyId.value) return null;
    const currentId = Number(agencyStore.currentAgency?.id || 0) || null;
    if (currentId === previewAgencyId.value && agencyStore.currentAgency?.name) {
      return agencyStore.currentAgency;
    }
    const hydrated = await agencyStore.hydrateAgencyById(previewAgencyId.value);
    if (hydrated) {
      agencyStore.setCurrentAgency(hydrated);
    }
    return hydrated || null;
  };

  if (options.syncAgency !== false) {
    watch(
      [isSuperadminPreview, previewAgencyId],
      () => {
        void ensurePreviewAgencyContext();
      },
      { immediate: true }
    );
  }

  return {
    isSuperadminPreview,
    previewAgencyId,
    previewProgramId,
    previewTargetId,
    previewQuery,
    appendPreviewQueryToRoute,
    ensurePreviewAgencyContext
  };
}
