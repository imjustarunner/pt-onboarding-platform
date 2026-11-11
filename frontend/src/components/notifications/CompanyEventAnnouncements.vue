<template>
  <Teleport to="body"><div v-if="current" class="event-splash-overlay" @click.self="dismiss">
    <section class="event-splash" role="dialog" aria-modal="true" aria-labelledby="event-splash-title" tabindex="-1" ref="dialog" @keydown.esc.prevent="dismiss" @keydown.tab="trapFocus">
      <button type="button" class="event-splash-close" aria-label="Dismiss event update" @click="dismiss">×</button>
      <span class="event-splash-label">Your invitation · Event update</span><h2 id="event-splash-title">{{ current.title }}</h2><p>{{ current.message }}</p>
      <a :href="current.url" class="event-splash-action" @click="markRead">View event &amp; RSVP →</a><button type="button" class="event-splash-later" @click="dismiss">Got it</button>
      <small v-if="items.length>1">{{ items.length-1 }} more event update{{ items.length>2?'s':'' }}</small>
    </section>
  </div></Teleport>
</template>
<script setup>
import {computed,nextTick,onMounted,onUnmounted,ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({userId:{type:[Number,String],required:true}});
const items=ref([]),dialog=ref(null),current=computed(()=>items.value[0]);let timer,previousFocus,generation=0;
async function refresh(){const requestGeneration=generation,requestUser=props.userId;try{const {data}=await api.get('/company-events/announcements/mine',{skipGlobalLoading:true});if(requestGeneration!==generation || requestUser!==props.userId)return;items.value=Array.isArray(data)?data:[];}catch(e){if(requestGeneration===generation && [401,403].includes(e?.response?.status))items.value=[];}}
async function markRead(){if(current.value)await api.put(`/notifications/${current.value.id}/read`).catch(()=>{});}
async function dismiss(){const id=current.value?.id;await markRead();items.value=items.value.filter(item=>item.id!==id);if(!items.value.length)previousFocus?.focus?.();}
function trapFocus(event){const nodes=dialog.value?.querySelectorAll('button,a[href]');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
watch(()=>current.value?.id,async(value,old)=>{if(value){if(!old)previousFocus=document.activeElement;await nextTick();dialog.value?.focus();}});
watch(()=>props.userId,()=>{generation++;items.value=[];refresh();});
onMounted(()=>{refresh();timer=setInterval(refresh,60000);});onUnmounted(()=>{generation++;clearInterval(timer);previousFocus?.focus?.();});
</script>
<style scoped>
.event-splash-overlay{position:fixed;inset:0;z-index:9900;background:#173b316b;backdrop-filter:blur(5px);display:grid;place-items:center;padding:22px}.event-splash{position:relative;width:min(100%,520px);box-sizing:border-box;border-radius:22px;padding:42px;background:#fbfcf8;color:#203d36;box-shadow:0 25px 100px #10271d40;outline:0}.event-splash-label{font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#6a8373}.event-splash h2{color:#203d36;font-size:30px;line-height:1.2;margin:18px 0}.event-splash p{font-size:16px;line-height:1.7;white-space:pre-wrap}.event-splash-close{position:absolute;right:18px;top:14px;border:0;background:transparent;font-size:26px;color:#547262;cursor:pointer}.event-splash-action{display:inline-block;padding:13px 19px;border-radius:9px;background:#315e4c;color:#fff;text-decoration:none;margin:12px 8px 12px 0}.event-splash-later{border:0;background:transparent;color:#315e4c;padding:12px;cursor:pointer;font:inherit}.event-splash small{display:block;color:#6a8373}button:focus-visible,a:focus-visible{outline:3px solid #78a98e;outline-offset:4px}
</style>
