<template>
 <section class="reviewer-assignments">
  <h2>Designated privacy reviewers</h2>
  <p>Administrator status does not grant approval authority. Designate the staff responsible for privacy reviews. They can review blocked activity across the platform and approve limited file access, but cannot approve their own requests.</p>
  <p><router-link to="/privacy-review">Open privacy review queue</router-link> (designation required)</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
  <ul><li v-for="person in reviewers" :key="person.user_id">{{ person.email }} · User {{ person.user_id }} · {{ person.revoked_at ? 'Removed' : 'Designated' }}</li></ul>
  <form @submit.prevent="save">
   <label>Staff user ID<input v-model.number="userId" type="number" min="1" required /></label>
   <label>Confirm that user ID<input v-model.number="confirmUserId" type="number" min="1" required /></label>
   <label>Action<select v-model="enabled"><option :value="true">Designate reviewer</option><option :value="false">Remove reviewer designation</option></select></label>
   <label>Reason (no client information)<textarea v-model.trim="note" minlength="10" maxlength="1000" required /></label>
   <label>Fresh authenticator code<input v-model.trim="code" autocomplete="one-time-code" pattern="[0-9]{6}" inputmode="numeric" maxlength="6" required /></label>
   <p>You cannot designate yourself. This assignment is recorded in security evidence.</p>
   <button :disabled="busy || userId !== confirmUserId">{{ busy ? 'Saving…' : 'Confirm reviewer assignment' }}</button>
  </form>
 </section>
</template>
<script setup>
import {onMounted,ref} from 'vue';
import api from '../../services/api';
const reviewers=ref([]),error=ref(''),message=ref(''),userId=ref(null),confirmUserId=ref(null),enabled=ref(true),note=ref(''),code=ref(''),busy=ref(false);
const headers={'X-Account-Security':'1'};
async function load(){try{const {data}=await api.get('/security-evidence/privacy-reviewers');reviewers.value=data.reviewers||[];}catch(e){error.value=e.response?.data?.error?.message||'Reviewer assignments could not be loaded.';}}
async function save(){busy.value=true;error.value='';message.value='';try{
 await api.post('/account-security/authenticator/verify',{code:code.value,rememberDevice:false,personalDevice:false},{headers});code.value='';
 const {data}=await api.post('/security-evidence/privacy-reviewers',{userId:userId.value,confirmUserId:confirmUserId.value,enabled:enabled.value,note:note.value},{headers});
 message.value=`${data.email}: reviewer designation ${data.enabled?'enabled':'removed'}. Ask the reviewer to refresh the app to update their access.`;await load();
}catch(e){error.value=e.response?.data?.error?.message||'Reviewer assignment failed.';}finally{busy.value=false;}}
onMounted(load);
</script>
<style scoped>
.reviewer-assignments{padding:1rem;border:1px solid var(--border-color,#cbd5e1);border-radius:8px;margin:1rem 0;overflow-wrap:anywhere}form{max-width:650px}label{display:block;margin:.7rem 0}input,textarea,select{display:block;width:100%;box-sizing:border-box;padding:.6rem;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-primary,#fff);color:inherit}button{padding:.65rem;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-secondary,#f1f5f9);color:inherit}button:disabled{opacity:.5}[role=alert]{color:#a12318}
</style>
