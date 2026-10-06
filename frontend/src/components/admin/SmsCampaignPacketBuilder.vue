<template>
  <details class="packet-builder" @toggle="opened">
    <summary>Generate a new campaign and branded SMS pages</summary>
    <p>Use this for a new messaging program. Your existing carrier approvals and sending settings are unchanged.</p>
    <label>Program<select v-model="program" @change="load"><option value="operations">Service communications</option><option value="workforce">Staff notifications</option><option value="polling">Staff notifications and voting</option><option value="marketing">Program announcements</option><option value="account">Account notifications</option></select></label>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="packet" @submit.prevent="save(false)">
      <div class="packet-fields">
        <label v-for="field in fields" :key="field.key">{{ field.label }}<input v-model="profile[field.key]" :type="field.url ? 'url' : 'text'" :maxlength="field.url ? 800 : 180" /></label>
        <label>Whose traffic?<select v-model="profile.ownership"><option value="">Choose ownership</option><option value="own">This is our own business / an owned legal entity</option><option value="reseller">We register for an independent customer business</option></select></label>
        <label>Expected traffic<select v-model="profile.volume"><option value="low">Low Volume Mixed — verify carrier limits ($1.50/month listed)</option><option value="standard">Standard campaign ($10/month listed)</option></select></label>
      </div>
      <p>Enter the exact legal identity used in Vonage. Do not enter an EIN or API secret here. Each independent business uses its own registration. The organization privacy-policy link must describe its actual practices; these generated pages cover SMS only.</p>
      <button :disabled="busy">Save and generate packet</button>
      <label><input v-model="confirmed" type="checkbox" /> I reviewed the business identity, SMS notices and consent process below and confirm they accurately describe this organization’s program.</label>
      <button type="button" :disabled="busy || !confirmed || changed" @click="save(true)">Publish branded review pages</button>
      <p v-if="changed">Save your changes to regenerate the packet before publishing.</p>
      <p v-if="packet.missing?.length">Complete before publishing: {{ packet.missing.join('; ') }}</p>
    </form>
    <template v-if="packet">
      <p>{{ packet.published ? 'Current packet pages are published.' : packet.hasPublished ? 'A previous version is published. These draft changes are not public yet.' : 'Draft. Public links will work after publication and deployment.' }}</p>
      <p>Agency administrators can repeat this setup for any agency without editing code. Publishing creates review pages; it does not submit to Vonage, buy a number, activate texting or enroll recipients.</p>
      <div v-if="packet.published" class="packet-actions">
        <a :href="packet.links.exampleUrl" target="_blank" rel="noopener">Consent example</a>
        <a :href="packet.links.staffExampleUrl" target="_blank" rel="noopener">Staff consent example</a>
        <a :href="packet.links.privacyUrl" target="_blank" rel="noopener">SMS privacy notice</a>
        <a :href="packet.links.termsUrl" target="_blank" rel="noopener">SMS terms</a>
      </div>
      <button type="button" @click="download">Download step-by-step packet</button>
      <button v-if="packet.published" type="button" @click="$emit('use-profile', packet.registration)">Use these published details for the selected number</button>
      <details v-for="step in packet.steps" :key="step.title" class="packet-step"><summary>{{ step.title }}</summary>
        <div v-for="(value, label) in step.fields" :key="label"><strong>{{ label }}</strong><p class="packet-value">{{ value }}</p><button type="button" @click="copy(value)">Copy {{ label }}</button></div>
      </details>
      <details><summary>Review generated SMS notices before publishing</summary><p>Use Preview to review the exact SMS terms, privacy notice and consent disclosure generated from your saved details.</p><button type="button" @click="showPreview = !showPreview">{{ showPreview ? 'Hide preview' : 'Preview' }}</button>
        <template v-if="showPreview && packet.preview"><h4>{{ packet.preview.brandName }}</h4><p>{{ packet.preview.consent.disclosure.text }}</p>
          <div v-for="kind in ['terms','privacy']" :key="kind"><h4>{{ kind === 'terms' ? 'SMS terms' : 'SMS privacy notice' }}</h4><section v-for="section in packet.preview[kind]" :key="section.title"><strong>{{ section.title }}</strong><p>{{ section.body }}</p></section></div>
        </template>
      </details>
    </template>
  </details>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [Number,String], required: true } });
defineEmits(['use-profile']);
const program=ref('polling'),packet=ref(null),profile=ref({}),error=ref(''),notice=ref(''),busy=ref(false),confirmed=ref(false),showPreview=ref(false);
const fields=[['legalName','Exact legal business name'],['brandName','Public brand name'],['brandId','Existing Vonage brand ID (if registered)'],['supportContact','Public support email or phone'],['website','Public business website',true],['portalUrl','Working account or meeting portal URL',true],['organizationPrivacyUrl','Organization’s existing privacy policy',true],['logoUrl','Public HTTPS logo URL (optional)',true],['resellerId','Vonage reseller ID (customer-business traffic only)'],['organizationType','Legal organization type (new brand only)'],['vertical','Business industry (new brand only)'],['businessAddress','Official business address (private packet only)'],['country','Country of registration (new brand only)']].map(([key,label,url])=>({key,label,url}));
const changed=computed(()=>JSON.stringify(profile.value)!==JSON.stringify(packet.value?.profile||{}));
let requestId=0;
let isOpen=false;
const endpoint=()=>`/sms-numbers/agency/${props.agencyId}/campaign-packets/${program.value}`;
const failure=e=>{error.value=e.response?.data?.error?.message||e.message||'Unable to prepare the campaign';};
function accept(data){packet.value=data;profile.value=structuredClone(data.profile);confirmed.value=false;}
async function load(){const id=++requestId;busy.value=true;error.value='';notice.value='';confirmed.value=false;packet.value=null;try{const {data}=await api.get(endpoint());if(id===requestId)accept(data);}catch(e){if(id===requestId)failure(e);}finally{if(id===requestId)busy.value=false;}}
function opened(event){isOpen=event.target.open;if(isOpen&&!packet.value)load();}
async function save(publish){const id=++requestId;busy.value=true;error.value='';notice.value='';try{const {data}=await api.put(endpoint(),{profile:profile.value,publish,confirmed:confirmed.value});if(id!==requestId)return;accept(data);notice.value=publish?'SMS review pages published. Complete the application in Vonage using this packet.':'Draft saved and packet generated.';}catch(e){if(id===requestId)failure(e);}finally{if(id===requestId)busy.value=false;}}
async function copy(value){try{await navigator.clipboard.writeText(value);notice.value='Copied.';}catch{notice.value='Select and copy the text above; clipboard permission was unavailable.';}}
function download(){const url=URL.createObjectURL(new Blob([packet.value.markdown],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download=`sms-campaign-${props.agencyId}-${program.value}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
watch(()=>props.agencyId,()=>{requestId++;packet.value=null;profile.value={};confirmed.value=false;error.value='';notice.value='';showPreview.value=false;if(isOpen)load();});
</script>
<style scoped>
.packet-builder{margin:24px 0;padding:16px;border:1px solid #cbd5e1;border-radius:10px}.packet-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}label{display:block;margin:12px 0}input:not([type=checkbox]),select{display:block;width:100%;padding:8px}.packet-step{padding:12px 0;border-bottom:1px solid #ddd}.packet-value{white-space:pre-wrap;overflow-wrap:anywhere}.packet-actions{display:flex;flex-wrap:wrap;gap:16px;margin:16px 0}button{margin:8px 8px 8px 0}[role=alert]{color:#b91c1c}
</style>
