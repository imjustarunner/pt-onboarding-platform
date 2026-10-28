<template>
  <section class="guardian-contact-card">
    <p v-if="loading" role="status">Loading guardian contact…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else-if="contact">
      <header><div><h3>{{ contact.guardian.name || 'Guardian' }}</h3><p>{{ contact.guardian.email || 'No email on file' }}</p></div><RouterLink v-if="showAccountLink" :to="accountPath">Open guardian account</RouterLink></header>
      <p>Select every client this email concerns. The conversation will be filed in each selected client’s record.</p>
      <fieldset v-for="agency in agencies" :key="agency.id">
        <legend>{{ agency.name }}</legend>
        <label v-for="client in agency.clients" :key="client.id"><input v-model="selectedIds" type="checkbox" :value="client.id" /> {{ client.name }}</label>
        <div v-for="client in agency.clients.filter(c => c.contactPreferences)" :key="`preferences-${client.id}`">
          <p v-if="client.contactPreferences.noRoutineCalls"><strong>{{ client.name }}: No routine phone calls.</strong> Use the family's other contact options.</p>
          <p v-if="client.contactPreferences.noAutomaticEmail"><strong>{{ client.name }}: No automatic emails.</strong> Review a safe contact method before outreach.</p>
          <p v-if="client.contactPreferences.alternativeContactInstructions">{{ client.name }} — {{ client.contactPreferences.alternativeContactInstructions }}</p>
        </div>
        <button type="button" class="btn btn-primary" :disabled="!contact.guardian.email || !selectedFor(agency).length" @click="compose(agency)">Email guardian about {{ selectedFor(agency).length || 'selected' }} {{ selectedFor(agency).length === 1 ? 'client' : 'clients' }}</button>
      </fieldset>
      <section v-if="voicemails.length || voicemailError" aria-label="Guardian voicemails">
        <h4>Voicemail communications</h4>
        <ul><li v-for="thread in voicemails" :key="thread.id"><button type="button" @click="openVoicemail(thread)">{{ thread.subject || 'Voicemail' }} · {{ new Date(thread.last_message_at).toLocaleDateString() }}</button></li></ul>
        <EmailThreadReader v-if="voicemail" :conversation="voicemail.conversation" :messages="voicemail.messages" read-only />
        <p v-if="voicemailError" role="alert">{{ voicemailError }}</p>
      </section>
      <p class="contact-help">One email goes to this guardian. Sent messages record parent contact; a reply marks the contact successful.</p>
    </template>
  </section>
</template>
<script setup>
import EmailThreadReader from '../messages/EmailThreadReader.vue';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { openEmailComposer } from '../../utils/emailComposerWindow';
const props=defineProps({guardianId:{type:Number,required:true},clientId:Number,showAccountLink:Boolean});
const route=useRoute(),router=useRouter();
const contact=ref(null),loading=ref(false),error=ref(''),selectedIds=ref([]);
const voicemails=ref([]),voicemail=ref(null),voicemailError=ref('');
let generation=0;
async function openVoicemail(thread) {
  const current=generation;voicemailError.value='';
  try { const {data}=await api.get(`/communications/conversations/${thread.id}`);if(current===generation)voicemail.value=data; }
  catch { if(current===generation)voicemailError.value='Could not open this voicemail.'; }
}
const accountPath=computed(()=>`${route.params.organizationSlug ? `/${encodeURIComponent(route.params.organizationSlug)}` : ''}/guardian-contacts/${props.guardianId}`);
const agencies=computed(()=>{
  const map=new Map();
  for(const c of contact.value?.clients||[]){if(!map.has(c.agencyId))map.set(c.agencyId,{id:c.agencyId,name:c.agencyName,clients:[]});map.get(c.agencyId).clients.push(c);}
  return [...map.values()];
});
const selectedFor=agency=>agency.clients.filter(c=>selectedIds.value.includes(c.id)).map(c=>c.id);
function compose(agency){openEmailComposer(router,{mode:'new',agencyId:agency.id,to:contact.value.guardian.email,clientIds:selectedFor(agency).join(',')});}
watch(()=>[props.guardianId,props.clientId],async()=>{
  const current=++generation;loading.value=true;error.value='';contact.value=null;selectedIds.value=[];voicemails.value=[];voicemail.value=null;voicemailError.value='';
  try{const {data}=await api.get(`/communications/guardian-contacts/${props.guardianId}`);if(current!==generation)return;contact.value=data;selectedIds.value=data.clients.some(c=>c.id===props.clientId)?[props.clientId]:[];
    try { const recordings=await api.get(`/communications/guardian-contacts/${props.guardianId}/voicemails`);if(current===generation)voicemails.value=recordings.data?.conversations||[]; }
    catch { if(current===generation)voicemailError.value='Could not load voicemail communications.'; }}
  catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Could not load guardian contact.';}
  finally{if(current===generation)loading.value=false;}
},{immediate:true});
</script>
<style scoped>
.guardian-contact-card{margin:18px 0;padding:20px;border:1px solid #cbd7e6;border-radius:12px;background:#fff;color:#203650}.guardian-contact-card header{display:flex;justify-content:space-between;align-items:start;gap:16px;flex-wrap:wrap}.guardian-contact-card h3{margin:0;font-size:19px}.guardian-contact-card p{line-height:1.5;margin:8px 0 14px}.guardian-contact-card fieldset{border:1px solid #d6e0ec;border-radius:8px;padding:14px;margin-top:12px}.guardian-contact-card legend{font-weight:650;padding:0 6px}.guardian-contact-card label{display:flex;align-items:center;gap:10px;padding:9px 0;font-weight:600}.guardian-contact-card input{width:18px;height:18px}.guardian-contact-card button{margin-top:12px;white-space:normal}.contact-help{font-size:13px;color:#52647c}
</style>
