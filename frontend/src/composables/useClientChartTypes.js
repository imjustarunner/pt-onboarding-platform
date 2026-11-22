import { computed, ref, watch } from 'vue';
import api from '../services/api';

export function useClientChartTypes(scope) {
  const profile = ref(null), error = ref(''), saving = ref(false);
  const key = computed(() => scope().join(':'));
  let version = 0;
  async function request(input) {
    if (saving.value) return;
    const run = ++version, current = key.value, [clientId,agencyId,enabled] = scope();
    const isCurrent = () => run === version && current === key.value;
    error.value = '';
    if (!enabled || !clientId || !agencyId) return;
    const url = `/clients/${clientId}/chart-types`;
    const config = {params:{agencyId},headers:{'X-Agency-Id':String(agencyId)},skipGlobalLoading:true};
    try {
      saving.value = !!input;
      const {data} = input ? await api.put(url,input,config) : await api.get(url,config);
      if (isCurrent() && Array.isArray(data?.types)) profile.value = data;
    } catch (e) {
      if (isCurrent()) error.value = e.response?.data?.error?.message || 'Could not load or save client types.';
    } finally {
      if (isCurrent()) saving.value = false;
    }
  }
  watch(key, () => { profile.value = null; saving.value = false; void request(); }, {immediate:true,flush:'sync'});
  return {profile,error,saving,load:() => request(),save:request};
}
