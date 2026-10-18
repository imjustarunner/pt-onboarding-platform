<template>
  <section class="card">
    <h3>Messages and reminders</h3>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <form v-if="form" @submit.prevent="save">
      <p>Email: {{ form.email || 'No email saved' }} · Phone: {{ form.phone || 'No phone saved' }}</p>
      <p v-if="form.stopped" class="notice">All text messages are stopped, including staff replies. To restore texts, send START to {{ form.smsFrom || 'your agency’s number' }}. Your choices below will be kept.</p>
      <p v-if="!form.smsAvailable" class="notice">Texting is awaiting activation. You can save permission and preferences now; no texts will be sent until the agency is ready.</p>
      <label class="choice"><input v-model="form.emailEnabled" type="checkbox" /><span><strong>Email appointment notices</strong><small>Appointment reminders and virtual-session links.</small></span></label>
      <div class="choices">
        <label v-for="choice in choices" :key="choice.key" class="choice" :class="{ selected: form.categories[choice.key] }">
          <input v-model="form.categories[choice.key]" type="checkbox" /><span><strong>{{ choice.label }}</strong><small>{{ choice.description }}</small></span>
        </label>
      </div>
      <label v-if="recipients.length">Who receives texts at this phone?<select v-model="form.recipientAccountId"><option value="">Select the patient or authorized guardian</option><option v-for="r in recipients" :key="r.id" :value="r.id">{{ r.name }} · {{ r.actorType }}</option></select></label>
      <p>Texts from {{ form.brand }}{{ form.smsFrom ? ` (${form.smsFrom})` : '' }}. Message frequency varies. Msg &amp; data rates may apply. STOP turns off all SMS; HELP provides support. Email and app access remain available.</p>
      <fieldset v-if="needsConsent">
        <legend>Permission for newly selected texts</legend>
        <label class="choice"><input v-model="consent" type="checkbox" required /><span>The recipient agrees to the selected texts at the phone number above.</span></label>
        <label>Permission method<select v-model="method" required><option value="">Choose a method</option><option value="verbal_phone">Verbal — phone call</option><option value="verbal_in_person">Verbal — in person</option><option value="written">Written consent</option><option value="portal">Recipient selected in portal</option></select></label>
        <label>Consent record<input v-model="evidence" required maxlength="1000" placeholder="Who agreed, when, and the consent wording or reference" /></label>
      </fieldset>
      <button :disabled="busy">Save message preferences</button>
    </form>
  </section>
</template>
<script setup>
import { ref, watch, computed } from 'vue';
import { api } from './api';
const props = defineProps({ base: String, patientId: String });
const form=ref(null),original=ref({}),originalRecipient=ref(''),recipients=ref([]),error=ref(''),notice=ref(''),busy=ref(false),consent=ref(false),evidence=ref(''),method=ref('');
const choices=[{key:'reminders',label:'Appointment reminder texts',description:'Reply NOREMIND to stop these.'},{key:'links',label:'Virtual-session links',description:'Your join link five minutes before your appointment. Reply NOLINK to stop these.'},{key:'forms',label:'Forms and documents',description:'Intake, questionnaires and signature requests. Reply NOFORM to stop these.'},{key:'account',label:'Account and billing notices',description:'Information about your account and billing.'},{key:'conversations',label:'Staff and provider messages',description:'Two-way help and session adjustments, where available.'}];
const needsConsent=computed(()=>form.value && choices.some(c=>form.value.categories[c.key]&&(!original.value[c.key]||form.value.recipientAccountId!==originalRecipient.value)));
async function run(fn){busy.value=true;error.value='';notice.value='';try{await fn();}catch(e){error.value=e.message;}finally{busy.value=false;}}
function accept(value){form.value=value;original.value={...value.categories};originalRecipient.value=value.recipientAccountId;consent.value=false;evidence.value='';method.value='';}
watch(()=>[props.base,props.patientId],()=>run(async()=>{form.value=null;accept(await api(`${props.base}/sms/preferences/${props.patientId}`));recipients.value=(await api(`${props.base}/patients/${props.patientId}/message-contacts`)).filter(r=>r.actorType!=='staff');}),{immediate:true});
const save=()=>run(async()=>{accept(await api(`${props.base}/sms/preferences/${props.patientId}`,{method:'PUT',body:{...form.value,consentConfirmed:consent.value,consentMethod:method.value,evidence:evidence.value}}));notice.value='Message preferences saved.';});
</script>
<style scoped>
.choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:20px 0}.choice{display:flex;flex-direction:row;align-items:flex-start;gap:12px;border:1px solid #d5ded8;border-radius:12px;padding:16px;margin:0;cursor:pointer}.choice.selected{background:#eff8f3;border-color:#609979}.choice input{width:22px;height:22px;flex:0 0 22px;margin:2px 0}.choice small{display:block;margin-top:6px;font-weight:400;line-height:1.5}fieldset{border:1px solid #d5ded8;border-radius:12px;padding:18px;margin:20px 0}
</style>
