<template>
  <section class="conf-entry">
    <header><div><h3>{{ attached ? 'Confidential Addendums' : 'Confidential Notes' }}</h3>
      <p>Visible to you in the client file. Excluded from routine record releases and guardian access.</p></div>
      <button type="button" :aria-expanded="opened" @click="toggle">{{ opened ? 'Close' : 'Open' }}</button></header>
    <div v-if="opened">
      <p v-if="loading" role="status">Loading entries…</p>
      <template v-for="group in entryGroups" :key="group.kind">
        <h4 v-if="!attached">{{ group.heading }}</h4>
        <ul><li v-for="entry in group.entries" :key="entry.id">
          <button type="button" :aria-expanded="selected === entry.id" @click="show(entry)">
            {{ group.label }} #{{ entry.id }} · {{ new Date(entry.createdAt).toLocaleString() }}
          </button>
          <p v-if="selected === entry.id" class="entry-body">{{ detail }}</p>
        </li></ul>
      </template>
      <form @submit.prevent="save">
        <label>{{ attached?'New confidential addendum':'New confidential note' }}<textarea v-model="body" rows="4" maxlength="32000" required :disabled="saving" /></label>
        <label class="attest"><input v-model="attested" type="checkbox" :disabled="saving" required />{{ attestation }}</label>
        <button class="save" type="submit" :disabled="saving || !body.trim() || !attested">{{ saving?'Saving…':'Save confidential entry' }}</button>
      </form>
      <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { CONFIDENTIAL_ATTESTATION as attestation } from '../../utils/confidentialAttestation.js';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String],sessionId:[Number,String],draftId:[Number,String],noteId:[Number,String],attached:Boolean,ensureDraft:Function,transport:Object,basePath:{type:String,default:'/clinical-notes'}});
const opened=ref(false),loading=ref(false),saving=ref(false),entries=ref([]),body=ref(''),attested=ref(false),detail=ref(''),selected=ref(null),notice=ref(''),error=ref('');
const entryGroups = computed(() => [
  { kind: 'note', heading: 'Standalone notes', label: 'Note' },
  { kind: 'addendum', heading: 'Note addendums', label: 'Addendum' }
].map(group => ({ ...group, entries: entries.value.filter(entry => entry.kind === group.kind) }))
  .filter(group => group.entries.length));
let generation=0,requestKey=null;
const path=()=>`${props.basePath}/clients/${props.clientId}/confidential-entries`;
function params(draftId=props.draftId){return {agencyId:props.agencyId,...(props.attached ? props.noteId?{noteId:props.noteId}:{draftId}: {})};}
watch(()=>[props.clientId,props.agencyId,props.sessionId,props.noteId],()=>{generation++;opened.value=false;body.value='';attested.value=false;entries.value=[];selected.value=null;detail.value='';error.value='';notice.value='';requestKey=null;saving.value=false;loading.value=false;});
watch(()=>props.draftId,(current,old)=>{if(old && current!==old){generation++;opened.value=false;body.value='';attested.value=false;requestKey=null;selected.value=null;detail.value='';entries.value=[];saving.value=false;loading.value=false;}});
watch(body,()=>{requestKey=null;attested.value=false;},{flush:'sync'});
const message=(e,fallback)=>e.response?.data?.error?.message || e.message || fallback;
async function transport() {
  return props.transport || (await import('../../services/api.js')).default;
}
async function load(){
 const version=generation;
 if(props.attached && !props.noteId && !props.draftId)return;
 loading.value=true;
 try{const {data}=await (await transport()).get(path(),{params:params()});if(version===generation)entries.value=Array.isArray(data?.entries) ? data.entries : [];}
 catch(e){if(version===generation)error.value=message(e,'Could not load entries.');}
 finally{if(version===generation)loading.value=false;}
}
function toggle(){if(saving.value)return;opened.value=!opened.value;selected.value=null;detail.value='';error.value='';notice.value='';if(opened.value)load();}
async function show(entry){
 const version=generation;selected.value=entry.id;detail.value='';error.value='';
 try{const {data}=await (await transport()).get(path()+'/'+entry.id,{params:params()});if(version===generation && selected.value===entry.id)detail.value=data.body;}
 catch(e){if(version===generation)error.value=message(e,'Could not open the entry.');}
}
async function save(){
 if(saving.value || !attested.value || !body.value.trim())return;
 const version=generation;saving.value=true;error.value='';notice.value='';
 try{
  let draftId=props.draftId;
  if(props.attached && !props.noteId && !draftId)draftId=await props.ensureDraft?.();
  if(version!==generation)return;
  if(props.attached && !props.noteId && !draftId)throw Error('Save this session draft before adding a confidential addendum.');
  requestKey ||= crypto.randomUUID();
  const {data}=await (await transport()).post(path(),{body:body.value,requestKey,attested:true},{params:params(draftId)});
  if(version!==generation)return;
  body.value='';attested.value=false;
  const label = props.attached ? 'Confidential addendum' : 'Confidential note';
  notice.value = data?.id ? `${label} #${data.id} saved.` : `${label} saved.`;
  await load();
 }catch(e){if(version===generation)error.value=message(e,'Could not save the entry.');}
 finally{if(version===generation)saving.value=false;}
}
</script>
<style scoped>
.conf-entry{background:var(--card-bg,#fff);color:var(--text-primary,#182c40);border:1px solid var(--border-color,#cbd9e4);border-radius:12px;padding:16px;min-width:0;align-self:start}.conf-entry header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.conf-entry h3{font-size:1rem;margin:0}.conf-entry p{font-size:.875rem;line-height:1.45;margin:5px 0;color:#52677a}.conf-entry form,.conf-entry label{display:grid;gap:6px}.conf-entry form{margin-top:14px;gap:10px}.conf-entry textarea{box-sizing:border-box;width:100%;font:inherit;border:1px solid #b4c6d5;border-radius:7px;padding:8px}.conf-entry .attest{display:flex;align-items:flex-start;font-size:.85rem}.conf-entry button{color:#18587a;background:#f4f8fb;border:1px solid #bfd1df;border-radius:8px;padding:7px 12px;cursor:pointer}.conf-entry .save{justify-self:start;background:#175579;color:white}.conf-entry button:disabled{opacity:.55}.entry-body{white-space:pre-wrap;overflow-wrap:anywhere}.conf-entry [role=alert]{color:#922f2c}.conf-entry ul{padding:0;list-style:none}
@media print { .conf-entry { display:none !important } }
</style>
