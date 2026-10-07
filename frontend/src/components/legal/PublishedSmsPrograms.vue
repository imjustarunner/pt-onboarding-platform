<template>
  <aside v-if="programs.length" class="sms-program-directory">
    <h3>SMS program details</h3>
    <p>These program addenda form part of our main terms and explain the message types and choices for each program. Reading them does not subscribe you to texts.</p>
    <div v-for="program in programs" :key="program.termsUrl"><strong>{{ program.name }}</strong><nav :aria-label="program.name"><a :href="program.termsUrl">SMS addendum</a><a :href="program.privacyUrl">SMS privacy details</a><a :href="program.consentUrl">Consent example</a></nav></div>
  </aside>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({slug:{type:String,required:true}}),programs=ref([]);let request=0;
watch(()=>props.slug,async slug=>{const id=++request;programs.value=[];try{const {data}=await api.get(`/sms-numbers/public-programs/${encodeURIComponent(slug)}`,{skipAuthRedirect:true,skipGlobalLoading:true});if(id===request)programs.value=Array.isArray(data)?data:[];}catch{/* General policies remain available when the optional program directory is unavailable. */}},{immediate:true});
</script>
<style scoped>
.sms-program-directory{margin-top:24px;padding:20px;background:#f1f6f2;border:1px solid #cedcd2;border-radius:10px}h3{margin-top:0}nav{display:flex;gap:16px;flex-wrap:wrap;margin:8px 0 20px}a{color:var(--legal-brand,#285e51);text-underline-offset:3px}
</style>
