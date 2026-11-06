import { ref, unref, onScopeDispose } from 'vue';

const active = value => ['running', 'pending'].includes(value?.status);
const message = error => error?.response?.data?.error?.message || 'Narriva review is unavailable. Your note is preserved.';

/** Review state contains server evidence only. A local edit discards the badge. */
export function useNarrivaReview({ agencyId, apiClient, base = '/narriva', pollMs = 1200 } = {}) {
  const review = ref(null), busy = ref(false), error = ref('');
  let generation = 0, timer = null, settle = null;
  function cancel() { clearTimeout(timer); timer = null; settle?.(); settle = null; generation++; busy.value = false; }
  function invalidate() { cancel(); review.value = null; error.value = ''; }
  const wait = () => new Promise(resolve => { settle = resolve; timer = setTimeout(() => { settle = null; resolve(); }, pollMs); });
  async function runReview(target) {
    cancel(); const current = generation; busy.value = true; error.value = ''; review.value = null;
    try {
      const { data } = await apiClient.post(`${base}/reviews`, { agencyId: Number(unref(agencyId)), ...target }, { skipGlobalLoading: true });
      if (current !== generation) return null;
      review.value = data?.review || null;
      if (!review.value?.id) throw new Error('Missing review');
      const deadline = Date.now() + 180000;
      while (active(review.value) && current === generation) {
        if (Date.now() >= deadline) throw new Error('Review did not complete');
        await wait();
        if (current !== generation) return null;
        const result = await apiClient.get(`${base}/reviews/${review.value.id}`, { params: { agencyId: Number(unref(agencyId)) }, skipGlobalLoading: true });
        if (current !== generation) return null;
        if (!result.data?.review?.id) throw new Error('Missing review');
        review.value = result.data.review;
      }
      return review.value;
    } catch (e) { if (current === generation) { review.value = null; error.value = message(e); } return null; }
    finally { if (current === generation) busy.value = false; }
  }
  async function resolveFinding({ findingId, action = 'bypass', reason }) {
    if (busy.value || !review.value?.id) return;
    const current = generation; busy.value = true; error.value = '';
    try {
      const { data } = await apiClient.patch(`${base}/reviews/${review.value.id}/findings`, { agencyId: Number(unref(agencyId)), findingId, action, reason }, { skipGlobalLoading: true });
      if (current === generation) review.value = data?.review || null;
    } catch (e) { if (current === generation) error.value = message(e); }
    finally { if (current === generation) busy.value = false; }
  }
  onScopeDispose(cancel);
  return { review, busy, error, runReview, resolveFinding, invalidate };
}
