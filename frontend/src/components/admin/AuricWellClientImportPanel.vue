<template>
  <section class="aw-import" aria-label="Client EHR records import">
    <header><h2>Bring over {{ clientLabel || 'this client' }}’s records</h2><p>Review each section against {{ sourceEhr }} before saving it to the selected client’s chart. Existing school and provider links stay on that chart.</p></header>
    <p v-if="error" role="alert" class="aw-error">{{ error }}</p>
    <p v-if="notice" role="status" class="aw-success">{{ notice }}</p>

    <section class="aw-step">
      <h3>Demographics and additional contacts</h3>
      <label>Demographics paste<textarea v-model="demographicsText" rows="7" :disabled="busy" placeholder="Legal Name&#10;Date of Birth&#10;Address&#10;Additional Contacts&#10;Name&#10;Relationship&#10;Phone&#10;Email" /></label>
      <label>Additional contacts paste <span class="aw-muted">(optional separate box)</span><textarea v-model="contactsText" rows="4" :disabled="busy" placeholder="Name: Pat Example&#10;Relationship: Parent&#10;Phone: (555) 555-0100&#10;Email: pat@example.com" /></label>
      <button type="button" :disabled="busy || !(demographicsText.trim() || contactsText.trim())" @click="reviewDemographics">Review demographics and contacts</button>
      <template v-if="demographicsDraft">
        <p class="aw-muted">Only selected, nonempty fields are updated. Compare the chart value before replacing it. Contact reminders and portal access keep their current settings.</p>
        <div class="aw-table-wrap"><table><thead><tr><th>Import</th><th>Field</th><th>Current chart</th><th>Reviewed value</th></tr></thead><tbody>
          <tr v-for="field in demographicFields" :key="field.key"><td><input v-model="selectedFields[field.key]" type="checkbox" :aria-label="`Import ${field.label}`" :disabled="busy" @change="demographicsSaved=false; demographicsReviewed=false" /></td><td>{{ field.label }}</td><td>{{ currentDemographics[field.key] || '—' }}</td><td><input v-model="demographicsDraft[field.key]" :type="field.type || 'text'" :aria-label="field.label" :disabled="busy" @input="demographicsSaved=false; demographicsReviewed=false" /></td></tr>
        </tbody></table></div>
        <p v-for="warning in contactWarnings" :key="warning" class="aw-warning">{{ warning }}</p>
        <h4>Additional contacts</h4>
        <p class="aw-muted">These are chart contacts. Importing does not create guardian accounts, send invitations, or enable reminders.</p>
        <article v-for="(contact, index) in contactsDraft" :key="index" class="aw-contact">
          <div class="aw-grid"><label>Name<input v-model="contact.fullName" :disabled="busy" @input="contact.saved=false; demographicsReviewed=false" /></label><label>Relationship<input v-model="contact.relationshipType" :disabled="busy" @input="contact.saved=false; demographicsReviewed=false" /></label><label>Phone<input v-model="contact.phone" :disabled="busy" @input="contact.saved=false; demographicsReviewed=false" /></label><label>Email<input v-model="contact.email" type="email" :disabled="busy" @input="contact.saved=false; demographicsReviewed=false" /></label></div>
          <label>Chart contact to update<select v-model="contact.existingContactId" :disabled="busy" @change="contact.saved=false; demographicsReviewed=false"><option value="">Find or add using the reviewed email/phone</option><option value="__review__" disabled>Choose the matching contact</option><option v-for="item in currentContacts" :key="item.id" :value="String(item.contact.id)">{{ item.contact.fullName }} · {{ item.contact.email || item.contact.phone || 'No contact details' }}</option></select></label>
          <p v-if="contact.existingContactId==='__review__'" class="aw-warning">More than one chart contact matches. Choose the correct contact before saving.</p>
          <span v-if="contact.saved" class="aw-success">Contact saved</span><button type="button" :disabled="busy || contact.saved" @click="contactsDraft.splice(index, 1); demographicsReviewed=false">Remove from import</button>
        </article>
        <button type="button" :disabled="busy" @click="contactsDraft.push({ fullName:'', relationshipType:'', phone:'', email:'', existingContactId:'', saved:false }); demographicsReviewed=false">Add contact to review</button>
        <label class="aw-check"><input v-model="demographicsReviewed" type="checkbox" :disabled="busy" /> I compared the selected demographics and contacts with the source and selected the correct existing contacts.</label>
        <button type="button" :disabled="busy || !demographicsReviewed" @click="saveDemographics">Save reviewed demographics and contacts</button>
      </template>
    </section>

    <section class="aw-step">
      <h3>Billing and insurance information</h3>
      <label>Insurance paste<textarea v-model="insuranceText" rows="7" :disabled="busy" placeholder="Primary Insurance: Carrier&#10;Member ID: …&#10;Subscriber Name: …&#10;Subscriber DOB: …&#10;Relationship to Subscriber: Child&#10;Secondary Insurance: …" /></label>
      <button type="button" :disabled="busy || !insuranceText.trim()" @click="reviewInsurance">Review insurance</button>
      <template v-if="insuranceDraft">
        <p class="aw-muted">Pasted nonempty fields are merged with insurance already on this chart. Review subscriber identity and coverage order. Saving leaves coverage unverified for the billing team.</p>
        <p v-for="warning in insuranceWarnings" :key="warning" class="aw-warning">{{ warning }}</p>
        <h4>Client identity for insurance</h4><div class="aw-grid"><label v-for="field in patientFields" :key="field.key">{{ field.label }}<input v-model="insuranceDraft.patient[field.key]" :type="field.type || 'text'" :disabled="busy" @input="insuranceReviewed=false" /></label></div>
        <h4>Primary coverage</h4><fieldset :disabled="busy" class="aw-policy"><InsurancePolicyFields v-model="insuranceDraft.primary" :patient="insuranceDraft.patient" :require-complete="false" @update:model-value="insuranceReviewed=false" /></fieldset>
        <label class="aw-check"><input v-model="hasSecondary" type="checkbox" :disabled="busy" @change="insuranceReviewed=false" /> Include secondary coverage</label>
        <fieldset v-if="hasSecondary" :disabled="busy" class="aw-policy"><InsurancePolicyFields v-model="insuranceDraft.secondary" :patient="insuranceDraft.patient" :require-complete="false" @update:model-value="insuranceReviewed=false" /></fieldset>
        <label class="aw-check"><input v-model="insuranceReviewed" type="checkbox" :disabled="busy" /> I compared the client, subscriber and primary/secondary details with the source.</label>
        <button type="button" :disabled="busy || !insuranceReviewed" @click="saveInsurance">Save reviewed insurance for billing review</button>
      </template>
    </section>

    <ClientEhrBringUpToDatePanel :key="`${agencyId}:${clientId}`" :open="true" embedded hide-demographics historical-import :source-system="sourceEhr" :client-id="clientId" :agency-id="agencyId" :client-label="clientLabel" @busy="clinicalBusy=$event" @imported="clinicalImported" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { canAccessMedicalBilling } from '../../config/medicalBillingAccess.js';
import InsurancePolicyFields from '../billing/InsurancePolicyFields.vue';
import ClientEhrBringUpToDatePanel from './clientChart/ClientEhrBringUpToDatePanel.vue';
import { contactMatches, nonemptyFields, parseAdditionalContacts, parseInsurancePaste, splitDemographicsContacts } from '../../utils/auricwellClientImport.js';

const props = defineProps({ agencyId: { type:[String, Number], required:true }, clientId: { type:[String, Number], required:true }, clientLabel: { type:String, default:'' }, sourceEhr: { type:String, default:'TherapyNotes' }, initialDemographics: { type:String, default:'' } });
const emit = defineEmits(['saved', 'busy']);
const auth = useAuthStore();
const demographicsText=ref(props.initialDemographics), contactsText=ref(''), insuranceText=ref(''), error=ref(''), notice=ref('');
const saving=ref(false), clinicalBusy=ref(false), busy=computed(()=>saving.value || clinicalBusy.value);
const demographicsDraft=ref(null), currentDemographics=ref({}), selectedFields=ref({}), currentContacts=ref([]), contactsDraft=ref([]), contactWarnings=ref([]);
const demographicsReviewed=ref(false), demographicsSaved=ref(false), insuranceDraft=ref(null), insuranceReviewed=ref(false), insuranceWarnings=ref([]), hasSecondary=ref(false);
let generation=0;
watch(busy, value=>emit('busy', value), {flush:'sync'});
watch(()=>[props.agencyId,props.clientId],()=>{generation++;demographicsText.value=props.initialDemographics;contactsText.value='';insuranceText.value='';error.value='';notice.value='';demographicsDraft.value=null;insuranceDraft.value=null;contactsDraft.value=[];currentContacts.value=[];clinicalBusy.value=false;demographicsSaved.value=false;}, {flush:'sync'});
watch([demographicsText,contactsText],()=>{demographicsDraft.value=null;demographicsReviewed.value=false;demographicsSaved.value=false;});
watch(insuranceText,()=>{insuranceDraft.value=null;insuranceReviewed.value=false;});
onBeforeUnmount(()=>{generation++;emit('busy',false);});
const demographicFields=[{key:'fullName',label:'Legal name',column:'full_name'},{key:'dateOfBirth',label:'Date of birth',column:'date_of_birth',type:'date'},{key:'addressStreet',label:'Street',column:'address_street'},{key:'addressCity',label:'City',column:'address_city'},{key:'addressState',label:'State',column:'address_state'},{key:'addressZip',label:'ZIP',column:'address_zip'},{key:'timezone',label:'Timezone',column:'timezone'},{key:'contactPhone',label:'Phone',column:'contact_phone'},{key:'email',label:'Email',column:'email'},{key:'administrativeSex',label:'Administrative sex',column:'gender'},{key:'grade',label:'Grade',column:'grade'}];
const patientFields=[{key:'firstName',label:'Legal first name'},{key:'lastName',label:'Legal last name'},{key:'dateOfBirth',label:'Date of birth',type:'date'},{key:'sex',label:'Claim sex (M/F/U)'},{key:'addressLine1',label:'Address'},{key:'addressLine2',label:'Apartment/suite'},{key:'city',label:'City'},{key:'state',label:'State'},{key:'postalCode',label:'ZIP'}];
const requestConfig=()=>({skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.agencyId)}});
function context(){return {generation,clientId:Number(props.clientId),agencyId:Number(props.agencyId)};}
function check(scope){if(scope.generation!==generation)throw new Error('The selected client changed. Review the new client before importing.');}
function fail(e,scope){if(scope.generation===generation)error.value=e.response?.data?.error?.message || e.message || 'This step could not be saved.';}

async function reviewDemographics(){
  const scope=context();saving.value=true;error.value='';notice.value='';
  try{
    const split=splitDemographicsContacts(demographicsText.value);
    const [parsed,chart,contacts]=await Promise.all([
      split.demographics.trim()?api.post(`/clients/${scope.clientId}/demographics/parse`,{text:split.demographics},requestConfig()):Promise.resolve({data:{parsed:{}}}),
      api.get(`/clients/${scope.clientId}`,requestConfig()),api.get(`/clients/${scope.clientId}/contacts`,requestConfig())
    ]);check(scope);
    const client=chart.data.client || chart.data;
    if(Number(client.agency_id)!==scope.agencyId)throw new Error('The selected chart belongs to a different agency.');
    if(!Array.isArray(contacts.data.items))throw new Error('Existing contacts could not be reviewed. Retry before importing contacts.');
    currentContacts.value=contacts.data.items;
    currentDemographics.value=Object.fromEntries(demographicFields.map(field=>[field.key,String(client[field.column] || '').slice(0,field.type==='date'?10:10000)]));
    demographicsDraft.value=Object.fromEntries(demographicFields.map(field=>[field.key,parsed.data.parsed?.[field.key] || '']));
    selectedFields.value=Object.fromEntries(demographicFields.map(field=>[field.key,!!demographicsDraft.value[field.key]]));
    const contactParse=parseAdditionalContacts([split.contacts,contactsText.value].filter(Boolean).join('\n'));
    contactWarnings.value=contactParse.warnings;
    contactsDraft.value=contactParse.contacts.map(contact=>{
      const matches=contactMatches(contact,currentContacts.value);
      return {...contact,existingContactId:matches.length===1?String(matches[0].contact.id):matches.length>1?'__review__':'',saved:false};
    });
    demographicsReviewed.value=false;demographicsSaved.value=false;
  }catch(e){fail(e,scope);}finally{saving.value=false;}
}

async function saveDemographics(){
  if(!demographicsReviewed.value || busy.value)return;
  const scope=context();saving.value=true;error.value='';notice.value='';
  try{
    if(contactsDraft.value.some(contact=>contact.existingContactId==='__review__'))throw new Error('Choose the correct chart contact for each uncertain match.');
    if(contactsDraft.value.some(contact=>!String(contact.fullName || '').trim()))throw new Error('Enter a name for each additional contact, or remove its row.');
    const demographics=nonemptyFields(Object.fromEntries(demographicFields.filter(field=>selectedFields.value[field.key]).map(field=>[field.key,demographicsDraft.value[field.key]])));
    if(!Object.keys(demographics).length&&!contactsDraft.value.length)throw new Error('Select at least one demographic field or add a contact.');
    if(!demographicsSaved.value&&Object.keys(demographics).length){check(scope);await api.post(`/clients/${scope.clientId}/demographics/import`,{demographics},requestConfig());check(scope);demographicsSaved.value=true;}
    for(const contact of contactsDraft.value){
      if(contact.saved)continue;check(scope);
      const result=await api.post(`/clients/${scope.clientId}/contacts`,{...nonemptyFields({fullName:contact.fullName,phone:contact.phone,email:contact.email,relationshipType:contact.relationshipType}),existingContactId:contact.existingContactId?Number(contact.existingContactId):null,importContext:'ehr_transition',emailRemindersEnabled:false,smsRemindersEnabled:false,acknowledgeNotify:false,recipientPermissionToInvite:false},requestConfig());
      check(scope);contact.saved=true;
      if(result.data?.affiliation?.contact?.id)contact.existingContactId=String(result.data.affiliation.contact.id);
    }
    notice.value='Demographics and contacts saved on this client’s existing chart.';emit('saved',{clientId:scope.clientId,steps:{demographics:Object.keys(demographics).length?'saved':'unchanged',contacts:'saved'}});
  }catch(e){fail(e,scope);}finally{saving.value=false;}
}

function insurancePath(scope){return canAccessMedicalBilling(auth.user,scope.agencyId)?`/medical-billing/clients/${scope.clientId}/insurance`:`/clients/${scope.clientId}/account-support/insurance`;}
async function reviewInsurance(){
  const scope=context();saving.value=true;error.value='';notice.value='';
  try{
    const result=await api.get(insurancePath(scope),{params:{agencyId:scope.agencyId},...requestConfig()});check(scope);
    const existing=result.data.insurance || {},parsed=parseInsurancePaste(insuranceText.value);
    if(!Object.keys(parsed.primary).length&&!parsed.secondary)throw new Error('No labeled insurance fields were recognized. Use labels such as Insurance carrier, Member ID and Subscriber name.');
    insuranceDraft.value={...existing,patient:{...result.data.demographics,...existing.patient},primary:{...existing.primary,...nonemptyFields(parsed.primary)},secondary:{...existing.secondary,...nonemptyFields(parsed.secondary)}};
    hasSecondary.value=!!(existing.secondary||parsed.secondary);insuranceWarnings.value=parsed.warnings;insuranceReviewed.value=false;
  }catch(e){fail(e,scope);}finally{saving.value=false;}
}
async function saveInsurance(){
  if(!insuranceReviewed.value||busy.value)return;
  const scope=context();saving.value=true;error.value='';notice.value='';
  try{
    check(scope);const coverageSources={...insuranceDraft.value.coverageSources};if(!hasSecondary.value)delete coverageSources.secondary;
    await api.put(insurancePath(scope),{agencyId:scope.agencyId,primary:insuranceDraft.value.primary,secondary:hasSecondary.value?insuranceDraft.value.secondary:null,patient:insuranceDraft.value.patient,profileId:insuranceDraft.value.profileId || null,coverageSources,importContext:'ehr_transition'},requestConfig());check(scope);
    notice.value='Insurance saved for billing review. Source import does not verify coverage or submit claims.';insuranceReviewed.value=false;emit('saved',{clientId:scope.clientId,steps:{insurance:'saved'}});
  }catch(e){fail(e,scope);}finally{saving.value=false;}
}
function clinicalImported(steps){emit('saved',{clientId:Number(props.clientId),steps:Object.fromEntries(Object.entries(steps).filter(([key,status])=>['intake','plan'].includes(key)&&status==='imported')),clinicalReviewRequired:true});}
</script>

<style scoped>
.aw-policy{border:0;padding:0;margin:0;min-width:0}
.aw-import{display:grid;gap:22px}.aw-import h2,.aw-import h3{margin-top:0}.aw-step{border:1px solid var(--border,#d4dde7);border-radius:12px;padding:20px;display:grid;gap:14px;background:var(--bg-card,#fff)}.aw-step label{display:grid;gap:6px}.aw-step textarea,.aw-step input:not([type=checkbox]),.aw-step select{font:inherit;padding:9px;border:1px solid var(--border,#b7c4d0);border-radius:7px;max-width:100%;box-sizing:border-box}.aw-step button{justify-self:start;padding:10px 14px;border:1px solid #507c7a;border-radius:8px;background:#eef7f5;color:#153f3b;font:inherit;cursor:pointer}.aw-step button:disabled{opacity:.5;cursor:default}.aw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.aw-check{display:flex!important;align-items:start;gap:8px!important}.aw-contact{display:grid;gap:12px;padding:14px;border:1px solid var(--border,#d4dde7);border-radius:8px}.aw-table-wrap{overflow:auto}.aw-step table{width:100%;border-collapse:collapse;text-align:left}.aw-step td,.aw-step th{padding:8px;border-bottom:1px solid var(--border,#d4dde7)}.aw-muted{color:var(--text-secondary,#566572);font-size:.92rem}.aw-warning{color:#805618}.aw-error{color:#a62424}.aw-success{color:#176146}
</style>
