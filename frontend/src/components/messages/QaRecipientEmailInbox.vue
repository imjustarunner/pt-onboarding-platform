<template>
  <details v-if="available" class="qa-email-inbox" :open="!!error">
    <summary>Email for {{ address }}</summary>
    <p>These are your email copies. Delivery to testing@itsco.health is checked separately.</p>
    <button type="button" :disabled="loading" @click="load()">Refresh emails</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!loading && !error && !items.length">No emails recorded for this account yet.</p>
    <div class="email-layout" :class="{ 'has-selection': !!selected }">
    <div class="email-list">
    <ul aria-label="Email copies">
      <li v-for="item in items" :key="item.id">
        <button type="button" :aria-pressed="selected?.id === item.id" @click="open(item.id)">{{ item.subject || '(No subject)' }}</button>
        <span>{{ item.deliveryStatus }} · {{ formatTime(item.sentAt || item.generatedAt) }}</span>
      </li>
    </ul>
    <button v-if="nextCursor" type="button" :disabled="loading" @click="load(nextCursor)">Earlier emails</button>
    </div>
    <article v-if="selected" aria-label="Email content">
      <h3>{{ selected.subject }}</h3>
      <p>To: {{ selected.recipient }} · Status: {{ selected.deliveryStatus }}</p>
      <p v-if="selected.from">From: {{ selected.from }}</p>
      <iframe title="Email message" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" :srcdoc="safeDocument" />
    </article>
    </div>
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
function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, {
    month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'
  }).format(date);
}
const safeDocument=computed(() => {
  const clean=DOMPurify.sanitize(selected.value?.body || '', { FORBID_TAGS:['form','input','button','iframe','script','style','link','meta','base'], ADD_ATTR:['target'] });
  const document=new DOMParser().parseFromString(clean,'text/html');
  for(const link of document.querySelectorAll('a')){link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer');}
  // Remote images remain blocked; avoid displaying broken-image placeholders.
  for(const img of document.querySelectorAll('img')) {
    if (!String(img.getAttribute('src') || '').startsWith('data:')) img.remove();
  }
  const body=document.body.innerHTML;
  return '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><style>body{font:16px/1.5 system-ui;margin:0;padding:12px;overflow-wrap:anywhere}table{max-width:100%!important}img{max-width:100%;height:auto}a{color:#1659a4}</style>'+body;
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
  address.value=auth.user?.email || ''; nextCursor.value=null; error.value='';
  if(/@example\.com$/i.test(auth.user?.email || ''))load();
},{immediate:true});
</script>

<style scoped>
.qa-email-inbox{padding:16px;border:1px solid #d8e2ee;border-radius:12px;margin:12px 0;background:#fff;color:#172b46;min-width:0}
summary{cursor:pointer;font-weight:650;overflow-wrap:anywhere}
.email-layout{display:grid;gap:20px;margin-top:16px;min-width:0}
.email-layout.has-selection{grid-template-columns:minmax(220px,300px) minmax(0,1fr)}
.email-list{min-width:0;max-height:650px;overflow:auto}
ul{list-style:none;padding:0;margin:0}li{padding:12px 0;border-bottom:1px solid #e8edf4}
button{cursor:pointer;border:1px solid #d8e2ee;border-radius:8px;background:#f7f9fc;color:#172b46;padding:9px 12px;font:inherit}
button:disabled{cursor:wait;opacity:.65}li button{width:100%;text-align:left;line-height:1.45;overflow-wrap:anywhere;background:transparent;border-color:transparent}
li button:hover,li button[aria-pressed="true"]{background:#edf4ff;border-color:#b9d3fa}
li span{display:block;margin:6px 12px;color:#52647a}
article{min-width:0}h3{margin:0 0 12px;font-size:18px;line-height:1.4;overflow-wrap:anywhere}
iframe{display:block;box-sizing:border-box;width:100%;height:650px;border:1px solid #d8e2ee;border-radius:10px;background:white}
span,p{font-size:13px;line-height:1.5;overflow-wrap:anywhere}
@media(max-width:850px){.email-layout.has-selection{grid-template-columns:minmax(0,1fr)}.email-list{max-height:240px}iframe{height:560px}.qa-email-inbox{padding:12px}}
</style>
