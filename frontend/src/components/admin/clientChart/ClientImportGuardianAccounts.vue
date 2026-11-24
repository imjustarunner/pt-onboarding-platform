<template>
 <section class="import-guardians" aria-label="Parent and guardian accounts">
  <h4>Parent / guardian accounts</h4>
  <p>Each parent uses their own login. An existing account can be linked to this child and their siblings. Review each parent’s access and invitation below.</p>
  <p v-if="loading" role="status">Loading linked parents and guardians…</p>
  <p v-if="error" role="alert">{{error}} <button v-if="!saving" type="button" @click="load">Retry</button></p>
  <article v-for="(account,index) in guardians" :key="account.guardian_user_id">
   <span class="guardian-label">Parent / Guardian {{index+1}}</span>
   <strong>{{[account.first_name,account.last_name].filter(Boolean).join(' ')}}</strong>
   <span>{{account.email}} · {{account.relationship_title||'Guardian'}}</span>
   <small>{{Number(account.access_enabled)===1?'Linked to this client':'Linked to this client · review portal access below'}}</small>
   <small v-if="sourceReminders(account)">Imported reminder choices: {{sourceReminders(account)}}</small>
  </article>
  <template v-if="loaded">
   <label class="guardian-choice" :class="{'guardian-choice-needed':!selected && candidates.length}">{{nextLabel}}<select v-model="selectedId" aria-label="Parent or guardian contact" :disabled="disabled||saving||loading">
    <option value="">Choose an imported contact…</option>
    <option v-for="contact in candidates" :key="contact.affiliationId" :value="String(contact.affiliationId)" :disabled="!validEmail(contact.email)">{{contact.fullName}} · {{contact.relationshipType||'Contact'}}{{validEmail(contact.email)?` · ${contact.email}`:' · add an email to their contact first'}}</option>
   </select></label>
   <label v-if="selected" class="guardian-choice" :class="{'guardian-choice-needed':!relationship}">
     Confirm relationship to the client
     <select v-model="relationship" aria-label="Confirm relationship to the client" :disabled="disabled || saving" required>
       <option value="">Choose a relationship{{ selected.relationshipType ? ` (source: ${selected.relationshipType})` : '' }}</option>
       <option v-for="choice in relationships" :key="choice" :value="choice">{{ choice }}</option>
     </select>
   </label>
   <p v-if="selected">{{selected.appointmentReminders?`Reminders from their contact: ${selected.appointmentReminders}. `:''}}Each parent needs their own email address for a separate login. Text opt-ins receive a confirmation when the parent opens their portal, with instructions to stop all texts, reminders, or provider messages.</p>
   <button type="button" class="ehr-btn-ghost" :disabled="disabled||saving||loading||!selected||!relationship||!validEmail(selected.email)" @click="prepare">{{saving?'Adding guardian…':`Add ${nextLabel}`}}</button>
   <p v-if="!candidates.length">Import the other parent’s contact card, including their own email, to add another account.</p>
  </template>
  <p v-if="notice" role="status">{{notice}}</p>
 </section>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import { portalContactRelationships as relationships } from '../../../navigation/recordsContactOwnership.js';
import api from '../../../services/api';
const props=defineProps({clientId:{type:[String,Number],required:true},agencyId:{type:[String,Number],required:true},contacts:{type:Array,default:()=>[]},disabled:Boolean});
const emit=defineEmits(['busy','prepared']);
const accounts=ref([]),selectedId=ref(''),relationship=ref(''),loading=ref(false),loaded=ref(false),saving=ref(false),error=ref(''),notice=ref('');let generation=0;
const request=()=>({skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.agencyId)}});
const emailKey=value=>String(value||'').trim().toLowerCase();
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKey(value));
const guardians=computed(()=>accounts.value.filter(a=>a.relationship_type!=='self'&&!a.permissions_json?.relationshipRevoked).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||Number(a.guardian_user_id)-Number(b.guardian_user_id)));
const candidates=computed(()=>props.contacts.filter(c=>!accounts.value.some(a=>emailKey(a.email)===emailKey(c.email))));
const selected=computed(()=>candidates.value.find(c=>String(c.affiliationId)===selectedId.value));
const sourceReminders=account=>props.contacts.find(c=>emailKey(c.email)===emailKey(account.email))?.appointmentReminders;
const nextLabel=computed(()=>guardians.value.length<2?`Parent / Guardian ${guardians.value.length+1}`:'another parent / guardian');
async function load(){const own=++generation;loading.value=true;loaded.value=false;error.value='';accounts.value=[];selectedId.value='';
 try{const{data}=await api.get(`/clients/${props.clientId}/guardians`,request());if(own!==generation)return;accounts.value=Array.isArray(data)?data:data?.guardians||[];loaded.value=true;}
 catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Linked guardian accounts could not be loaded.';}
 finally{if(own===generation)loading.value=false;}
}
async function prepare(){if(props.disabled||saving.value||!loaded.value||!relationship.value||!selected.value||!validEmail(selected.value.email))return;const own=generation,contact=selected.value;saving.value=true;error.value='';notice.value='';emit('busy',true);
 try{const{data}=await api.post(`/clients/${props.clientId}/chart-import/contacts/${contact.affiliationId}/portal-account`,{relationship:relationship.value},request());if(own!==generation)return;
  await load();if(own+1!==generation)return;
  notice.value=`${contact.fullName} is linked to this client. Review their access below before inviting them.`;emit('prepared',data.result);
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The guardian account could not be added. Your imported contacts are saved.';}
 finally{saving.value=false;emit('busy',false);}
}
watch(selectedId, () => { relationship.value = ''; });
watch(()=>[props.clientId,props.agencyId,props.contacts],()=>{notice.value='';void load();},{immediate:true});
onBeforeUnmount(()=>{generation++;emit('busy',false);});
</script>
<style scoped>
.guardian-choice{padding:8px;border:1px solid #c7d9eb;border-radius:8px}.guardian-choice-needed{border-color:#c49436;background:#fff7e4}
.import-guardians{padding:16px;border:1px solid #c7d7e7;border-radius:10px;background:#f6f9fd;margin:12px 0;color:#203650}.import-guardians h4{margin:0 0 8px}.import-guardians p{font-size:13px;line-height:1.5}.import-guardians article{display:grid;gap:5px;background:white;border:1px solid #d6e0ea;border-radius:8px;padding:12px;margin-bottom:10px}.guardian-label{color:#6c5a30;font-size:12px;font-weight:700}.import-guardians label{display:grid;gap:6px;font-weight:600}.import-guardians select{width:100%;padding:10px;border:1px solid #b9c9dc;border-radius:8px;background:white;font:inherit;min-width:0}.import-guardians button{margin-top:10px}.import-guardians [role=alert]{color:#a12828}
</style>
