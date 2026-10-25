<template>
  <details v-if="available" class="qa-email-inbox">
    <summary>Email for {{ address }}</summary>
    <p>These are your email copies. Delivery to testing@itsco.health is checked separately.</p>
    <button type="button" :disabled="loading" @click="load()">Refresh emails</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!loading && !items.length">No emails recorded for this account yet.</p>
    <ul>
      <li v-for="item in items" :key="item.id">
        <button type="button" @click="open(item.id)">{{ item.subject || '(No subject)' }}</button>
        <span> · Email · {{ item.deliveryStatus }} · {{ item.sentAt || item.generatedAt }}</span>
      </li>
    </ul>
    <button v-if="nextCursor" type="button" :disabled="loading" @click="load(nextCursor)">Earlier emails</button>
    <article v-if="selected" aria-label="Email content">
      <h3>{{ selected.subject }}</h3>
      <p>To: {{ selected.recipient }} · Status: {{ selected.deliveryStatus }}</p>
      <p v-if="selected.from">From: {{ selected.from }}</p>
      <iframe title="Email message" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" :srcdoc="safeDocument" />
    </article>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
const auth = useAuthStore();
const available=ref(false), address=ref(''), items=ref([]), nextCursor=ref(null), selected=ref(null), loading=ref(false), error=ref('');
let generation=0;
const safeDocument=computed(() => {
  const clean=DOMPurify.sanitize(selected.value?.body || '', { FORBID_TAGS:['form','input','button','iframe','script','style','link','meta','base'], ADD_ATTR:['target'] });
  const document=new DOMParser().parseFromString(clean,'text/html');
  for(const link of document.querySelectorAll('a')){link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer');}
  const body=document.body.innerHTML;
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><style>body{font:16px/1.5 system-ui;padding:16px;overflow-wrap:anywhere}a{color:#1659a4}</style>'+body;
});
async function load(beforeId=null) {
  const version=++generation; loading.value=true; error.value=''; selected.value=null;
  try {
    const {data}=await api.get('/communications/qa-email-inbox',{params:beforeId?{beforeId}:{}});
    if(version!==generation)return;
    available.value=true; address.value=data.address; items.value=beforeId?[...items.value,...data.items]:data.items; nextCursor.value=data.nextCursor;
  } catch(e) { if(version===generation) { if(e.response?.status===404)available.value=false; else {available.value=true;error.value='Unable to load emails. Retry before marking this check passed.';} } }
  finally {if(version===generation)loading.value=false;}
}
async function open(id) {
  const version=++generation; error.value=''; selected.value=null;
  try {const {data}=await api.get(`/communications/qa-email-inbox/${id}`);if(version===generation)selected.value=data;}
  catch {if(version===generation)error.value='Unable to open this email.';}
}
watch([() => auth.user?.id, () => auth.user?.email], () => {
  generation++; available.value=false; items.value=[]; selected.value=null;
  if(/@example\.com$/i.test(auth.user?.email || ''))load();
},{immediate:true});
</script>

<style scoped>
.qa-email-inbox{padding:12px 16px;border:1px solid #d8e2ee;border-radius:10px;margin:12px 0;background:#fff;color:#172b46;max-height:70vh;overflow:auto}
summary{cursor:pointer;font-weight:650}li{margin:10px 0}button{cursor:pointer}iframe{width:100%;min-height:360px;border:1px solid #d8e2ee;background:white}span,p{font-size:13px;overflow-wrap:anywhere}
</style>
