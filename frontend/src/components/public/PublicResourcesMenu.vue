<template>
 <div ref="root" class="public-resources" @mouseleave="leave" @keydown.esc.stop.prevent="close(true)" @focusout="focusOut">
  <button ref="trigger" type="button" :aria-expanded="open" @mouseenter="hoverMenu" @click="open=!open">Resources <span aria-hidden="true">⌄</span></button>
  <div v-if="open" class="public-resources-panel">
   <a v-if="safe(resourcesPath)" :href="safe(resourcesPath)">Helpful resources →</a>
   <div class="public-partners" @mouseenter="hoverPartners">
    <button ref="partnerTrigger" type="button" :aria-expanded="partnersOpen" @click="partnersOpen=!partnersOpen" @keydown.right.prevent="partnersOpen=true">Partners <span aria-hidden="true">›</span></button>
    <div v-if="partnersOpen" class="public-partners-panel" @keydown.left.stop.prevent="partnersOpen=false;partnerTrigger?.focus()">
     <small>Explore our partners</small>
     <p v-if="loading" role="status">Loading partners…</p>
     <button v-else-if="error" type="button" @click="load">Try loading partners again</button>
     <a v-for="partner in partners" :key="partner.slug" :href="partner.url" target="_blank" rel="noopener noreferrer" :aria-label="`${partner.name} (opens in a new tab)`">{{partner.name}} <span aria-hidden="true">↗</span></a>
     <p v-if="!loading&&!error&&!partners.length">No partner websites are published yet.</p>
    </div>
   </div>
  </div>
 </div>
</template>
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import api from '../../services/api';
import { publicWebsiteUrl as safe } from '../../composables/useStandalonePublicWebsite';
defineProps({resourcesPath:{type:String,default:''}});
const root=ref(),trigger=ref(),partnerTrigger=ref(),open=ref(false),partnersOpen=ref(false),partners=ref([]),loading=ref(true),error=ref(false);
let mounted=true;
async function load(){loading.value=true;error.value=false;try{const{data}=await api.get('/public/marketing-pages/partners',{skipAuthRedirect:true,skipGlobalLoading:true});if(mounted)partners.value=(data.partners||[]).filter(p=>p.name&&safe(p.url));}catch{if(mounted)error.value=true;}finally{if(mounted)loading.value=false;}}
function hoverMenu(){if(window.innerWidth>1100&&window.matchMedia('(hover: hover)').matches)open.value=true;}
function hoverPartners(){if(window.innerWidth>1100&&window.matchMedia('(hover: hover)').matches)partnersOpen.value=true;}
function close(focus=false){open.value=false;partnersOpen.value=false;if(focus)trigger.value?.focus();}
function outside(e){if(!root.value?.contains(e.target))close();}
function focusOut(e){if(!root.value?.contains(e.relatedTarget))close();}
function leave(){if(!root.value?.contains(document.activeElement))close();}
onMounted(()=>{load();document.addEventListener('pointerdown',outside);});
onUnmounted(()=>{mounted=false;document.removeEventListener('pointerdown',outside);});
</script>
<style scoped>
.public-resources{position:relative;display:inline-flex;align-items:center;color:inherit;font-size:inherit;text-align:left;z-index:60}.public-resources button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;text-align:left;padding:8px 0;display:flex;gap:12px;justify-content:space-between;align-items:center;white-space:nowrap}.public-resources-panel,.public-partners-panel{background:#fff;color:#123b4a;border:1px solid #d8e5e8;border-radius:10px;box-shadow:0 12px 34px #102d4420;min-width:210px;padding:8px;position:absolute;top:100%;right:0}.public-resources-panel a,.public-partners-panel a{display:flex;justify-content:space-between;gap:12px;color:#123b4a!important;text-decoration:none!important;font-size:14px!important;line-height:1.4;padding:11px!important;border-radius:5px;white-space:normal}.public-resources-panel button{padding:11px;width:100%;font-size:14px}.public-resources a:hover,.public-resources-panel button:hover{background:#eaf7f6}.public-resources :focus-visible{outline:2px solid #00818d;outline-offset:2px}.public-partners{position:relative}.public-partners-panel{right:100%;top:-8px;width:280px;max-height:70vh;overflow-y:auto}.public-partners-panel small{display:block;padding:8px 11px;color:#546b79}.public-partners-panel p{padding:10px;font-size:14px}
@media(max-width:1100px){.public-resources{display:block;width:100%}.public-resources>button{width:100%}.public-resources-panel,.public-partners-panel{position:static;width:100%;min-width:0;max-width:100%;box-sizing:border-box;box-shadow:none}.public-partners-panel{background:#f5fafb;margin-top:4px}}
</style>
