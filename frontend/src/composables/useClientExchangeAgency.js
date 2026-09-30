import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { isNestedOrganizationType } from '../utils/organizationTypes.js';

export function useClientExchangeAgency() {
  const store = useAgencyStore();
  const route = useRoute();
  const selected = ref('');
  const agencies = computed(() => {
    const rows = [...(store.userAgencies || []), ...(store.agencies || []), store.currentAgency].filter(Boolean);
    return [...new Map(rows.filter(a => !isNestedOrganizationType(a.organization_type || a.organizationType)).map(a => [Number(a.id), a])).values()];
  });
  const agencyId = computed(() => {
    const requested = Number(selected.value || route.query?.agencyId);
    if (requested && agencies.value.some(a => Number(a.id) === requested)) return requested;
    const slug = route.params?.organizationSlug;
    const scoped = agencies.value.find(a => slug && (a.slug === slug || a.portal_url === slug));
    const current = agencies.value.find(a => Number(a.id) === Number(store.currentAgency?.id));
    return Number(scoped?.id || current?.id || (agencies.value.length === 1 ? agencies.value[0].id : 0)) || null;
  });
  onMounted(() => {
    if (!store.userAgencies?.length) store.fetchUserAgencies().catch(() => {});
  });
  return { agencyId, agencies, selected };
}
