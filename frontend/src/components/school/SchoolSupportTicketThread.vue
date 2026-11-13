<template>
  <section class="school-support-thread" aria-label="Your support conversation">
    <header><h3>Ticket #{{ ticketId }}<template v-if="ticket?.subject"> · {{ ticket.subject }}</template></h3><button type="button" @click="$emit('close')">Back to your questions</button></header>
    <p v-if="loading" role="status">Loading conversation…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
    <template v-else-if="ticket">
      <p v-if="ticket.question" class="question"><strong>Your question</strong><br>{{ ticket.question }}</p>
      <article v-for="message in visibleMessages" :key="message.id"><strong>{{ message.author_display_name || message.author_name || 'Conversation reply' }}</strong><p>{{ message.body }}</p></article>
      <form @submit.prevent="send">
        <TicketAttachmentComposer ref="attachments" :ticket-id="ticketId" :context-key="`${schoolOrganizationId}:${actorId}`" :disabled="sending" />
        <label>Follow-up<textarea v-model="draft" :disabled="sending" rows="4" required /></label>
        <p v-if="sendError" role="alert">{{ sendError }}</p>
        <button type="submit" :disabled="sending || !draft.trim()">{{ sending ? 'Sending…' : 'Send follow-up' }}</button>
      </form>
    </template>
  </section>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import api from '../../services/api';
import {useAuthStore} from '../../store/auth';
import TicketAttachmentComposer from '../tickets/TicketAttachmentComposer.vue';
const props=defineProps({ticketId:{type:Number,required:true},schoolOrganizationId:{type:Number,required:true}});
const emit=defineEmits(['close','updated']);
const auth=useAuthStore(),actorId=computed(()=>Number(auth.user?.id)||null);
const ticket=ref(null),messages=ref([]),loading=ref(false),sending=ref(false),error=ref(''),sendError=ref(''),draft=ref(''),attachments=ref(null);
let generation=0,loadVersion=0,disposed=false;
const visibleMessages=computed(()=>messages.value.filter(message=>Number(message.is_internal||0)!==1&&Number(message.is_deleted||0)!==1));
function context(){const id=Number(props.ticketId),school=Number(props.schoolOrganizationId),actor=actorId.value,version=generation;return{id,current:()=>!disposed&&id===Number(props.ticketId)&&school===Number(props.schoolOrganizationId)&&actor===actorId.value&&version===generation};}
async function load(){
 const ctx=context(),request=++loadVersion;if(!ctx.id||!actorId.value)return;const current=()=>ctx.current()&&request===loadVersion;loading.value=true;error.value='';ticket.value=null;messages.value=[];
 try{const {data}=await api.get(`/support-tickets/${ctx.id}/messages`);if(!current())return;
  if(Number(data?.ticket?.id)!==ctx.id||Number(data?.ticket?.school_organization_id)!==Number(props.schoolOrganizationId))throw new Error('This question is not available in the selected school.');
  ticket.value=data.ticket;messages.value=Array.isArray(data.messages)?data.messages:[];
 }catch(e){if(current())error.value=e.response?.data?.error?.message||e.message||'This conversation could not load.';}finally{if(current())loading.value=false;}
}
async function send(){
 if(sending.value||loading.value||!ticket.value||!draft.value.trim())return;
 const ctx=context(),body=draft.value.trim();sending.value=true;sendError.value='';
 try{if(attachments.value?.hasFile?.()&&!(await attachments.value.uploadPending(ctx.id))){if(ctx.current())sendError.value='Your follow-up is saved here. Add the file successfully before sending.';return;}
  if(!ctx.current())return;await api.post(`/support-tickets/${ctx.id}/messages`,{body});if(!ctx.current())return;
  draft.value='';await load();if(ctx.current())emit('updated');
 }catch(e){if(ctx.current())sendError.value=e.response?.data?.error?.message||e.message||'Your follow-up was not sent. Your text is still here.';}finally{if(ctx.current())sending.value=false;}
}
watch(()=>[props.ticketId,props.schoolOrganizationId,actorId.value],()=>{generation++;ticket.value=null;messages.value=[];draft.value='';error.value='';sendError.value='';sending.value=false;loading.value=false;void load();},{immediate:true});
onBeforeUnmount(()=>{disposed=true;generation++;});
</script>
<style scoped>
.school-support-thread header{display:flex;align-items:center;justify-content:space-between;gap:12px}.school-support-thread h3{margin:0;font-size:17px}.school-support-thread article,.question{border:1px solid var(--border);border-radius:8px;padding:10px;white-space:pre-wrap}.school-support-thread form,.school-support-thread label{display:grid;gap:10px}.school-support-thread textarea{width:100%;box-sizing:border-box;font:inherit}.school-support-thread button{font:inherit;padding:8px;cursor:pointer}.school-support-thread [role=alert]{color:#b42318}
</style>
