<template>
 <aside v-if="update?.available" class="assigned-update" aria-label="Your Provider Update">
  <div><span class="eyebrow">READY FOR YOU</span><h2>Your Provider Update is ready</h2><p>{{update.title}} · Open it to review your information and complete each section. You can save and return.</p></div>
  <router-link :to="updateLink">Open my Provider Update →</router-link>
 </aside>
</template>
<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],default:null}}),route=useRoute(),update=ref(null);
const updateLink=computed(()=>({path:`${route.params.organizationSlug?'/'+route.params.organizationSlug:''}/provider/update`,query:{agencyId:String(props.agencyId)}}));
let alive=true,timer;
async function load(){const id=Number(props.agencyId);if(!id){update.value=null;return;}try{const {data}=await api.get('/provider-update/me/status',{params:{agencyId:id},skipGlobalLoading:true});if(alive&&id===Number(props.agencyId))update.value=data;}catch{if(alive&&id===Number(props.agencyId))update.value=null;}}
watch(()=>props.agencyId,()=>{update.value=null;void load();},{immediate:true});
function focus(){if(!document.hidden)void load();}
onMounted(()=>{window.addEventListener('focus',focus);timer=setInterval(focus,60000);});
onBeforeUnmount(()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',focus);});
</script>
<style scoped>.assigned-update{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px 26px;margin:20px 0;border:1px solid #b7d8d1;border-radius:16px;background:linear-gradient(115deg,#eaf6ef,#edf4fc);color:#21483f}.eyebrow{font-size:11px;letter-spacing:.12em;font-weight:750}.assigned-update h2{margin:7px 0;font-size:23px}.assigned-update p{margin:0;line-height:1.6}.assigned-update a{flex-shrink:0;background:#285b51;color:white;padding:13px 18px;border-radius:9px;text-decoration:none;font-weight:650}@media(max-width:650px){.assigned-update{align-items:flex-start;flex-direction:column}}</style>
