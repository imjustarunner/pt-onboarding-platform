<template>
  <aside v-if="buildId" class="pl-release-status" :data-status="phase" role="status">
    <span v-if="phase === 'ready'">Release checked · {{ buildId.slice(0,9) }}</span>
    <span v-else-if="phase === 'rolling-out'">An update is rolling out. Keep this tab open and wait before starting another test.</span>
    <span v-else-if="phase === 'update-available'">An update is ready. Save your work, then refresh to use it.</span>
    <span v-else-if="phase === 'checking'">Checking release status…</span>
    <span v-else>Release status could not be confirmed. Check again before continuing a test.</span>
    <button type="button" :disabled="checking" @click="check">Check again</button>
    <details><summary>Build details</summary><dl><dt>This tab</dt><dd>{{ buildId }}</dd><dt>Published frontend</dt><dd>{{ frontend?.buildId || 'Unconfirmed' }}</dd><dt>Required backend</dt><dd>{{ frontend?.requiredBackendBuildId || 'Unconfirmed' }}</dd><dt>Live backend</dt><dd>{{ backend?.buildId || 'Unconfirmed' }}</dd></dl></details>
  </aside>
</template>
<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue';
import {deploymentReadiness} from '../../utils/appReleaseMonitor';
const props=defineProps({buildId:{type:String,default:()=>import.meta.env.VITE_APP_BUILD_ID || ''}});
const phase=ref('checking'),checking=ref(false),frontend=ref(null),backend=ref(null);
let active=true,timer,controller;
async function check(){
  if(checking.value || !props.buildId)return;
  checking.value=true;controller=new AbortController();
  const timeout=setTimeout(()=>controller?.abort(),10000);
  try{
    const read=async path=>{const response=await fetch(`${path}?t=${Date.now()}`,{cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)throw new Error('Release metadata unavailable');return response.json();};
    const [fe,be]=await Promise.all([read('/version.json'),read('/api/app-version')]);
    if(!active)return;frontend.value=fe;backend.value=be;phase.value=deploymentReadiness(props.buildId,fe,be);
  }catch{if(active){frontend.value=null;backend.value=null;phase.value='unconfirmed';}}
  finally{clearTimeout(timeout);if(active)checking.value=false;}
}
onMounted(()=>{if(props.buildId){void check();timer=setInterval(check,30000);window.addEventListener('focus',check);}});
onBeforeUnmount(()=>{active=false;clearInterval(timer);controller?.abort();window.removeEventListener('focus',check);});
</script>
<style scoped>
.pl-release-status{padding:6px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#f0f6f3;color:#214c3b;font:12px/1.5 system-ui}.pl-release-status[data-status=rolling-out],.pl-release-status[data-status=unconfirmed]{background:#fff4df;color:#65430b}.pl-release-status button{font:inherit;border:1px solid currentColor;border-radius:5px;background:transparent;padding:3px 8px;color:inherit}.pl-release-status details{margin-left:auto;position:relative}.pl-release-status dl{background:white;border:1px solid #cbd5ce;padding:12px;max-width:85vw;overflow-wrap:anywhere}.pl-release-status dd{margin:0 0 6px}
</style>
