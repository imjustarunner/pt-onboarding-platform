import { computed, ref, watch } from 'vue';
import api from '../services/api.js';
import { parseProviderClientQuery, searchProviderClients } from '../navigation/providerClientQuickNav.js';
import { canDiscoverQuickNavRoute, resolveRegisteredQuickNav } from '../navigation/quickNavRuntime.js';

/** Per-surface, actor/tenant-scoped cache; never retain results across account changes. */
export function useProviderClientQuickNav(query, options, router) {
  const people = ref([]);
  const loaded = ref(false);
  let generation = 0;
  let pending = false;
  const eligible = computed(() => Number(options.value.agency?.id) > 0 && ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus'].includes(options.value.user?.role));
  watch(() => [options.value.user?.id, options.value.user?.role, options.value.agency?.id], () => {
    generation++; people.value = []; loaded.value = false; pending = false;
  }, { flush: 'sync' });
  watch(() => [query.value, options.value.user?.id, options.value.user?.role, options.value.agency?.id], async () => {
    if (!eligible.value || !parseProviderClientQuery(query.value) || loaded.value || pending) return;
    const current = generation;
    pending = true;
    try {
      const response = await api.get('/users', { params: { agencyId: options.value.agency.id, staffOnly: 'true' }, skipGlobalLoading: true });
      if (current !== generation) return;
      people.value = (Array.isArray(response.data) ? response.data : []).map(({ id, first_name, last_name, role }) => ({ id, first_name, last_name, role }));
      loaded.value = true;
    } catch { if (current === generation) people.value = []; }
    finally { if (current === generation) pending = false; }
  }, { immediate: true });
  return computed(() => eligible.value ? searchProviderClients(query.value, people.value, { agencyId: options.value.agency.id }).filter(entry => {
    const destination = resolveRegisteredQuickNav(entry, router, options.value);
    return destination && canDiscoverQuickNavRoute(destination, options.value);
  }) : []);
}
