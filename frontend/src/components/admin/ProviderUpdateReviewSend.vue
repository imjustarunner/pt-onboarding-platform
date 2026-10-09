<template>
 <section class="review-send">
  <h2>Review &amp; send individually</h2>
  <p>Select a saved update and a person. Review their exact amendment and read-only update before sending their invitation. Previewing does not send email, release documents, or change their answers.</p>
  <label>Saved Provider Update<select v-model="pushId" :disabled="busy" @change="loadPush"><option value="">Choose an update…</option><option v-for="p in availablePushes" :key="p.id" :value="p.id">{{p.title}} · #{{p.id}} · {{p.status}}</option></select></label>
  <p v-if="!availablePushes.length">Create and save a Provider Update from Compose first.</p>
  <p v-if="error" role="alert" class="error">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
  <template v-if="push">
   <details><summary>Manage videos, photos &amp; subsection guides</summary><ProviderUpdateTrainingEditor :agency-id="agencyId" :push-id="push.id" :config="push.section_config_json" @saved="trainingSaved" /></details>
   <label>Find a person<input v-model="search" type="search" placeholder="Name or work email" :disabled="busy" /></label>
   <label>Person to review<select v-model="personId" :disabled="busy" @change="resetReview"><option value="">Choose a person…</option><option v-for="p in filteredPeople" :key="p.provider_user_id" :value="p.provider_user_id">{{p.first_name}} {{p.last_name}} · {{p.work_email || p.email || 'No work email'}}</option></select></label>
   <template v-if="person">
    <p><strong>{{name}}</strong> · {{person.work_email || person.email || 'No work email saved'}}</p>
    <p v-if="existingRecipient">Existing update status: {{existingRecipient.status}}. Sending again sends another invitation to this same person.</p>
    <button type="button" :disabled="busy" @click="preview">{{busy?'Loading…':`Preview ${name}’s update & amendment`}}</button>
    <div v-if="previewUrl" class="preview">
     <a :href="previewUrl" target="_blank" rel="noopener noreferrer">Open {{name}}’s full read-only update ↗</a>
     <template v-if="amendment">
      <h3>{{amendment.name}}’s amendment</h3><p>{{amendment.draft?'Private draft — not yet released for signing.':'Previously released agreement.'}}</p>
      <p v-if="wrongReleasedPush" class="error">This agreement belongs to a different update. Select that update or prepare the correct agreement before sending.</p>
      <ul v-if="amendment.issues?.length" class="error"><li v-for="issue in amendment.issues" :key="issue">{{issue}}</li></ul>
      <iframe sandbox="" title="Selected person’s compensation amendment" :srcdoc="amendmentHtml" />
      <button type="button" @click="download">Open printable amendment</button>
     </template>
     <p v-else-if="needsAmendment" class="error">This person’s update includes an amendment, but no matching agreement is available. Prepare it before sending.</p>
     <p v-else>No compensation amendment is assigned in this person’s update.</p>
     <label class="confirm"><input v-model="approved" type="checkbox" :disabled="busy || !ready" /> I reviewed {{name}}’s update{{amendment?' and amendment':''}} and it is ready to send.</label>
     <p v-if="amendment?.draft">Sending will release this reviewed amendment for their electronic signature and send only {{name}} an invitation at their work email.</p>
     <button type="button" class="primary" :disabled="busy || !approved || !ready" @click="sendOne">{{amendment?.draft?'Release amendment & send':'Send invitation'}} to {{name}} only</button>
    </div>
   </template>
  </template>
 </section>
</template>
<script setup>
import {computed,onMounted,ref,watch} from 'vue';
import api from '../../services/api';
import ProviderUpdateTrainingEditor from './ProviderUpdateTrainingEditor.vue';
const props=defineProps({agencyId:{type:[Number,String],required:true},pushes:{type:Array,default:()=>[]}}),emit=defineEmits(['sent']);
const pushId=ref(''),push=ref(null),people=ref([]),personId=ref(''),recipients=ref([]),search=ref(''),busy=ref(false),error=ref(''),notice=ref(''),previewUrl=ref(''),amendment=ref(null),needsAmendment=ref(false),approved=ref(false);
const availablePushes=computed(()=>props.pushes.filter(p=>p.status!=='closed'&&!String(p.title).startsWith('[PREVIEW]')));
const person=computed(()=>people.value.find(p=>Number(p.provider_user_id)===Number(personId.value)));
const name=computed(()=>person.value?`${person.value.first_name} ${person.value.last_name}`.trim():'');
const filteredPeople=computed(()=>people.value.filter(p=>`${p.first_name} ${p.last_name} ${p.work_email||p.email||''}`.toLowerCase().includes(search.value.toLowerCase())));
const existingRecipient=computed(()=>recipients.value.find(r=>Number(r.provider_user_id)===Number(personId.value)));
const wrongReleasedPush=computed(()=>!!amendment.value&&!amendment.value.draft&&Number(amendment.value.pushId)!==Number(push.value?.id));
const ready=computed(()=>!wrongReleasedPush.value&&!!previewUrl.value&&(!needsAmendment.value||!!amendment.value)&&!(amendment.value?.issues?.length));
const amendmentHtml=computed(()=>`<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;padding:24px;color:#243b30}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:9px}h1,h2,h3{color:#3e6d54}</style></head><body>${amendment.value?.html||''}</body></html>`);
function resetReview(){previewUrl.value='';amendment.value=null;approved.value=false;needsAmendment.value=false;notice.value='';error.value='';}
async function loadPush(){resetReview();push.value=null;personId.value='';if(!pushId.value)return;busy.value=true;
 try{const {data}=await api.get(`/provider-update/pushes/${pushId.value}`,{params:{agencyId:props.agencyId}});push.value=data.push;recipients.value=data.recipients||[];}
 catch(e){error.value=e.response?.data?.error?.message||'Could not load update.';}finally{busy.value=false;}}
async function initialize(){busy.value=true;try{const {data}=await api.get('/provider-update/eligible-providers',{params:{agencyId:props.agencyId}});people.value=(data.providers||[]).filter(p=>!Number(p.is_demo)).sort((a,b)=>`${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));}catch(e){error.value=e.response?.data?.error?.message||'Could not load people.';}finally{busy.value=false;}}
function chooseDefault(){if(!pushId.value&&availablePushes.value.length){pushId.value=availablePushes.value[0].id;void loadPush();}}
watch(availablePushes,chooseDefault);onMounted(()=>{void initialize();chooseDefault();});
function trainingSaved(updated){push.value=updated;resetReview();}
async function preview(){resetReview();busy.value=true;try{
 const p=push.value;
 const {data}=await api.post(`/provider-update/providers/${Number(personId.value)}/preview-link`,{agencyId:Number(props.agencyId),title:p.title,sectionConfig:p.section_config_json,attachedAdminUpdateId:p.attached_admin_update_id,sectionAudience:p.section_audience_json,amendmentPlan:p.amendment_plan_json});
 const base=`/public/provider-update/${encodeURIComponent(data.token)}`;
 const bundle=(await api.get(base)).data;
 needsAmendment.value=(bundle.sections||[]).some(s=>s.key==='amendments');
 if(needsAmendment.value)amendment.value=(await api.get(`${base}/amendment`)).data.amendment;
 previewUrl.value=data.publicUrl;
 }catch(e){error.value=e.response?.data?.error?.message||'Could not prepare this preview.';}finally{busy.value=false;}}
async function sendOne(){if(!approved.value||!ready.value||busy.value)return;busy.value=true;error.value='';notice.value='';const id=Number(personId.value);
 try{
  if(amendment.value?.draft){await api.post(`/provider-update/compensation-drafts/${amendment.value.id}/release`,{agencyId:Number(props.agencyId),pushId:Number(push.value.id),expectedHtml:amendment.value.html});amendment.value={...amendment.value,draft:false};}
  const {data}=await api.post(`/provider-update/pushes/${push.value.id}/send`,{agencyId:Number(props.agencyId),providerUserIds:[id]});
  const result=(data.results||[]).find(r=>Number(r.providerUserId)===id);
  notice.value=result?.deliveryStatus==='sent'?`Invitation sent to ${name.value}.`:`Invitation status: ${result?.deliveryStatus||'unknown'}. ${result?.errorMessage||'Check delivery before retrying.'}`;
  approved.value=false;emit('sent');
 }catch(e){approved.value=false;error.value=e.response?.data?.error?.message||'Could not send. Check delivery before retrying.';}finally{busy.value=false;}}
function download(){const url=URL.createObjectURL(new Blob([amendmentHtml.value],{type:'text/html'}));const a=document.createElement('a');a.href=url;a.download=`amendment-${personId.value}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
</script>
<style scoped>.review-send{padding:20px;border:1px solid #d3ded8;border-radius:14px;background:white}.review-send label{display:grid;gap:8px;margin:16px 0}.review-send input,.review-send select,.review-send button{font:inherit;padding:10px;border:1px solid #9aafa1;border-radius:8px}.review-send button{cursor:pointer}.review-send button:disabled{opacity:.55;cursor:default}.review-send iframe{width:100%;height:70vh;border:1px solid #d0ddd4;background:white}.review-send .confirm{display:flex;align-items:center}.preview{display:grid;gap:14px;margin:20px 0}.primary{background:#3d6b4f;color:white}.error{color:#9f2f2f}.review-send summary{cursor:pointer;font-weight:650;padding:16px 0}</style>
