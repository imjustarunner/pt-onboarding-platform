import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { getCachedDirectoryAvailability, readDirectoryAvailability } from '../services/publicAvailabilityRead';

export function usePublicDirectoryAvailability(agencySlug, enabled, query) {
  const snapshot=ref(getCachedDirectoryAvailability(agencySlug,query.value)),refreshing=ref(false),error=ref('');
  let generation=0;
  async function load({force=false}={}) {
    if(!enabled.value)return;
    const id=++generation;
    snapshot.value=getCachedDirectoryAvailability(agencySlug,query.value);
    refreshing.value=true;error.value='';
    try {
      const result=await readDirectoryAvailability(agencySlug,query.value,{force});
      if(id===generation)snapshot.value=result;
    } catch {
      if(id===generation)error.value=snapshot.value?'Saved availability is shown. We could not refresh it; open a provider for their current schedule.':'Appointment times could not be loaded. Open a provider to check their schedule.';
    } finally { if(id===generation)refreshing.value=false; }
  }
  watch([enabled,()=>JSON.stringify(query.value)],()=>{
    generation++;refreshing.value=false;
    if(enabled.value)load();
  },{immediate:true});
  // Reuse the five-minute snapshot on intermediate ticks; prune times that passed.
  const tick=()=>{if(enabled.value && !document.hidden && !refreshing.value)load();};
  const timer=setInterval(tick,60000);
  document.addEventListener('visibilitychange',tick);
  onBeforeUnmount(()=>{generation++;clearInterval(timer);document.removeEventListener('visibilitychange',tick);});
  return {availability:computed(()=>snapshot.value?.providers||{}),checkedAt:computed(()=>snapshot.value?.checkedAt||null),loading:computed(()=>refreshing.value&&!snapshot.value),refreshing,error,load};
}
