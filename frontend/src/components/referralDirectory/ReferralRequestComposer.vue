<template>
  <details class="referral-composer" @toggle="loadServices">
    <summary>Find and email referral options</summary>
    <form @submit.prevent="findMatches">
      <label>What services are needed?
        <input v-model="request" maxlength="500" placeholder="For example: a psychologist or psychiatrist" />
      </label>
      <fieldset><legend>Services (optional)</legend>
        <label v-for="service in services" :key="service.id" class="service-check"><input type="checkbox" v-model="selectedServices" :value="service.id" /> {{ service.label }}</label>
      </fieldset>
      <div class="fields"><label>Location (optional)<input v-model="location" placeholder="Colorado Springs" /></label>
        <label>Insurance (optional)<input v-model="insurance" placeholder="Plan name" /></label></div>
      <p class="hint">Filters use directory information. Age range, language, appointment format and coverage should be confirmed with the practice.</p>
      <button class="btn btn-secondary" :disabled="busy">Find options</button>
    </form>
    <p v-if="searched && !matches.length">No tagged matches. Add or propose service tags on directory entries, or adjust the filters.</p>
    <div v-if="matches.length">
      <p>{{ warning }}</p>
      <label v-for="entry in matches" :key="entry.id" class="match"><input type="checkbox" v-model="selectedEntries" :value="entry.id" />
        <span><strong>{{ entry.organization_name || entry.name }}</strong><br>{{ entry.phone }} · {{ entry.address || 'Location not recorded' }}</span>
      </label>
      <form @submit.prevent="previewEmail">
        <div class="fields"><label>Recipient email<input v-model="to" type="email" required /></label><label>First name (optional)<input v-model="name" maxlength="100" /></label></div>
        <button class="btn btn-primary" :disabled="busy || !selectedEntries.length || selectedEntries.length > 6">Preview email</button>
      </form>
    </div>
    <section v-if="preview" class="preview" aria-label="Referral email preview">
      <p><strong>From / Reply-to:</strong> {{ preview.from }}<br><strong>To:</strong> {{ preview.to }}<br><strong>Subject:</strong> {{ preview.subject }}</p>
      <p class="hint">The email uses your agency’s email branding and support signature.</p>
      <pre>{{ preview.text }}</pre>
      <button class="btn btn-primary" :disabled="busy || sendAttempted" @click="sendEmail">Send from support</button>
    </section>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="result" role="status">{{ result }}</p>
  </details>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[String,Number],required:true}});
const services=ref([]),selectedServices=ref([]),request=ref(''),location=ref(''),insurance=ref('');
const matches=ref([]),selectedEntries=ref([]),searched=ref(false),warning=ref(''),busy=ref(false);
const to=ref(''),name=ref(''),preview=ref(null),error=ref(''),result=ref(''),sendAttempted=ref(false);
let generation=0;
watch(()=>props.agencyId,()=>{generation++;matches.value=[];selectedEntries.value=[];preview.value=null;to.value='';name.value='';searched.value=false;result.value='';error.value='';busy.value=false;});
watch([to,name,selectedEntries,request,selectedServices,location,insurance],()=>{preview.value=null;result.value='';sendAttempted.value=false;},{deep:true});
async function loadServices(){if(services.value.length)return;try{services.value=(await api.get('/referral-directory/services',{params:{agencyId:props.agencyId}})).data.services;}catch{error.value='Unable to load referral services.';}}
async function run(fn){const scope=generation;error.value='';busy.value=true;try{await fn(scope);}catch(e){if(scope===generation)error.value=e.response?.data?.error?.message||'The request could not be completed.';}finally{if(scope===generation)busy.value=false;}}
async function findMatches(){await run(async scope=>{const {data}=await api.post('/referral-directory/match',{agencyId:props.agencyId,services:selectedServices.value,request:request.value,location:location.value,insurance:insurance.value});if(scope!==generation)return;matches.value=data.entries;warning.value=data.warning;selectedEntries.value=[];preview.value=null;searched.value=true;});}
async function previewEmail(){await run(async scope=>{const {data}=await api.post('/referral-directory/outreach/preview',{agencyId:props.agencyId,to:to.value,name:name.value,entryIds:selectedEntries.value});if(scope!==generation)return;preview.value=data;sendAttempted.value=false;});}
async function sendEmail(){if(!preview.value||sendAttempted.value)return;sendAttempted.value=true;await run(async scope=>{const {data}=await api.post(`/referral-directory/outreach/${preview.value.id}/send`,{agencyId:props.agencyId});if(scope!==generation)return;result.value=data.status==='sent'?`Email sent. Replies will appear in support ticket #${data.ticketId}.`:data.status==='queued'?`Email queued for review. Support ticket #${data.ticketId}.`:`Delivery status: ${data.status}. Check support ticket #${data.ticketId || ''} before sending again.`;});}
</script>
<style scoped>
.referral-composer{border:1px solid var(--border,#dce2e8);border-radius:12px;padding:20px;margin:16px 0;background:var(--card-bg,#fff)}summary{font-weight:650;cursor:pointer}form{margin-top:18px}label{display:block;margin:10px 0}input:not([type=checkbox]){display:block;width:100%;padding:10px;border:1px solid #b6c3d1;border-radius:6px;box-sizing:border-box}fieldset{border:1px solid #dce2e8;border-radius:8px;margin:16px 0}.service-check{display:inline-block;margin:6px 16px 6px 0}.fields{display:flex;gap:16px;flex-wrap:wrap}.fields label{flex:1;min-width:180px}.match{display:flex;gap:10px;align-items:flex-start;padding:10px;border-bottom:1px solid #dce2e8}.hint{font-size:13px;color:var(--text-secondary,#526174)}.preview{margin-top:20px;padding:18px;background:var(--bg-secondary,#f6f8fb);border-radius:8px}pre{white-space:pre-wrap;font:inherit;line-height:1.6}
</style>
