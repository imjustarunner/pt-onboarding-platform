import { ref, unref, onScopeDispose, watch } from 'vue';

const active = value => ['running', 'pending'].includes(value?.status);
const message = error => error?.response?.data?.error?.message || 'Narriva review is unavailable. Your note is preserved.';

/** Review state contains server evidence only. A local edit discards the badge. */
export function useNarrivaReview({ agencyId, apiClient, base = '/narriva', pollMs = 1200 } = {}) {
  const review = ref(null), busy = ref(false), error = ref(''), paused = ref(false);
  let generation = 0, timer = null, settle = null;
  let pausedGeneration = null, pausedSession = null;
  const sessionKey = () => { try { return window.localStorage.getItem('sessionId'); } catch { return null; } };
  function cancel() { clearTimeout(timer); timer = null; settle?.(); settle = null; generation++; busy.value = false; paused.value=false; pausedGeneration=null; pausedSession=null; }
  function invalidate() { cancel(); review.value = null; error.value = ''; }
  function handleError(e,current) {
    if(current!==generation)return;
    if(e?.response?.status===423 && e?.response?.data?.error?.code==='SESSION_LOCKED' && active(review.value)) {
      paused.value=true;pausedGeneration=current;pausedSession=sessionKey();
      error.value='Unlock your session to continue. Your saved note and review are preserved; the same review resumes after you unlock.';
    } else error.value=message(e);
  }
  const wait = () => new Promise(resolve => { settle = resolve; timer = setTimeout(() => { settle = null; resolve(); }, pollMs); });
  async function pollReview(current) {
    const deadline=Date.now()+180000;
    while(active(review.value) && current===generation){
      if(Date.now()>=deadline)throw new Error('Review did not complete');
      await wait();if(current!==generation)return null;
      const result=await apiClient.get(`${base}/reviews/${review.value.id}`,{params:{agencyId:Number(unref(agencyId))},skipGlobalLoading:true});
      if(current!==generation)return null;
      if(!result.data?.review?.id)throw new Error('Missing review');
      review.value=result.data.review;
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
  async function resolveFinding({ findingId, action = 'bypass', reason }) {
    if (busy.value || !review.value?.id) return;
    const current = generation; busy.value = true; error.value = '';
    try {
      const { data } = await apiClient.patch(`${base}/reviews/${review.value.id}/findings`, { agencyId: Number(unref(agencyId)), findingId, action, reason }, { skipGlobalLoading: true });
      if (current === generation) review.value = data?.review || null;
    } catch (e) { if (current === generation) error.value = message(e); }
    finally { if (current === generation) busy.value = false; }
  }
  onScopeDispose(()=>{cancel();if(typeof window!=='undefined')window.removeEventListener('pt:session-resumed',onResumed);});
  return { review, busy, error, paused, runReview, observeReview, resumeReview, resolveFinding, invalidate };
}
