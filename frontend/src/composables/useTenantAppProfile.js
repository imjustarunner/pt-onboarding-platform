import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { resolveTenantAppProfileBySlug } from '../config/tenantAppProfiles';

export function useTenantAppProfile() {
  const route = useRoute();

  const profile = computed(() => {
    return resolveTenantAppProfileBySlug(route.params?.organizationSlug);
  });

  return {
    tenantAppProfile: profile
  };
}
