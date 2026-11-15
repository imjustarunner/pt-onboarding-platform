<template>
  <section class="personal-invite" aria-label="Client’s own portal login">
    <h3>Client’s own login</h3>
    <p>Invite the client using their own email address. Their login is separate from the guardian’s and shows their appointments, messages, learning materials, and records shared with them.</p>
    <p>Guardian access stays in place. Family billing, sibling records, and parent-only conversations stay outside this login.</p>
    <p v-if="loading" role="status">Checking client login…</p>
    <template v-else-if="data">
      <template v-if="data.invitation">
        <p><strong>{{ data.invitation.email }}</strong> · {{ !data.invitation.active ? 'Access turned off' : data.invitation.passwordSet ? 'Account set up' : 'Waiting for password setup' }}</p>
        <button v-if="data.invitation.active" type="button" :disabled="busy" @click="submit('resend')">{{ busy ? 'Sending…' : 'Resend client invitation' }}</button>
        <p v-else>Review personal portal access with the care team before restoring it.</p>
      </template>
      <form v-else @submit.prevent="submit('invite')">
        <label>Client’s email<input v-model.trim="email" type="email" required maxlength="254" autocomplete="off" /></label>
        <label class="confirmation"><input v-model="confirmed" type="checkbox" required /> I verified this is the client’s own email and am authorized to invite them to their personal portal.</label>
        <button type="submit" :disabled="busy || !confirmed || !email">{{ busy ? 'Sending…' : 'Invite client' }}</button>
      </form>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props = defineProps({ clientId: { type: Number, required: true }, agencyId: { type: Number, required: true } });
const emit = defineEmits(['updated']);
const data=ref(null),email=ref(''),confirmed=ref(false),busy=ref(false),loading=ref(false),error=ref(''),notice=ref('');
let generation=0;
const endpoint=()=>`/dependent-portal/staff/${props.clientId}/invitation`;
async function load(){const run=++generation;data.value=null;error.value='';loading.value=true;
 try{const response=await api.get(endpoint(),{params:{agencyId:props.agencyId},skipGlobalLoading:true});if(run===generation)data.value=response.data;}
 catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Client login could not be loaded.';}
 finally{if(run===generation)loading.value=false;}}
const scope=()=>`${props.clientId}:${props.agencyId}`;
async function submit(action){if(busy.value)return;const run=generation,currentScope=scope();busy.value=true;error.value='';notice.value='';
 try{await api.post(`${endpoint()}/${action}`,{agencyId:props.agencyId,...(action==='invite'?{email:email.value,confirmed:confirmed.value}:{})});if(run!==generation)return;await load();if(currentScope!==scope())return;notice.value='Client invitation sent. They can set their own password using the email link.';emit('updated');}
 catch(e){if(run===generation){error.value=e.response?.data?.error?.message||'Client invitation could not be sent. Review delivery before retrying.';await loadAfterError(error.value,currentScope);}}
 finally{busy.value=false;}}
async function loadAfterError(message,currentScope){await load();if(currentScope===scope())error.value=message;}
watch(()=>[props.clientId,props.agencyId],()=>{email.value='';confirmed.value=false;notice.value='';void load();},{immediate:true});
onBeforeUnmount(()=>++generation);
</script>
<style scoped>
.personal-invite{padding:18px;border:1px solid var(--app-border,#d6e2ef);border-radius:12px;background:var(--app-surface-muted,#f4f8fc);margin:16px 0;color:var(--app-text,#233653)}.personal-invite h3{margin:0 0 10px;font-size:1rem}.personal-invite p{line-height:1.5;font-size:.875rem}.personal-invite label{display:grid;gap:8px;margin:12px 0;font-size:.875rem}.personal-invite input[type=email]{font:inherit;padding:10px;border:1px solid #b5cbe0;border-radius:8px;width:100%;box-sizing:border-box}.personal-invite .confirmation{display:flex;align-items:start;gap:8px}.personal-invite button{font:inherit;padding:10px 14px;border:1px solid #174e7f;border-radius:8px;background:#174e7f;color:white;cursor:pointer}.personal-invite button:disabled{opacity:.5;cursor:default}.personal-invite [role=alert]{color:#a12424}
</style>
