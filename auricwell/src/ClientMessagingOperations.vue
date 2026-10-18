<template>
  <section class="card">
    <h2>Texting operations</h2>
    <p>Manage support coverage and approved answers. Campaigns, numbers and carrier activation are controlled by the platform superadmin.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="form">
      <form @submit.prevent="save">
        <label>Close resolved conversations after this many days<input v-model.number="form.resolvedCloseDays" type="number" min="1" max="90" required /></label>
        <p>Unanswered questions and new leads stay open. New messages reopen closed conversations.</p>
        <h3>Approved automatic answers</h3><p>Only an exact matching question triggers a reply. Automated answers keep the conversation open for staff follow-up.</p>
        <article v-for="(f,i) in form.faqs" :key="i" class="entry"><label>Question<input v-model="f.question" maxlength="300" required /></label><label>Approved answer<textarea v-model="f.answer" maxlength="1000" required /></label><label class="check"><input v-model="f.enabled" type="checkbox" />Use this answer</label><button type="button" class="outline" @click="form.faqs.splice(i,1)">Remove answer</button></article>
        <div class="actions"><button type="button" class="outline" @click="form.faqs.push({question:'',answer:'',enabled:false})">Add answer</button><button :disabled="busy">Save operations</button></div>
      </form>
      <h3>Staff phone forwarding and provider texting</h3>
      <p>Forwarded messages may contain private client information. Enable only for staff who agreed and whose device is approved. Staff must include the conversation code in every reply.</p>
      <label>Staff member<select v-model="staffId" @change="selectStaff"><option value="">Choose a staff member</option><option v-for="s in form.staff" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
      <form v-if="staffId&&relay" @submit.prevent="saveRelay">
        <label>Approved mobile number (needed for phone forwarding)<input v-model="relay.phone" type="tel" :required="relay.enabled" placeholder="+17195550123" /></label>
        <label>Timezone<input v-model="relay.timezone" required placeholder="America/Denver" /></label>
        <label class="check"><input v-model="relay.providerTexting" type="checkbox" />Allow assigned clients to text this provider through the agency provider number</label>
        <label class="check"><input v-model="relay.support" type="checkbox" />Receive main support inbox messages during work hours</label>
        <label class="check"><input v-model="relay.consentConfirmed" type="checkbox" />Staff agreed to SMS forwarding at this number</label>
        <label class="check"><input v-model="relay.deviceApproved" type="checkbox" />This device is approved for handling client messages</label>
        <label class="check"><input v-model="relay.enabled" type="checkbox" />Enable forwarding during the hours below</label>
        <div v-for="(s,i) in relay.shifts" :key="i" class="shift"><select v-model.number="s.day" aria-label="Day"><option v-for="(d,j) in days" :key="d" :value="j">{{ d }}</option></select><input v-model="s.start" type="time" aria-label="Start time" required /><input v-model="s.end" type="time" aria-label="End time" required /><button type="button" class="outline" @click="relay.shifts.splice(i,1)">Remove</button></div>
        <div class="actions"><button type="button" class="outline" @click="relay.shifts.push({day:1,start:'08:00',end:'17:00'})">Add work hours</button><button :disabled="busy">Save staff settings</button></div>
      </form>
      <h3>Delivery activity</h3><button class="outline" :disabled="busy" @click="loadDeliveries">Refresh delivery activity</button>
      <p v-if="deliveries?.inboundReview.length" class="notice">{{ deliveries.inboundReview.length }} incoming events need review. Check the carrier activity and the rejected relay audit records.</p>
      <ul v-if="deliveries?.inboundReview.length"><li v-for="event in deliveries.inboundReview" :key="event.id">Incoming event · {{ new Date(event.at).toLocaleString() }} <button class="outline" :disabled="busy" @click="retryInbound(event.id)">Retry processing after correction</button></li></ul>
      <ul v-if="deliveries" class="deliveries"><li v-for="d in deliveries.deliveries" :key="d.id"><strong>{{ d.category }}</strong> · {{ d.status.replaceAll('_',' ') }} · {{ new Date(d.created_at).toLocaleString() }}<template v-if="d.status==='needs_review'"><label class="check"><input v-model="checked[d.id]" type="checkbox" />I checked the carrier account and confirmed this was not sent</label><button class="outline" :disabled="!checked[d.id]||busy" @click="retry(d.id)">Retry this message</button></template></li></ul>
    </template>
  </section>
</template>
<script setup>
import { ref,onMounted } from 'vue';import { api } from './api';
const props=defineProps({base:String});const form=ref(null),relay=ref(null),staffId=ref(''),busy=ref(false),error=ref(''),notice=ref(''),deliveries=ref(null),checked=ref({});const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
async function run(fn){busy.value=true;error.value='';notice.value='';try{await fn();}catch(e){error.value=e.message;}finally{busy.value=false;}}
function selectStaff(){relay.value=JSON.parse(JSON.stringify(form.value.relays.find(r=>r.accountId===staffId.value)||{revision:0,phone:'',timezone:'America/Denver',enabled:false,providerTexting:false,support:false,consentConfirmed:false,deviceApproved:false,shifts:[]}));}
const save=()=>run(async()=>{form.value=await api(`${props.base}/sms/operations`,{method:'PUT',body:form.value});notice.value='Operations saved.';});
const saveRelay=()=>run(async()=>{form.value=await api(`${props.base}/sms/staff/${staffId.value}`,{method:'PUT',body:relay.value});selectStaff();notice.value='Staff settings saved.';});
const loadDeliveries=()=>run(async()=>{deliveries.value=await api(`${props.base}/sms/deliveries`);});
const retry=id=>run(async()=>{await api(`${props.base}/sms/deliveries/${id}/retry`,{method:'POST',body:{confirmedNotSent:checked.value[id]===true}});deliveries.value=await api(`${props.base}/sms/deliveries`);});
const retryInbound=id=>run(async()=>{await api(`${props.base}/sms/events/${id}/retry`,{method:'POST',body:{}});deliveries.value=await api(`${props.base}/sms/deliveries`);});
onMounted(()=>run(async()=>{form.value=await api(`${props.base}/sms/operations`);}));
</script>
<style scoped>.check{display:flex;flex-direction:row;gap:12px;align-items:flex-start;margin:16px 0}.check input{width:22px;height:22px;flex:0 0 22px}.entry{border:1px solid #d5ded8;border-radius:12px;padding:18px;margin:16px 0}.shift{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.shift>*{width:auto;max-width:100%}.deliveries{padding-left:20px}.deliveries li{padding:12px 0;border-bottom:1px solid #d5ded8}</style>
