<template>
 <details class="people-ops-recipients">
  <summary>Submission notices · {{ enabled ? 'On' : 'Off' }}</summary>
  <p>Choose the hiring reviewers who receive an email and in-app notice when new pre-hire, onboarding or hiring documents are submitted.</p>
  <p v-if="loading">Loading reviewers…</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <form v-if="loaded" @submit.prevent="save">
   <fieldset :disabled="!canEdit || saving">
    <label><input v-model="enabled" type="checkbox" /> Send notices for new submissions</label>
    <label class="reviewer">From <select v-model="senderIdentityId"><option :value="null">Choose an agency sender</option><option v-for="sender in senders" :key="sender.id" :value="sender.id">{{ sender.label }} · {{ sender.email }} · {{ sender.transport === 'workspace_smtp_relay' ? 'Group relay' : 'existing mailbox' }}{{ sender.ready ? '' : ' · setup needed' }}</option></select></label>
    <p v-if="!senders.length">An administrator needs to connect a People Operations or agency messages sender before notices can be enabled.</p>
    <p v-else-if="!selectedSenderReady">The selected sender needs administrator setup before notices can be enabled.</p>
    <p v-if="!enabled">Notices are off. Review the selected people, turn notices on, and save to begin with future submissions. Earlier submissions will not be sent.</p>
    <label v-for="person in recipients" :key="person.id" class="reviewer"><input v-model="selected" type="checkbox" :value="person.id" :disabled="person.emailEligible === false && !selected.includes(person.id)" /> {{ person.name || person.email }} <strong v-if="person.emailIssue"> · {{ person.emailIssue }}</strong> <span v-if="person.name">· {{ person.email || 'No saved work address' }}</span></label>
    <p v-if="!recipients.length">No active hiring reviewers are available. Ask an administrator to review staff hiring access.</p>
   </fieldset>
   <p>Only saved staff accounts with current hiring access appear here. Changing this list does not grant access to hiring records.</p>
   <button v-if="canEdit" type="submit" :disabled="saving || (enabled && !selectedSenderReady)">{{ saving ? 'Saving…' : 'Save notice settings' }}</button>
   <p v-else>An agency administrator can change these settings.</p>
  </form>
  <p v-if="message" role="status">{{ message }}</p>
 </details>
</template>
<script setup>
import {ref,watch,computed} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],default:null}});
const recipients=ref([]),selected=ref([]),enabled=ref(false),canEdit=ref(false),loading=ref(false),loaded=ref(false),saving=ref(false),error=ref(''),message=ref('');
const senders=ref([]),senderIdentityId=ref(null),selectedSenderReady=computed(()=>senders.value.some(sender=>sender.id===senderIdentityId.value&&sender.ready));
let generation=0;
function apply(data){recipients.value=data.recipients||[];selected.value=recipients.value.filter(person=>person.enabled).map(person=>person.id);enabled.value=!!data.enabled;canEdit.value=!!data.canEdit;senders.value=data.senders||[];senderIdentityId.value=data.senderIdentityId || null;loaded.value=true;}
watch(()=>props.agencyId,async agencyId=>{const current=++generation;loaded.value=false;error.value='';message.value='';recipients.value=[];selected.value=[];
 if(!agencyId){loading.value=false;return;}loading.value=true;
 try{const {data}=await api.get('/hiring/notification-recipients',{params:{agencyId}});if(current===generation)apply(data);}
 catch{if(current===generation)error.value='The reviewer settings could not be loaded.';}finally{if(current===generation)loading.value=false;}
},{immediate:true});
async function save(){if(saving.value||!canEdit.value)return;const agencyId=props.agencyId,current=generation;saving.value=true;error.value='';message.value='';
 try{const {data}=await api.put('/hiring/notification-recipients',{enabled:enabled.value,recipientIds:selected.value,senderIdentityId:senderIdentityId.value},{params:{agencyId}});
  if(current===generation){apply(data);message.value=data.enabled?'Saved. Selected reviewers will receive notices for future submissions.':'Saved. Submission notices are off.';}}
 catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'The settings could not be saved.';}finally{saving.value=false;}
}
</script>
<style scoped>
.people-ops-recipients{margin:0 0 20px;padding:14px 18px;border:1px solid #dce4ed;border-radius:12px;background:var(--bg-secondary,#f7f9fc);font-size:13px;line-height:1.6}summary{cursor:pointer;font-weight:600}fieldset{border:0;padding:0;margin:0}.reviewer{display:block;margin:8px 0}button{padding:8px 14px;border-radius:8px;border:1px solid #245b83;background:#245b83;color:#fff;font-weight:600}p{margin:8px 0}
</style>
