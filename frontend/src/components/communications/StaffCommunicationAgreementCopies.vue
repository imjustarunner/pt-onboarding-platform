<template>
  <section class="agreement-copies" aria-label="Communications agreements">
    <header><div><h3>Communications agreements</h3><p>Your signed communications agreements and personal-phone choices, preserved as they were at signing.</p></div><button type="button" :disabled="loading" @click="load">Refresh</button></header>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="loading">Loading signed copies…</p>
    <p v-else-if="!agreements.length">No signed communications agreements yet. Your copy appears here after you sign in the Provider Update or My Account preferences.</p>
    <ul v-else><li v-for="item in agreements" :key="item.reference"><div><strong>{{ item.brandName }} · {{ item.title }}</strong><p>Signed by {{ item.signerName }} · {{ new Date(item.signedAt).toLocaleString() }} · Version {{ item.version }}</p></div><button type="button" :disabled="!!downloading" @click="download(item)">{{ downloading===item.reference?'Preparing…':'View / download signed copy' }}</button></li></ul>
  </section>
</template>
<script setup>
import {ref,onMounted} from 'vue';
import api from '../../services/api';
const agreements=ref([]),loading=ref(false),downloading=ref(''),error=ref('');
async function load(){loading.value=true;error.value='';try{const {data}=await api.get('/me/communication-agreements');agreements.value=data.agreements||[];}catch{error.value='Unable to load your signed agreements. Please try again.';}finally{loading.value=false;}}
async function download(item){downloading.value=item.reference;error.value='';try{const {data}=await api.get(`/me/communication-agreements/${encodeURIComponent(item.reference)}/download`,{responseType:'blob'});const url=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download='signed-communications-agreement.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{error.value='Unable to open this signed copy. Please try again.';}finally{downloading.value='';}}
onMounted(load);
</script>
<style scoped>
.agreement-copies{margin:24px 0;padding:24px;border:1px solid #ccd6e0;border-radius:12px;background:var(--bg-primary,#fff)}header,li{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}h3{margin:0}p{line-height:1.5}ul{list-style:none;padding:0}li{padding:16px 0;border-top:1px solid #ccd6e0}button{padding:10px 16px;background:#244e7a;color:white;border:0;border-radius:6px;cursor:pointer}button:disabled{opacity:.6}[role=alert]{color:#a72121}
</style>
