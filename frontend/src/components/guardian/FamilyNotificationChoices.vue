<template>
  <section class="family-notification-choices" :aria-label="ft('Notification choices')">
    <p v-if="loading" role="status">{{ ft("Loading your notification choices…") }}</p>
    <p v-if="error" role="alert">{{ ft(error) }} <button type="button" @click="load">{{ ft("Try again") }}</button></p>
    <form v-if="data" @submit.prevent="save">
      <p>{{ targets.length > 1 ? "Choose updates once for all profiles linked to your account." : "Choose your account updates." }} Texts are optional; insurance-card requests use email only.</p>
      <div class="choice-table"><table><thead><tr><th scope="col">{{ ft("Update") }}</th><th v-for="channel in channels" :key="channel.key" scope="col">{{ ft(channel.label) }}</th></tr></thead><tbody><tr v-for="category in data.categories" :key="category.key"><th scope="row">{{ category.label }}<small>{{ category.detail }}</small></th><td v-for="channel in channels" :key="channel.key"><input v-if="!category.emailOnly || ['email','off'].includes(channel.key)" v-model="choices[category.key]" type="radio" :name="category.key" :value="channel.key" :aria-label="`${category.label}: ${channel.label}`" :disabled="busy" required/><span v-else :aria-label="ft('Unavailable')">—</span></td></tr></tbody></table></div>
      <p v-if="wantsTexts" class="text-disclosure">{{ ft("You are requesting text updates for the choices above. Texts remain off until your number and text permission are verified. Message and data rates may apply. STOP stops texts; HELP requests help; START requests a restart where supported.") }}</p>
      <p v-if="mixed">{{ ft("Some profiles had different preferences. Choose a channel for each marked row to apply one set of choices across your family.") }}</p><details><summary>{{ ft("About these choices") }}</summary><p>{{ data.disclosure }}</p></details>
      <label class="confirm"><input v-model="confirmed" type="checkbox" required :disabled="busy"/> {{ ft("I confirm these notification choices.") }}</label>
      <button type="submit" :disabled="busy">{{ busy ? ft("Saving…") : ft("Confirm my choices") }}</button>
      <p v-if="saved" role="status">Your choices are saved.{{ wantsTexts ? ' Text preferences will apply when enrollment is active.' : '' }}</p>
    </form>
    <section v-if="saved && wantsTexts" class="text-disclosure"><h3>{{ ft("Text enrollment") }}</h3>
      <article v-for="entry in smsEntries" :key="entry.agencyId"><h4>{{ entry.name }}</h4><p>{{ smsMessage(entry.setup?.smsStatus) }}</p>
        <button v-if="entry.setup?.smsStatus==='needs_phone'" type="button" @click="editContact=!editContact">{{ ft("Update my phone number") }}</button>
        <button v-if="entry.setup?.smsStatus==='needs_consent' && !entry.path" type="button" :disabled="busy" @click="beginConsent(entry)">{{ ft("Review text consent") }}</button>
        <a v-if="entry.path" :href="entry.path" target="_blank" rel="noopener noreferrer">{{ ft("Open text consent form →") }}</a>
      </article>
      <FamilyAccountSettings v-if="editContact" :agency-id="agencyId || targets[0]?.agencyId" @notifications="editContact=false;checkSms()"/>
      <button type="button" :disabled="busy" @click="checkSms">{{ ft("Check text enrollment") }}</button><button type="button" @click="$emit('saved')">{{ ft("Continue") }}</button>
    </section>
  </section>
</template>
<script setup>
import { useFamilyLocale } from '../../composables/useFamilyLocale';
const { ft, locale: familyLocale } = useFamilyLocale();
import FamilyAccountSettings from './FamilyAccountSettings.vue';
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String],profiles:{type:Array,default:()=>[]}});
const emit=defineEmits(['saved']);
const channels=[{key:'email',label:'Email'},{key:'sms',label:'Text'},{key:'both',label:'Both'},{key:'off',label:'Off'}];
const targets=computed(()=>props.profiles.length ? [...new Map(props.profiles.flatMap(p=>(p.care_contexts?.length?p.care_contexts:[p]).map(c=>[`${c.agency_id}:${p.client_id}`,{agencyId:c.agency_id,clientId:p.client_id,name:c.agency_name||p.organization_name||'Care team'}]))).values()] : props.agencyId&&props.clientId ? [{agencyId:props.agencyId,clientId:props.clientId,name:'Your care team'}] : []);
const data=ref(null),entries=ref([]),choices=ref({}),loading=ref(false),busy=ref(false),error=ref(''),confirmed=ref(false),saved=ref(false),mixed=ref(false),smsEntries=ref([]),editContact=ref(false);
let seq=0;
const wantsTexts=computed(()=>Object.values(choices.value).some(v=>['sms','both'].includes(v)));
const smsMessage=status=>({needs_phone:'Add your phone number in Settings, then return here to enroll.',needs_consent:'Review and sign the text consent form for this agency.',enrolled:'Text enrollment is active. Your saved choices control the updates you receive.',awaiting_review:'Your signed text consent is waiting for care-team review.',stopped:'Texts are stopped for this number. Your care team can help you restart them.',unavailable:'Text enrollment is not available for this agency yet. Your email choices are saved.'}[status]||'Text enrollment could not be checked.');
async function checkSms(){const own=seq;const unique=[...new Map(targets.value.map(t=>[Number(t.agencyId),t])).values()];const results=await Promise.allSettled(unique.map(t=>api.get(`/guardian-portal/clients/${t.clientId}/notification-setup`,{params:{agencyId:t.agencyId}})));if(own!==seq)return;smsEntries.value=unique.map((t,i)=>({...t,setup:results[i].status==='fulfilled'?results[i].value.data:null,path:smsEntries.value.find(e=>e.agencyId===t.agencyId)?.path||''}));}
async function beginConsent(entry){busy.value=true;error.value='';try{const r=await api.post(`/guardian-portal/clients/${entry.clientId}/notification-setup/sms-consent`,{agencyId:entry.agencyId});entry.path=r.data.path;}catch(e){error.value=e.response?.status<500?e.response?.data?.error?.message:'Text consent could not be opened.';}finally{busy.value=false;}}
async function load(){const own=++seq;data.value=null;entries.value=[];error.value='';confirmed.value=false;saved.value=false;editContact.value=false;smsEntries.value=[];if(!targets.value.length)return;loading.value=true;
 try{const rows=await Promise.all(targets.value.map(async t=>({...t,...(await api.get(`/portal-migration/clients/${t.clientId}/notification-choices`,{params:{agencyId:t.agencyId}})).data})));if(own!==seq)return;
 entries.value=rows;data.value=rows[0];choices.value={};mixed.value=false;
 for(const c of data.value.categories){const values=new Set(rows.map(r=>r.choices[c.key]));choices.value[c.key]=values.size===1?[...values][0]:'';if(values.size>1)mixed.value=true;}
 }catch{if(own===seq)error.value='We could not load all family preferences. Try again before changing them.';}finally{if(own===seq)loading.value=false;}}
async function save(){if(busy.value||!confirmed.value||data.value.categories.some(c=>!choices.value[c.key]))return;const own=seq;busy.value=true;error.value='';saved.value=false;
 const snapshot={...choices.value};
 try{const results=await Promise.allSettled(entries.value.map(async entry=>{const r=await api.put(`/portal-migration/clients/${entry.clientId}/notification-choices`,{agencyId:entry.agencyId,token:entry.token,preferences:{choices:snapshot,revision:entry.revision,version:entry.version,confirm:'yes'}});entry.revision=r.data.revision;return r;}));
 if(own!==seq)return;const failed=results.filter(r=>r.status==='rejected').length;if(failed){error.value=`${failed} profile(s) could not be updated. The other profiles were saved. Reload preferences before trying again.`;confirmed.value=false;return;}
 saved.value=true;mixed.value=false;if(wantsTexts.value)await checkSms();else emit('saved');
 }finally{busy.value=false;}}
watch(()=>targets.value.map(t=>`${t.agencyId}:${t.clientId}`).join(','),load,{immediate:true});
onBeforeUnmount(()=>{seq++;});
</script>
<style scoped>
.family-notification-choices{padding:18px;border:1px solid #d6e3ef;border-radius:12px;background:white;color:#173451}.choice-table{max-width:100%;overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:12px 5px;border-bottom:1px solid #dfe7ef;text-align:center}th:first-child{text-align:left}th small{display:block;font-weight:400;color:#52647c;font-size:11px;margin-top:4px}input[type=radio],input[type=checkbox]{width:18px;height:18px;accent-color:#16457c}.confirm{display:flex;gap:10px;align-items:center;margin:20px 0}button{padding:12px 16px;background:#16457c;color:white;border:0;border-radius:8px;font:600 14px system-ui;cursor:pointer}p{line-height:1.6}details{margin-top:16px}p[role=alert]{color:#a12727}.text-disclosure{padding:14px;background:#f2f6fc;border-radius:8px}@media(max-width:440px){.family-notification-choices{padding:12px}table{font-size:12px}th small{display:none}th:first-child{width:42%}}
</style>
