import { ref, unref, onScopeDispose, watch } from 'vue';
import { rateLimitRetryAt } from '../utils/rateLimitRetry.js';

const active = value => ['running', 'pending'].includes(value?.status);
const message = error => error?.response?.data?.error?.message || 'Narriva review is unavailable. Your note is preserved.';

/** Review state contains server evidence only. A local edit discards the badge. */
export function useNarrivaReview({ agencyId, apiClient, base = '/narriva', pollMs = 1200 } = {}) {
  const review = ref(null), busy = ref(false), error = ref(''), paused = ref(false);
  let generation = 0, timer = null, settle = null;
  let pausedGeneration = null, pausedSession = null;
  const sessionKey = () => { try { return window.localStorage.getItem('sessionId'); } catch { return null; } };
  function cancel() { clearTimeout(timer); timer = null; settle?.(); settle = null; generation++; busy.value = false; paused.value=false; pausedGeneration=null; pausedSession=null; }
  function invalidate({ preserve = false } = {}) { cancel(); review.value = preserve && review.value ? { ...review.value, status: 'stale', quickSignEligible: false } : null; error.value = ''; }
  function handleError(e,current) {
    if(current!==generation)return;
    if(e?.response?.status===423 && e?.response?.data?.error?.code==='SESSION_LOCKED' && active(review.value)) {
      paused.value=true;pausedGeneration=current;pausedSession=sessionKey();
      error.value='Unlock your session to continue. Your saved note and review are preserved; the same review resumes after you unlock.';
    } else error.value=message(e);
  }
  const wait = delay => new Promise(resolve => { settle = resolve; timer = setTimeout(() => { settle = null; resolve(); }, delay); });
  async function pollReview(current) {
    const deadline = Date.now() + 180000;
    let delay = pollMs;
    while (active(review.value) && current === generation) {
      if (Date.now() + delay >= deadline) throw new Error('Review did not complete');
      await wait(delay);
      if (current !== generation) return null;
      try {
        const result = await apiClient.get(`${base}/reviews/${review.value.id}`, {
          params: { agencyId: Number(unref(agencyId)), poll: 1 }, skipGlobalLoading: true
        });
        if (current !== generation) return null;
        if (!result.data?.review?.id) throw new Error('Missing review');
        if (result.data.review.heartbeat) {
          review.value = { ...review.value, stage: result.data.review.stage, phase: result.data.review.phase || review.value.phase, enrollmentSources: result.data.review.enrollmentSources || review.value.enrollmentSources };
          if (result.data.review.previewAvailable && !review.value.draftPreview) {
            const preview = await apiClient.get(`${base}/reviews/${review.value.id}`, {
              params: { agencyId: Number(unref(agencyId)) }, skipGlobalLoading: true
            });
            if (current !== generation) return null;
            if (preview.data?.review?.id) review.value = preview.data.review;
          }
        } else {
          review.value = result.data.review;
        }
        delay = pollMs;
      } catch (error) {
        if (current !== generation) return null;
        if (error?.response?.status !== 429) throw error;
        const now = Date.now();
        delay = Math.max(pollMs, rateLimitRetryAt(error, now, 5000) - now);
        if (now + delay >= deadline) throw error;
      }
    }
    return review.value;
  }
  async function observeReview(saved) {
    cancel();const current=generation;review.value=saved || null;error.value='';busy.value=active(saved);
    try{return await pollReview(current);}
    catch(e){handleError(e,current);return null;}
    finally{if(current===generation)busy.value=false;}
  }
  async function runReview(target) {
    // A locked polling request did not lose its saved review. Retry reads that
    // exact review rather than creating another billable writing/review job.
    if(paused.value && active(review.value))return resumeReview();
    cancel();const current=generation;busy.value=true;error.value='';review.value=null;
    try{
      const {data}=await apiClient.post(`${base}/reviews`,{agencyId:Number(unref(agencyId)),...target},{skipGlobalLoading:true});
      if(current!==generation)return null;
      review.value=data?.review || null;
      if(!review.value?.id)throw new Error('Missing review');
      return await pollReview(current);
    }catch(e){handleError(e,current);return null;}
    finally{if(current===generation)busy.value=false;}
  }
  async function resumeReview() {
    if(!paused.value || busy.value || pausedGeneration!==generation || !active(review.value))return null;
    // A different login must not revive a prior user's saved workspace state.
    if(pausedSession!==sessionKey()){invalidate();return null;}
    const current=generation;paused.value=false;error.value='';busy.value=true;
    try{return await pollReview(current);}
    catch(e){handleError(e,current);return null;}
    finally{if(current===generation)busy.value=false;}
  }
  const onResumed=()=>{void resumeReview();};
  if(typeof window!=='undefined')window.addEventListener('pt:session-resumed',onResumed);
  watch(()=>unref(agencyId),invalidate);
  async function resolveFinding({ findingId, action = 'bypass', reason, sections }) {
    if (busy.value || !review.value?.id) return;
    const current = generation; busy.value = true; error.value = '';
    try {
      const { data } = await apiClient.patch(`${base}/reviews/${review.value.id}/findings`, { agencyId: Number(unref(agencyId)), findingId, action, reason, sections }, { skipGlobalLoading: true });
      if (current === generation) { review.value = data?.review || null; if(active(review.value))await pollReview(current); return review.value; }
    } catch (e) { if (current === generation) error.value = message(e); }
    finally { if (current === generation) busy.value = false; }
  }
  onScopeDispose(()=>{cancel();if(typeof window!=='undefined')window.removeEventListener('pt:session-resumed',onResumed);});
  return { review, busy, error, paused, runReview, observeReview, resumeReview, resolveFinding, invalidate };
}
