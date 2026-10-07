<template>
  <section class="communication-review">
    <h3>Support review and Spam</h3>
    <p>Unknown senders, messages to departed providers, and overdue replies stay here for agency support. Unknown does not mean spam. Blocking a sender keeps future texts in Spam without notifying providers.</p>
    <p>Provider numbers stay with support until an administrator releases or reassigns them. Calls and new voicemail capture are not active yet.</p>
    <label>Folder <select v-model="status"><option value="review">Needs review</option><option value="spam">Spam</option><option value="resolved">Resolved</option></select></label>
    <button type="button" @click="load(false)" :disabled="busy">Refresh</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!agencyId">Select an agency.</p>
    <p v-else-if="!busy && !items.length">No items in this folder.</p>
    <article v-for="item in items" :key="item.id" class="review-item">
      <strong>{{ reasonLabel(item.reason) }}</strong>
      <p>{{ item.from || 'Unknown number' }} → {{ item.to || 'Agency' }} · {{ new Date(item.createdAt).toLocaleString() }}</p>
      <p class="message-body">{{ item.body }}</p>
      <p v-if="item.messageLogId">Message record #{{ item.messageLogId }} — open the client’s SMS conversation to respond.</p>
      <p v-if="item.voicemailId">Voicemail record #{{ item.voicemailId }} — review in the agency voicemail list when voice service is available.</p>
      <p v-if="item.reason === 'unknown_sender' || item.reason === 'ambiguous_identity' || item.reason === 'unapproved_for_provider'">Verify who controls this number and update the correct agency contact/client assignment before allowing future provider routing. This does not grant SMS consent.</p>
      <button v-if="item.status !== 'resolved'" type="button" :disabled="busy" @click="act(item,'resolve')">Mark handled</button>
      <button v-if="item.status !== 'spam'" type="button" :disabled="busy" @click="act(item,'block')">Block sender and move to Spam</button>
      <button v-else type="button" :disabled="busy" @click="act(item,'restore')">Unblock and return to review</button>
    </article>
    <button v-if="nextBeforeId" type="button" :disabled="busy" @click="load(true)">Load older items</button>
  </section>
</template>
<script setup>
import { ref,watch } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],default:null}});
const items=ref([]),status=ref('review'),busy=ref(false),error=ref(''),nextBeforeId=ref(null);
let generation=0;
const reasonLabel = reason => ({unassigned_client:'Client needs a provider assignment',unlinked_sender:'Sender needs support routing',suspected_advertising:'Suspected advertising — reviewable',blocked_sender:'Blocked sender',unknown_sender:'Unknown sender',ambiguous_identity:'Shared phone — verify recipient',departed_provider:'Departed provider — support coverage',unapproved_for_provider:'Not assigned to this provider',main_number_inquiry:'Main number inquiry',unread_text:'Unread text',unanswered_text:'Unanswered text',unheard_voicemail:'Unheard voicemail'}[reason] || reason);
async function load(append=false) {
  const current=++generation, agencyId=props.agencyId;
  if (!append) {items.value=[];nextBeforeId.value=null;}
  error.value='';
  if (!agencyId) {busy.value=false;return;}
  busy.value=true;
  try {const {data}=await api.get(`/sms-numbers/agency/${agencyId}/review-queue`,{params:{status:status.value,beforeId:append?nextBeforeId.value:null}});
    if(current!==generation)return;
    items.value=append?[...items.value,...data.items]:data.items;nextBeforeId.value=data.nextBeforeId;
  } catch(e) {if(current===generation)error.value=e.response?.data?.error?.message || 'Unable to load communication review.';}
  finally {if(current===generation)busy.value=false;}
}
async function act(item,action) {
  const current=generation,agencyId=props.agencyId;
  busy.value=true;error.value='';
  try {await api.patch(`/sms-numbers/agency/${agencyId}/review-queue/${item.id}`,{action});if(current===generation)await load(false);}
  catch(e){if(current===generation)error.value=e.response?.data?.error?.message || 'Unable to update review item.';}
  finally{if(current===generation)busy.value=false;}
}
watch(()=>[props.agencyId,status.value],()=>load(false),{immediate:true});
</script>
<style scoped>
.communication-review{padding:1.2rem;background:var(--bg-card,#fff);border:1px solid #d7dee5;border-radius:12px;margin:1rem 0;color:var(--text-primary,#172b3a)}
.review-item{padding:1rem 0;border-top:1px solid #d7dee5;margin-top:1rem}.message-body{white-space:pre-wrap;overflow-wrap:anywhere}
button,select{margin:.3rem;padding:.5rem;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-card,#fff);color:inherit}button:disabled{opacity:.6}
</style>
