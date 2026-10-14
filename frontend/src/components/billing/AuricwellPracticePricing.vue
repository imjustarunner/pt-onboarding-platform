<template>
  <details class="practice-pricing" @toggle="onToggle">
    <summary>Review this practice’s AuricWell billing categories</summary>
    <p>Assign one billing category per active person. Saved drafts preserve a pricing snapshot for agreement review; they do not change permissions, sign an agreement or activate billing.</p>
    <p v-if="busy" role="status">Loading pricing review…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="loaded">
      <label>Practice plan<select v-model="tier" :disabled="!canEdit || busy"><option v-for="p in AURICWELL_PLANS" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
      <label>Find a person<input v-model="search" type="search" placeholder="Search by name" /></label>
      <div class="scroll"><table><thead><tr><th>Person</th><th>Billing category</th><th>Clinical care</th><th>Supervised billing requirements</th></tr></thead><tbody>
        <tr v-for="person in filtered" :key="person.userId"><th>{{ person.name }}</th><td><select v-model="person.category" :disabled="!canEdit || busy" :aria-label="`Billing category for ${person.name}`" @change="categoryChanged(person)"><option value="">Choose category…</option><option v-for="(label,key) in AURICWELL_SEAT_CATEGORIES" :key="key" :value="key">{{ label }}</option></select></td>
          <td><input v-model="person.clinical" type="checkbox" :disabled="!canEdit || busy || person.category !== 'administrator'" :aria-label="`${person.name} provides clinical care`" /></td>
          <td><template v-if="person.category === 'supervised'"><label>Signing clinician<select v-model.number="person.signingProviderId" :disabled="!canEdit || busy"><option :value="0">Choose clinician…</option><option v-for="p in signers.filter(p=>p.userId!==person.userId)" :key="p.userId" :value="p.userId">{{ p.name }}</option></select></label><label class="check"><input v-model="person.requiresCosign" type="checkbox" :disabled="!canEdit || busy" /> EHR notes require their signature / cosign</label><label class="check"><input v-model="person.billsUnderOtherLicense" type="checkbox" :disabled="!canEdit || busy" /> Bills under their license</label></template><span v-else>—</span></td>
        </tr>
      </tbody></table></div>
      <p v-if="!people.length">No active employees are affiliated with this practice.</p>
      <p v-if="quote.error">{{ quote.error }}</p><p v-else><strong>Practice and seats: {{ money(quote.value.subscriptionCents) }} / month</strong> · {{ quote.value.clinicalSeats }} clinical seats contribute to pooled allowances.</p>
      <button v-if="canEdit" type="button" :disabled="busy || !!quote.error" @click="save">Save pricing draft</button><button type="button" :disabled="busy" @click="load">Refresh roster</button>
      <p v-if="!canEdit">A platform administrator can save the reviewed billing categories.</p>
    </template>
  </details>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import api from '../../services/api';
import {useAuthStore} from '../../store/auth';
import {AURICWELL_PLANS,AURICWELL_SEAT_CATEGORIES,quoteAuricwellSeats} from '../../config/auricwellPricing.js';
const props=defineProps({agencyId:{type:[Number,String],required:true}});
const auth=useAuthStore(),canEdit=computed(()=>auth.user?.role==='super_admin');
const people=ref([]),tier=ref('basic'),search=ref(''),revision=ref(0),loaded=ref(false),busy=ref(false),error=ref(''),notice=ref('');let sequence=0,opened=false;
const filtered=computed(()=>people.value.filter(p=>p.name.toLowerCase().includes(search.value.trim().toLowerCase())));
const signers=computed(()=>people.value.filter(p=>p.clinical&&['administrator','independent'].includes(p.category)));
const quote=computed(()=>{try{return {value:quoteAuricwellSeats({tier:tier.value,seats:people.value})}}catch(e){return {error:e.message}}});
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
function categoryChanged(p){if(p.category!=='administrator')p.clinical=['independent','supervised'].includes(p.category);if(p.category!=='supervised'){p.signingProviderId=0;p.requiresCosign=false;p.billsUnderOtherLicense=false;}}
function onToggle(e){opened=e.target.open;if(opened&&!loaded.value&&!busy.value)load();}
async function load(){const seq=++sequence;busy.value=true;error.value='';loaded.value=false;try{const {data}=await api.get(`/billing/${props.agencyId}/auricwell-pricing`);if(seq!==sequence)return;revision.value=data.draft?.revision||0;tier.value=data.draft?.input?.tier||'basic';const saved=new Map((data.draft?.input?.seats||[]).map(s=>[s.userId,s]));people.value=data.roster.map(p=>({userId:Number(p.id),name:`${p.last_name||''}, ${p.first_name||''}`,category:'',clinical:false,signingProviderId:0,requiresCosign:false,billsUnderOtherLicense:false,...saved.get(Number(p.id))}));loaded.value=true;}catch(e){if(seq===sequence)error.value=e.response?.data?.error?.message||'Pricing review is unavailable. Check access and migration 1624.';}finally{if(seq===sequence)busy.value=false;}}
async function save(){const seq=sequence;busy.value=true;error.value='';notice.value='';try{const {data}=await api.put(`/billing/${props.agencyId}/auricwell-pricing`,{revision:revision.value,tier:tier.value,seats:people.value});if(seq!==sequence)return;revision.value=data.revision;notice.value='Pricing draft saved. Customer billing has not changed.';}catch(e){if(seq===sequence)error.value=e.response?.data?.error?.message||'Could not save the pricing draft.';}finally{if(seq===sequence)busy.value=false;}}
watch(()=>props.agencyId,()=>{sequence++;loaded.value=false;busy.value=false;people.value=[];notice.value='';if(opened)load();});onBeforeUnmount(()=>{sequence++;});
</script>
<style scoped>
.practice-pricing{padding:24px;border:1px solid var(--border-color,#d7e5df);border-radius:14px;background:var(--bg-card,#fff);margin:20px 0}summary{font-size:1.15rem;font-weight:600;cursor:pointer}p{line-height:1.6}.scroll{overflow:auto;margin:18px 0}table{width:100%;min-width:800px;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid var(--border-color,#d7e5df);text-align:left;vertical-align:top}label{display:flex;flex-direction:column;gap:6px;margin:12px 0}.check{flex-direction:row;align-items:center}select,input[type=search],button{font:inherit;padding:10px;border:1px solid var(--border-color,#b9c9bf);border-radius:7px;background:var(--bg-input,#fff);color:inherit;max-width:100%;box-sizing:border-box}td select{max-width:300px}button{margin:10px 12px 0 0;cursor:pointer}button:disabled{opacity:.5}[role=alert]{color:#b91c1c}
</style>
