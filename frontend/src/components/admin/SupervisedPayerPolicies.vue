<template>
  <section class="payer-policy" aria-label="Supervised billing policies">
    <h2>Supervised billing &amp; January 2027 readiness</h2>
    <p>Keep the treating clinician, overseeing clinician, and billing organization distinct. Colorado Medicaid requires the service provider’s individual NPI on behavioral-health claims beginning January 1, 2027.</p>
    <p>Confirm the applicable payer/product instructions and Claim.MD mapping before verifying a rule. Neither an accepted claim nor an NPI alone establishes credentialing or enrollment.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading">Loading payer policies…</p>
    <div class="policy-list"><button v-for="p in policies" :key="`${p.payerId}:${p.planType}`" :disabled="busy" @click="edit(p)">{{ p.payerId }} · {{ p.planType }} · Version {{ p.version }}</button><button :disabled="busy" @click="edit()">New payer/product policy</button></div>
    <details><summary>Individual NPI readiness ({{ providers.filter(p=>!p.npiValid).length }} need review)</summary><p>Checks presence and checksum only. Verify Type 1 identity and payer enrollment separately. Add missing individual NPIs in the clinician’s profile.</p><table><thead><tr><th>Clinician</th><th>Individual NPI</th><th>Readiness</th></tr></thead><tbody><tr v-for="p in providers" :key="p.id"><td>{{ p.name }}</td><td>{{ p.npi || 'Missing' }}</td><td>{{ p.npiValid ? 'Recorded — verify identity/enrollment' : 'Needs a valid individual NPI' }}</td></tr></tbody></table></details>
    <form @submit.prevent="save">
      <fieldset :disabled="busy || loading">
        <div class="fields"><label>Exact payer ID<input v-model="form.payerId" required maxlength="32" :readonly="!!form.version" placeholder="e.g. COCHA" /></label><label>Exact insurance plan type<input v-model="form.planType" required maxlength="100" :readonly="!!form.version" /></label></div>
        <label><input v-model="form.coloradoMedicaid" type="checkbox" /> Colorado Medicaid behavioral health</label>
        <div v-for="(rule,index) in form.rules" :key="index" class="rule">
          <h3>Service-date period {{ index + 1 }}</h3>
          <div class="fields"><label>Effective from<input v-model="rule.effectiveFrom" type="date" required /></label><label>Effective through<input v-model="rule.effectiveThrough" type="date" required /></label></div>
          <label>Provider mapping<select v-model="rule.providerMapping"><option value="supervisor_rendering">Overseeing provider in rendering field (legacy policy)</option><option value="service_rendering_with_supervisor">Treating provider in rendering field + separate supervising provider</option></select></label>
          <p v-if="rule.providerMapping === 'service_rendering_with_supervisor'">Use only after the payer and Claim.MD confirm these fields for this product. January field-placement guidance still requires verification.</p>
          <label>Authoritative policy / confirmation reference<textarea v-model="rule.reference" required maxlength="1000" /></label>
          <label><input v-model="rule.deferredCosignAllowed" type="checkbox" /> Verified policy permits submission after the treating provider signs, before supervisor cosign</label>
          <label><input v-model="rule.mappingVerified" type="checkbox" /> I verified this mapping and the applicable supervised-billing eligibility requirements</label>
          <p>Required non-billable review types override discretionary supervisor settings.</p>
          <div class="fields"><label v-for="type in noteTypes" :key="type"><input v-model="rule.requiredReviewTypes" type="checkbox" :value="type" /> {{ type.toLowerCase().replaceAll('_',' ') }}</label></div>
          <button type="button" @click="form.rules.splice(index,1)">Remove period from this new version</button>
        </div>
        <button type="button" @click="form.rules.push(newRule())">Add effective period</button>
        <label>Reason for policy change<textarea v-model="reason" required maxlength="1000" /></label>
        <button type="submit">{{ busy ? 'Saving…' : 'Save policy version' }}</button>
      </fieldset>
    </form>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true}});
const noteTypes=['TERMINATION','TREATMENT_PLAN','CONTACT_NOTE','CONTACT','APPOINTMENT_WAIVER','APPOINTMENT_CHANGE'];
const newRule=()=>({effectiveFrom:'',effectiveThrough:'',providerMapping:'supervisor_rendering',mappingVerified:false,deferredCosignAllowed:false,reference:'',requiredReviewTypes:[]});
const empty=()=>({payerId:'',planType:'',coloradoMedicaid:false,rules:[newRule()],version:0});
const providers=ref([]);
const policies=ref([]),form=ref(empty()),reason=ref(''),loading=ref(false),busy=ref(false),error=ref(''),notice=ref('');
let generation=0,active=true;
onBeforeUnmount(()=>{active=false;generation++;});
function edit(p){form.value=p?JSON.parse(JSON.stringify(p)):empty();reason.value='';notice.value='';}
async function load(){const g=++generation;policies.value=[];providers.value=[];edit();loading.value=true;error.value='';try{const {data}=await api.get('/medical-billing/supervised-payer-policies',{params:{agencyId:props.agencyId}});if(active&&g===generation)policies.value=data.items||[];const roster=await api.get('/medical-billing/supervised-provider-readiness',{params:{agencyId:props.agencyId}});if(active&&g===generation)providers.value=roster.data.providers||[];}catch(e){if(active&&g===generation)error.value=e.response?.data?.error?.message||'Payer policies are awaiting setup.';}finally{if(active&&g===generation)loading.value=false;}}
async function save(){if(busy.value)return;const g=generation;busy.value=true;error.value='';try{await api.post('/medical-billing/supervised-payer-policies',{agencyId:props.agencyId,policy:form.value,version:form.value.version,reason:reason.value});if(active&&g===generation){await load();notice.value='New policy version saved. Claims require a fresh review.';}}catch(e){if(active&&g===generation)error.value=e.response?.data?.error?.message||'Unable to save policy';}finally{if(active)busy.value=false;}}
watch(()=>props.agencyId,load,{immediate:true});
</script>
<style scoped>
.payer-policy{min-width:0;overflow-wrap:anywhere;background:var(--bg-primary,#fff);border:1px solid var(--border-color,#dce3eb);border-radius:12px;padding:1.25rem;margin:1rem 0;color:var(--text-primary,#172d45)}p{line-height:1.5;max-width:90ch}.fields>label{min-width:0;flex:1 1 180px}select{width:100%}.fields,.policy-list{display:flex;gap:1rem;flex-wrap:wrap}label{display:block;margin:.8rem 0}input:not([type=checkbox]),select,textarea{display:block;padding:.55rem;border:1px solid #bac6d5;border-radius:6px;max-width:100%;background:var(--bg-primary,#fff);color:inherit}textarea{width:100%}.rule{border-top:1px solid #dce3eb;margin:1rem 0;padding-top:.5rem}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:.6rem;border-bottom:1px solid #dce3eb}details{margin:1rem 0}fieldset{min-width:0;width:100%;border:0;padding:0}button{padding:.6rem;margin:.3rem;border:1px solid #b4c1d0;border-radius:6px;background:var(--bg-primary,#fff);color:inherit;cursor:pointer}button:disabled{opacity:.5}[role=alert]{color:#a32121}
</style>
