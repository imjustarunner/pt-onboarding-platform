import { onScopeDispose, ref, unref } from 'vue';

/** One actor's memberships must not be erased by an older chart request. */
export function useAgencyMemberships({ api, actorId, memberships }) {
  const loading = ref(false), error = ref('');
  let generation = 0, loadedActorId = null;
  async function load() {
    const actor = Number(unref(actorId));
    const run = ++generation;
    if (loadedActorId !== null && loadedActorId !== actor) memberships.value = [];
    loading.value = true; error.value = '';
    try {
      const response = await api.get('/users/me/agencies', { skipGlobalLoading: true });
      if (run !== generation || actor !== Number(unref(actorId))) return false;
      memberships.value = Array.isArray(response.data) ? response.data : [];
      loadedActorId = actor;
      return true;
    } catch (e) {
      if (run !== generation || actor !== Number(unref(actorId))) return false;
      if (loadedActorId !== actor || [401, 403].includes(Number(e.response?.status))) memberships.value = [];
      error.value = e.response?.data?.error?.message || 'Agency access could not be checked. Retry after checking your sign-in.';
      return false;
    } finally {
      if (run === generation) loading.value = false;
    }
  }
  onScopeDispose(() => { ++generation; });
  return { load, loading, error };
}
