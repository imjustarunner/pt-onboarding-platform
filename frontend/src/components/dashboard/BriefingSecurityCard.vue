<template>
  <article class="briefing-card briefing-card--slate briefing-security" aria-label="Recent sign-ins and account security">
    <header><ShieldCheck :size="28" aria-hidden="true" /><h2>Recent sign-ins</h2></header>
    <p v-if="loading" role="status">Checking your sign-in history…</p>
    <p v-else-if="error" role="status">{{ error }} <button type="button" @click="load">Try again</button></p>
    <ul v-else-if="sessions.length">
      <li v-for="session in sessions" :key="session.reference">
        <strong>{{ session.current ? 'This sign-in' : session.browser || 'Previous sign-in' }}</strong>
        <time :datetime="session.startedAt">{{ time(session.startedAt) }}</time>
        <small v-if="session.current && session.browser">{{ session.browser }}</small>
      </li>
    </ul>
    <p v-else>No earlier sign-ins are recorded yet.</p>
    <p class="security-advice">If you don’t recognize a sign-in, review your account security and end unfamiliar sessions.</p>
    <button type="button" class="security-link" @click="$emit('navigate', to)">Review account security</button>
  </article>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { ShieldCheck } from '@lucide/vue';
import api from '../../services/api';
const props = defineProps({ userId:[Number,String], to:{type:String,default:'/account-security'} });
defineEmits(['navigate']);
const sessions=ref([]),loading=ref(false),error=ref('');let generation=0;
const time=value=>{const d=new Date(value);return Number.isFinite(+d)?d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Time not recorded';};
async function load(){const g=++generation;sessions.value=[];error.value='';if(!props.userId)return;loading.value=true;try{
  const {data}=await api.get('/account-security/sessions',{params:{page:0},skipGlobalLoading:true,skipAuthRedirect:true,timeout:8000});
  if(g===generation)sessions.value=(Array.isArray(data?.items)?data.items:[]).slice(0,3);
}catch{if(g===generation)error.value='Recent sign-ins could not be loaded.';}finally{if(g===generation)loading.value=false;}}
watch(()=>props.userId,load,{immediate:true});onBeforeUnmount(()=>generation++);
</script>
<style scoped>
.briefing-security{padding:20px;border:1px solid #dce2ea;border-radius:12px;background:#fff;color:#172033;display:flex;flex-direction:column;gap:12px;min-width:0}
header{display:flex;align-items:center;gap:12px;color:var(--brief-primary,#1f6b4a)}h2{font:inherit;font-size:16px;font-weight:700;margin:0}
ul{list-style:none;margin:0;padding:0}li{display:flex;flex-direction:column;gap:4px;padding:10px 0;border-bottom:1px solid #edf1f5}time,small,p{font-size:14px;line-height:1.5}time,small{color:#526078}p{margin:0}.security-advice{margin-top:auto;color:#526078}
button{font:inherit;cursor:pointer}.security-link{align-self:flex-start;border:0;padding:0;background:transparent;color:var(--brief-primary,#1f6b4a);font-weight:700;text-align:left}
</style>
