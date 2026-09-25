<template>
  <section class="personal-delivery" aria-labelledby="personal-delivery-title">
    <h3 id="personal-delivery-title">Messages at your personal email</h3>
    <p v-if="loading" role="status">Loading message delivery settings…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="loaded">
      <p v-if="!delivery.eligible">{{ eligibilityNote }}</p>
      <template v-else>
        <p>Send unread-message reminders to <strong>{{ delivery.personalEmail }}</strong>.</p>
        <label><input v-model="form.personalEmailNotify" type="checkbox" :disabled="saving" /> Email me when unread messages are waiting</label>
        <p v-if="!form.personalEmailNotify" class="delivery-note">Reminders are off. Check Messages regularly so you do not miss messages.</p>
        <fieldset :disabled="!form.personalEmailNotify || saving">
          <label>When to notify me
            <select v-model="form.personalEmailDelayMode" @change="timingChanged">
              <option value="business_day">{{ form.personalEmailDelayMode === 'business_day' && form.personalEmailDelayHours > 24 ? `${Math.ceil(form.personalEmailDelayHours / 24)} business days (saved)` : '24 hours — next business day (default)' }}</option>
              <option value="immediate">Immediately</option>
              <option value="hours">After a set number of hours</option>
            </select>
          </label>
          <label v-if="form.personalEmailDelayMode === 'hours'">Hours
            <input v-model.number="form.personalEmailDelayHours" type="number" min="1" max="168" step="1" required />
          </label>
          <p>Delivery follows your Availability Hours (weekdays 7 a.m.–7 p.m. by default). Immediate means the next message check during those hours. Custom delays count elapsed hours, then wait for your next available time.</p>
          <p v-if="form.personalEmailDelayMode === 'business_day'">With the default schedule: Friday at 4 p.m. → Monday at 4 p.m.; Monday at 6 p.m. → Wednesday at 7 a.m.</p>
          <label>What to send
            <select v-model="form.personalEmailDeliveryMode">
              <option value="notification">Notification only — read and reply in the app (default)</option>
              <option value="forward_one_to_one">Include one-to-one emails and let me reply by email</option>
            </select>
          </label>
          <p v-if="form.personalEmailDeliveryMode === 'forward_one_to_one'">Ordinary one-to-one email content will be sent to your personal inbox. Reply to that email to send your answer through your organization’s Messages email address. Your personal address is not added to the work conversation.</p>
          <p>Group conversations and secure messages always send a notification only. Open the app to reply or reply all. Attachments stay in the app.</p>
        </fieldset>
        <button type="button" :disabled="saving || invalid" @click="save">{{ saving ? 'Saving…' : 'Save message delivery' }}</button>
        <p v-if="saved" role="status">Message delivery settings saved.</p>
      </template>
    </template>
    <button v-if="error && !loaded" type="button" @click="load">Try again</button>
  </section>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../../services/api';
const loading=ref(false), loaded=ref(false), saving=ref(false), saved=ref(false), error=ref('');
const delivery=ref({eligible:false});
const form=reactive({personalEmailNotify:true,personalEmailDeliveryMode:'notification',personalEmailDelayMode:'business_day',personalEmailDelayHours:24});
const invalid=computed(()=>form.personalEmailDelayMode==='hours'&&(!Number.isInteger(form.personalEmailDelayHours)||form.personalEmailDelayHours<1||form.personalEmailDelayHours>168));
const eligibilityNote=computed(()=>({sso:'Your work SSO email receives messages. Personal-email forwarding is unavailable while that account is active.',missing_personal_email:'Add your personal email in Account settings to use reminders.',inactive_staff:'Message delivery is available to active staff accounts.',verification_unavailable:'We could not verify your work mailbox. Try again later.'}[delivery.value.reason]||'Personal delivery requires an app-only mailbox or a disabled SSO account with active app access.'));
function timingChanged(){if(form.personalEmailDelayMode==='business_day')form.personalEmailDelayHours=24;}
function apply(data){for(const key of Object.keys(form))if(data.prefs?.[key]!=null)form[key]=data.prefs[key];delivery.value=data.personalDelivery||{eligible:false};}
async function load(){loading.value=true;error.value='';try{const {data}=await api.get('/communications/prefs',{skipGlobalLoading:true});apply(data);loaded.value=true;}catch(e){error.value=e.response?.data?.error?.message||'Could not load message delivery settings.';}finally{loading.value=false;}}
async function save(){if(invalid.value)return;saving.value=true;saved.value=false;error.value='';try{const patch={...form};const {data}=await api.patch('/communications/prefs',patch,{skipGlobalLoading:true});apply(data);saved.value=true;}catch(e){error.value=e.response?.data?.error?.message||'Could not save message delivery settings.';}finally{saving.value=false;}}
onMounted(load);
</script>
<style scoped>
.personal-delivery{padding:20px;border:1px solid var(--border-color,#cad6d0);border-radius:10px;background:var(--bg-primary,#fff);color:var(--text-primary,#263c35)}
.personal-delivery h3{margin:0 0 12px}.personal-delivery p{line-height:1.5;font-size:14px}.personal-delivery label{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}.personal-delivery fieldset{border:0;padding:0;margin:0}.personal-delivery select,.personal-delivery input[type=number]{padding:9px;max-width:100%;font:inherit}.personal-delivery button{padding:10px 14px;font:inherit;cursor:pointer}.delivery-note{padding:12px;background:#fff3d4;color:#513e09}
</style>
