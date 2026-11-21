import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { isNestedOrganizationType } from '../utils/organizationTypes.js';

export function useClientExchangeAgency({ allowAll = false, directoryAgency = () => undefined } = {}) {
  const auth = useAuthStore();
  const canBrowseAll = computed(() => allowAll && ['super_admin','admin','support','staff'].includes(auth.user?.role));
  const store = useAgencyStore();
  const route = useRoute();
  const savedSelection = ref(canBrowseAll.value ? 'all' : '');
  const key = `exchange-agency-v2:${auth.user?.id || 'anon'}`;
  if (allowAll) { try { savedSelection.value=localStorage.getItem(key) || savedSelection.value; } catch {} watch(savedSelection,value=>{try{localStorage.setItem(key,value);}catch{}}); }
  const selected = computed({
    get: () => directoryAgency() ?? savedSelection.value,
    set: value => { savedSelection.value = value; }
  });
  const agencies = computed(() => {
    const rows = [...(store.userAgencies || []), ...(store.agencies || []), store.currentAgency].filter(Boolean);
    return [...new Map(rows.filter(a => !isNestedOrganizationType(a.organization_type || a.organizationType)).map(a => [Number(a.id), a])).values()];
  });
  const agencyId = computed(() => {
    if (canBrowseAll.value && selected.value === 'all') return null;
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
  const browseAgencyIds = computed(() => canBrowseAll.value && selected.value === 'all' ? agencies.value.map(a=>Number(a.id)) : agencyId.value ? [agencyId.value] : []);
  return { agencyId, agencies, selected, canBrowseAll, browseAgencyIds };
}
