import {getCurrentInstance,getCurrentScope,onScopeDispose,watch} from 'vue';
import {getActivePinia} from 'pinia';
import {useSessionLockStore} from '../store/sessionLock';

function currentPinia() {
 const owner=getCurrentInstance();
 // Lightweight isolated surfaces/tests may have no Pinia provider. Avoid
 // resolving another app's global store or generating a missing-injection warn.
 if(owner){
  const provides=owner.appContext.provides;
  return Reflect.ownKeys(provides).map(key=>provides[key]).find(value=>value?._s instanceof Map&&typeof value.install==='function')||null;
 }
 return getActivePinia();
}
export function canPollWorkspace() {
 const pinia=currentPinia();
 if(!pinia)return true;
 const lock=useSessionLockStore(pinia);
 return !lock.isLocked&&!lock.warningActive&&!lock.verificationFailed;
}

// Skip protected background reads while the real session UI is paused. Keep
// existing state; never turn an authorization failure into an empty success.
// Resume reads fresh from the current actor/tenant instead of replaying a queue
// of old interval requests with stale parameters.
export function useSessionPolling(onResume) {
 const pinia=currentPinia(),lock=pinia?useSessionLockStore(pinia):null;let disposed=false,scheduled=false,releaseTimer;
 const schedule=()=>{
  if(disposed||scheduled||!canPollWorkspace())return;
  scheduled=true;queueMicrotask(()=>{try{if(!disposed&&canPollWorkspace())onResume();}finally{releaseTimer=setTimeout(()=>scheduled=false,0);}});
 };
 const stop=lock?watch(()=>!!(lock.isLocked||lock.warningActive||lock.verificationFailed),(paused,previous)=>{if(!paused&&previous)schedule();},{flush:'sync'}):()=>{};
 window.addEventListener('pt:session-resumed',schedule);
 const dispose=()=>{disposed=true;clearTimeout(releaseTimer);stop();window.removeEventListener('pt:session-resumed',schedule);};
 if(getCurrentScope())onScopeDispose(dispose);
 return dispose;
}
