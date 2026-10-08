<template>
  <section ref="root" class="staff-choices" aria-label="Personal phone communication choices">
    <h2>Texting access, notifications and forwarding</h2>
    <p>Answer each choice below, then sign and save. These choices control texts to your personal phone. You can still read and send authorized client messages in the app when every choice is No.</p>
    <label v-if="!initial && !agencyId">Organization <select v-model="selectedAgency" :disabled="saving || busy"><option value="">Choose an organization</option><option v-for="agency in agencies" :key="agency.id" :value="agency.id">{{ agency.name }}</option></select></label>
    <p v-if="loading">Loading your choices…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="data" @submit.prevent="save">
      <p><strong>{{ data.disclosure.brandName }}</strong> · {{ data.disclosure.legalName }}</p>
      <p>{{ data.disclosure.text }}</p>
      <nav v-if="data.disclosure.policyReady"><a :href="data.disclosure.termsUrl" target="_blank" rel="noopener">SMS terms</a><a :href="data.disclosure.privacyUrl" target="_blank" rel="noopener">SMS privacy</a></nav>
      <p v-if="!data.disclosure.policyReady">Your organization is preparing its SMS policies. You can decline all categories now; enrollment will be available once the policies are published.</p>
      <div v-for="program in data.disclosure.programs" :key="program.campaignId" class="program-links"><a :href="program.termsUrl" target="_blank" rel="noopener">{{ program.brandName }} registered program terms</a> · <a :href="program.privacyUrl" target="_blank" rel="noopener">Privacy</a></div>
      <p v-if="data.reviewedAt">Last reviewed: {{ new Date(data.reviewedAt).toLocaleString() }}</p>
      <p v-if="data.needsReview && data.reviewedAt">Your program details or profile phone changed. Review and save your choices again.</p>
      <fieldset :disabled="readonly || busy || saving">
        <h3>Client texting and forwarding requests</h3>
        <p>These requests are separate from texts to your personal phone. Choosing No does not remove any existing app access.</p>
        <fieldset v-for="requestChoice in data.disclosure.accessRequests" :key="requestChoice.key" class="choice" data-testid="access-request">
          <legend>{{ requestChoice.label }}</legend><p>{{ requestChoice.description }}</p>
          <label><input type="radio" :name="`${id}-${requestChoice.key}`" :value="false" required v-model="accessRequests[requestChoice.key]" /> No</label>
          <label><input type="radio" :name="`${id}-${requestChoice.key}`" :value="true" required v-model="accessRequests[requestChoice.key]" /> Yes</label>
        </fieldset>
        <h3>Optional texts to my personal phone</h3>

        <p class="hint">Texts use your personal mobile number in Contact & Address. Review that section before opting in. Choosing No does not require a phone number.</p>
        <fieldset v-for="choice in data.disclosure.choices" :key="choice.key" class="choice">
          <legend>{{ choice.label }}</legend><p>{{ choice.description }}</p>
          <label><input type="radio" :name="`${id}-${choice.key}`" :value="false" required v-model="choices[choice.key]" /> No</label>
          <label><input type="radio" :name="`${id}-${choice.key}`" :value="true" :disabled="!data.disclosure.policyReady" v-model="choices[choice.key]" required /> Yes</label>
        </fieldset>
        <fieldset class="choice" data-testid="arrival-email"><legend>Kiosk check-in emails</legend><p>Your in-app check-in alert is always on. Add an email fallback if the arrival has not been acknowledged in the app.</p><label><input type="radio" :name="`${id}-arrival-email`" :value="false" v-model="arrivalEmail" required /> App only — no email</label><label><input type="radio" :name="`${id}-arrival-email`" :value="true" v-model="arrivalEmail" required /> Also email me</label></fieldset>
        <aside><h3>Client texting, phone forwarding and calls</h3>
          <p>Client messages to your assigned business number are handled in the app. These personal-phone choices do not enroll your clients or give permission to disclose their information.</p>
          <p>{{ data.disclosure.future }}</p>
          <p>Message alerts contain a sign-in link, not a client’s message or an automatic login. Keep your phone locked and use the secure app to respond.</p>
        </aside>
        <label>Full name for electronic signature <input v-model="signerName" autocomplete="name" maxlength="200" required /></label>
        <label class="ack"><input type="checkbox" v-model="acknowledged" required /> I reviewed these choices, control my saved personal mobile number if opting in, and electronically sign my selections. I can choose No for every category.</label>
        <button type="submit" :disabled="!acknowledged || !signerName.trim()">{{ busy || saving ? 'Saving…' : 'Sign and save my choices' }}</button>
      </fieldset>
      <p v-if="data.activation.some(a=>a.status.startsWith('pending'))" role="status">Your choices are saved. Some selected texts are not active yet. Your organization must complete campaign/number setup and review your signed SMS enrollment before activation. An administrator can send you the enrollment form through Texting Numbers → Consent requests. Saving these preferences does not override STOP. You can keep using the app.</p>
      <p v-else-if="data.reviewedAt && data.activation.some(a=>a.status==='active')" role="status">Your selected categories are enrolled. Delivery also follows your notification settings and any STOP request.</p>
    </form>
  </section>
</template>
<script setup>
import {ref,watch,onMounted,useId} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],default:null},initial:{type:Object,default:null},externalSave:Boolean,readonly:Boolean,busy:Boolean});
const emit=defineEmits(['save','saved']);
const root=ref(null),arrivalEmail=ref(null);
const id=useId(),agencies=ref([]),selectedAgency=ref(props.agencyId||''),data=ref(null),choices=ref({}),accessRequests=ref({}),phone=ref(''),signerName=ref(''),acknowledged=ref(false),loading=ref(false),saving=ref(false),error=ref(''),notice=ref('');let request=0;
function apply(value){data.value=value;choices.value=Object.fromEntries(value.disclosure.choices.map(c=>[c.key,(value.answeredChoices||[]).includes(c.key)?value.choices[c.key]:null]));accessRequests.value=value.reviewedAt?{...value.accessRequests}:{inAppTexting:null,personalSmsRelay:null};arrivalEmail.value=value.arrivalEmail??null;phone.value=value.phone||'';acknowledged.value=false;signerName.value='';}
watch(()=>props.initial,value=>{if(value)apply(value)},{immediate:true});
watch(()=>props.agencyId,value=>{if(value)selectedAgency.value=value});
async function load(){if(props.externalSave||props.initial)return;const current=++request;data.value=null;notice.value='';error.value='';if(!selectedAgency.value){loading.value=false;return;}loading.value=true;try{const r=await api.get('/me/communication-choices',{params:{agencyId:selectedAgency.value}});if(current===request)apply(r.data);}catch(e){if(current===request)error.value=e.response?.data?.error?.message||'Unable to load your choices.';}finally{if(current===request)loading.value=false;}}
watch(selectedAgency,load);
onMounted(async()=>{if(props.initial||props.externalSave)return;if(!props.agencyId){try{const r=await api.get('/me/communication-choices');agencies.value=r.data.agencies||[];if(agencies.value.length===1)selectedAgency.value=agencies.value[0].id;}catch{error.value='Unable to load your organizations.';}}else await load();});
async function save(){if(props.readonly||props.busy)return;if(!root.value?.querySelector('form')?.reportValidity())return;const input={agencyId:Number(selectedAgency.value||data.value.agencyId),phone:phone.value,choices:{...choices.value},accessRequests:{...accessRequests.value},arrivalEmail:arrivalEmail.value,signerName:signerName.value,acknowledged:acknowledged.value,disclosureHash:data.value.disclosureHash};if(props.externalSave){emit('save',input);return;}saving.value=true;error.value='';notice.value='';try{const r=await api.put('/me/communication-choices',input);apply(r.data);notice.value='Your choices were saved.';emit('saved',r.data);}catch(e){error.value=e.response?.data?.error?.message||'Unable to save your choices. Please try again.';}finally{saving.value=false;}}
</script>
<style scoped>
.staff-choices{padding:24px;border:1px solid var(--border-color,#cbd5d1);border-radius:12px;background:var(--bg-primary,#fff);color:var(--text-primary,#203b32);line-height:1.6}.staff-choices>h2{margin-top:0}fieldset{border:0;padding:0;margin:16px 0}.choice{border:1px solid var(--border-color,#cbd5d1);border-radius:8px;padding:16px}.choice legend{font-weight:700}.choice label{display:inline-flex;gap:8px;margin-right:24px}label{display:block;margin:12px 0}input:not([type=radio]):not([type=checkbox]),select{display:block;width:min(100%,480px);padding:10px;border:1px solid #94a39d;border-radius:6px;font:inherit;box-sizing:border-box}.ack{display:flex;align-items:flex-start;gap:10px}.hint,.program-links{font-size:13px}nav{display:flex;gap:20px}aside{background:var(--bg-secondary,#f3f6f4);padding:16px;border-radius:8px}button{padding:12px 18px;border:0;border-radius:6px;background:#285e51;color:white;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}[role=alert]{color:#a72121}
.choice:has(input:checked){border-color:#315f8c;background:#f1f6fb}.choice input{accent-color:#244e7a}.choice legend{color:#153b60}.staff-choices input,.staff-choices select{color:#172d45}.staff-choices :focus-visible{outline:3px solid #2563eb;outline-offset:3px}</style>
