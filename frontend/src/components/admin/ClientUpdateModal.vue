<template>
  <div v-if="open" class="cu-backdrop" :class="{inline}" @click.self="close">
    <div class="cu-modal" :role="inline ? 'region' : 'dialog'" aria-label="Documents and assessments">
      <header>
        <div>
          <h3><img src="/auricwell/mark.svg" alt="AuricWell" /> Documents &amp; assessments</h3>
          <p>{{ agencyName ? agencyName + ' · ' : '' }}{{ activeName || 'Client portal' }}</p>
        </div>
        <div v-if="activeClientId && (enabled || clinicalMode)" class="heading-actions">
          <button type="button" class="btn btn-primary" :disabled="saving" @click="openPicker('items')"><Send /> Assign forms &amp; assessments</button>
          <button v-if="enabled" type="button" :disabled="saving" @click="openPicker('create')"><Layers /> Create package</button>
        </div><button v-if="!inline" type="button" class="btn btn-secondary btn-sm" @click="close">Close</button>
      </header>

      <p v-if="canUpdate && !enabled" role="status">{{ readinessLoading?'Checking update availability…':'Client updates are on hold while delivery and portal access are reviewed. No updates have been sent.' }}</p>
      <form v-if="enabled && !activeClientId" class="cu-shell" @submit.prevent="createShell">
        <p>Add the current client, then choose their update items. This does not start an intake.</p>
        <label>Organization
          <select v-model="shell.organizationId" required>
            <option disabled value="">Select</option>
            <option v-for="org in organizations" :key="org.id" :value="org.id">{{ org.name }}</option>
          </select>
        </label>
        <label>Client name <input v-model="shell.fullName" required maxlength="200" /></label>
        <label>Initials <input v-model="shell.initials" required maxlength="12" />
          <small v-if="selectedOrgType === 'school'">School clients use 6 letters.</small>
        </label>
        <label>Guardian first name <input v-model="shell.guardianFirstName" required maxlength="80" /></label>
        <label>Guardian last name <input v-model="shell.guardianLastName" required maxlength="80" /></label>
        <label>Guardian email <input v-model="shell.guardianEmail" type="email" required maxlength="255" /></label>
        <label>Provider (optional)
          <select v-model="shell.providerId">
            <option value="">None</option>
            <option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ providerName(provider) }}</option>
          </select>
        </label>
        <p v-if="error" class="cu-error">{{ error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="saving">{{ saving ? 'Adding…' : 'Add client and choose updates' }}</button>
      </form>

      <template v-if="activeClientId && (enabled || clinicalMode)">
        <p v-if="schoolClient" class="hint">{{ schoolName || "School" }} release expires · {{ schoolExpiry || 'No expiration recorded' }}</p>
        <p v-if="error || clinicalError" class="cu-error" role="alert">{{ error }} {{ clinicalError }} <button v-if="clinicalError" @click="reloadWorkspace">Retry</button></p>
        <p v-if="success" class="cu-ok" role="status">{{ success }}</p>
        <template v-if="editorId">
          <button type="button" @click="clinical.closeEditor">← Documents &amp; assessments</button>
          <SafetyPlansPanel :key="editorId" ref="editor" record-only :portal-signers-only="clinicalMode==='release'" :initial-record-id="editorId" :agency-id="Number(agencyId)" :client-id="activeClientId" />
        </template>
        <template v-else>
          <section class="cu-metrics" aria-label="Assignment summary">
            <button v-for="metric in metrics" :key="metric.label" type="button" :class="metric.tone" :aria-pressed="metric.filter===itemStatus" @click="itemStatus=metric.filter">
              <component :is="metric.icon" aria-hidden="true" /><span><b>{{ busyLoading ? '…' : clinicalError || historyError ? '—' : metric.value }}</b> {{ metric.label }}<small>{{ metric.detail }}</small></span>
            </button>
          </section>
          <div class="cu-layout">
            <aside class="assignment-panel">
              <h4>Assign to client portal</h4>
              <button v-if="enabled" class="choice" type="button" @click="openPicker('packages')"><Layers /> Use a package <ChevronRight /></button>
              <button class="choice" type="button" @click="openPicker('items')"><ListChecks /> Select individual items <ChevronRight /></button>
              <button v-if="refreshAvailable" class="choice" type="button" @click="useRefreshPackage"><Layers /> Bring client records up to date <ChevronRight /></button>
              <button v-if="clinicalMode && !recipientGuardianId" class="choice" type="button" :disabled="saving||preparing" @click="clinical.prepare({group:'release'})"><FileSignature /> Prepare a release <ChevronRight /></button>
              <template v-if="packages.length"><h5>Agency packages</h5>
                <button type="button" class="package-link" v-for="pkg in packages.slice(0,4)" :key="pkg.id" @click="usePackage(pkg)">{{ pkg.name }} <small>{{ packageSize(pkg) }} items</small></button>
              </template>
            </aside>
            <section class="assigned-list" aria-label="Assigned items">
              <div class="list-header"><h4>Assigned items <span>({{ allItems.length }})</span></h4><button type="button" :disabled="busyLoading || saving" @click="reloadWorkspace">Refresh</button></div>
              <div class="filters"><input v-model="search" type="search" placeholder="Search assigned items" aria-label="Search assigned items" />
                <select aria-label="Filter by type" v-model="itemType"><option value="">All types</option><option v-for="type in [...new Set(allItems.map(typeName))]" :key="type">{{ type }}</option></select>
                <select aria-label="Filter by status" v-model="itemStatus"><option value="">All statuses</option><option v-for="status in statuses" :value="status" :key="status">{{ statusName(status) }}</option></select>
              </div>
              <p v-if="clinical.records.value.length >= 100" class="hint">Clinical form counts include the 100 most recently updated records.</p>
              <p v-if="busyLoading" role="status">Loading assignments…</p>
              <div v-else class="table-scroll"><table><thead><tr><th>Item</th><th>Type</th><th>Assigned to</th><th>Status</th><th>Progress / result</th><th>Due</th><th></th></tr></thead><tbody>
                <tr v-for="item in filteredItems" :key="item.item_type+':'+item.id">
                  <td><button v-if="item.recordId" class="text-action" @click="editorId=item.recordId">{{ item.title }}</button><strong v-else>{{ item.title }}</strong></td>
                  <td>{{ typeName(item) }}</td><td>{{ item.recipient || [item.first_name,item.last_name].filter(Boolean).join(' ') || '—' }}</td>
                  <td><span class="status-tag" :class="item.status">{{ statusName(item.status) }}</span></td><td>{{ progressLabel(item) }}
                    <div v-if="item.requestTotal > 1" class="request-progress">
                      <progress :value="item.requestCompleted" :max="item.requestTotal" aria-label="Request completion"></progress>
                      <small>{{ item.requestCompleted }} of {{ item.requestTotal }} items complete</small>
                    </div>
                  </td>
                  <td>{{ item.expires_at ? 'Expires ' + dateLabel(item.expires_at) : '—' }}</td><td><button v-if="item.canRemind ?? ['pending','in_progress'].includes(item.status)" type="button" :disabled="saving" @click="remind(item)">Resend reminder</button></td>
                </tr>
                <tr v-if="!filteredItems.length"><td colspan="7" class="empty">{{ error || clinicalError ? 'Assignment history may be incomplete.' : allItems.length ? 'No items match these filters.' : 'No portal assignments on file.' }}</td></tr>
              </tbody></table></div>
            </section>
          </div>
          <section v-if="picker" ref="pickerPanel" class="picker-panel" tabindex="-1">
            <header><h4>{{ picker==='packages'?'Agency packages':picker==='create'?'Create an agency package':'Select items to assign' }}</h4><button type="button" :disabled="saving" @click="picker=''">Close selection</button></header>
            <fieldset :disabled="saving || attemptedDelivery">
              <template v-if="picker==='packages'"><label>Filter <select v-model="packageFilter"><option value="">All packages</option><option value="school">School packages</option></select></label>
                <button class="package-link" v-for="pkg in visiblePackages" type="button" :key="pkg.id" @click="usePackage(pkg)">{{ pkg.name }} <small>{{ packageSize(pkg) }} items</small></button>
                <p v-if="!visiblePackages.length">No matching packages in this agency.</p></template>
              <template v-else>
                <label v-if="picker==='create'">Package name <input v-model.trim="packageName" maxlength="100" /></label>
                <label v-if="picker==='create'"><input v-model="schoolOnly" type="checkbox" /> School package</label>
                <div v-if="clinicalMode==='full'" class="context-options">
                  <label v-for="field in contextOptions" :key="field.key">{{ field.label }}<select v-model="context[field.key]"><option v-for="[value,label] in field.options" :key="value" :value="value">{{ label }}</option></select></label>
                </div>
                <p v-if="picker !== 'create'" class="hint">Choose individual items for the selected client. The family completes them in their portal.</p>
                <input type="search" v-model.trim="catalogSearch" placeholder="Find a form or assessment" aria-label="Search available items" />
                <div class="cu-grid">
                  <section v-for="group in selectionGroups" :key="group.key">
                    <h5>{{ group.label }}</h5><div v-for="item in group.items" :key="item.id" class="pick-row">
                      <label><input v-if="item.assignable !== false && (clinicalMode!=='release' || group.key!=='records')" type="checkbox" :checked="isSelected(item)" @change="toggleItem(item,$event.target.checked)" /> {{ item.title }}</label>
                      <small v-if="item.assignable === false" class="status-tag">{{ item.availabilityLabel || 'Coming soon' }}</small>
                      <button v-else type="button" class="text-action" @click="previewItems=[item]">Preview</button>
                      <button v-if="!recipientGuardianId && ['foundation','records'].includes(group.key)" type="button" class="text-action" @click="clinical.prepare(item)">{{ group.key==='records'?'Open':'Prepare' }}</button>
                    </div>
                  </section>
                  <p v-if="!selectionGroups.length && !busyLoading">No matching items.</p>
                </div>
                <button v-if="picker==='create'" type="button" :disabled="!packageName || !anySelected" @click="savePackage">Save selected items as package</button>
              </template>
            </fieldset>
          </section>
          <section v-if="selectedItems.length && picker!=='create'" class="review-selection">
            <h4>Review assignment <span>({{ selectedItems.length }})</span></h4>
            <ul><li v-for="s in selectedItems" :key="s.group+':'+s.id">{{ s.title }}</li></ul>
            <section v-if="releaseSelected" class="release-recipient">
              <label>Release recipient
                <select v-model="releaseContactId" :disabled="saving || attemptedDelivery">
                  <option :value="null">Let the signer enter the contact</option>
                  <option v-for="entry in releaseContacts" :key="entry.id" :value="entry.id">{{ entry.contact.fullName }}</option>
                </select>
              </label>
              <button v-if="contactError" type="button" @click="loadReleaseContacts">Retry loading contacts</button>
              <p v-if="contactError" role="alert">{{ contactError }}</p>
              <small>Contact details entered by the signer are filed on the client’s profile after staff review.</small>
              <details v-if="!attemptedDelivery"><summary>Add a contact to the client’s profile</summary>
                <form @submit.prevent="addReleaseContact">
                  <label>Name <input v-model.trim="newContact.fullName" required maxlength="180" /></label>
                  <label>Email <input v-model.trim="newContact.email" type="email" /></label>
                  <label>Phone <input v-model.trim="newContact.phone" type="tel" /></label>
                  <button type="submit" :disabled="savingContact">Save and select contact</button>
                </form>
              </details>
            </section>
            <label>Portal recipient <select v-model="chosenId" :disabled="saving || attemptedDelivery"><option value="">Select a linked account</option><option v-for="r in eligible" :value="r.id" :key="r.id">{{ r.name }}{{ r.email?' · '+r.email:'' }}</option></select></label>
            <p v-if="!eligible.length" class="hint">No linked account has access to this selection. Review portal access or the responsible payer in Billing.</p>
            <template v-if="needsAuthority">
              <label v-if="clinicalSelection.length">Recipient action <select v-model="clinicalAction" :disabled="saving"><option value="complete">Complete forms and sign</option><option value="sign">Review and sign</option></select></label>
              <label v-if="chosen?.kind==='guardian'"><input type="checkbox" v-model="authority" :disabled="saving" /> I verified this guardian is authorized to sign the selected documents.</label>
            </template>
            <p v-if="clinicalSelection.length>30" role="alert">Select up to 30 enrollment forms and saved documents at once.</p>
            <p v-if="chosen" class="hint">{{ includeUpdateEmail ? 'A portal update email is requested, subject to the recipient’s contact choices. The forms are completed in the portal.' : 'This selection is assigned in the portal.' }}</p>
            <footer><button v-if="chosen && includeUpdateEmail && !paymentOnly" type="button" @click="previewItems=[{group:'notice',id:'notice',title:'Email notice'}]">Preview email notice</button>
              <button type="button" @click="previewItems=selectedItems.slice()">Preview selection</button>
              <button type="button" class="btn btn-primary" :disabled="!canSend" @click="send">{{ saving ? 'Assigning…' : includeUpdateEmail ? 'Send portal update' : 'Assign in portal' }}</button></footer>
          </section>
        </template>
        <PortalSelectionPreview v-if="previewItems.length" :items="previewItems" :client-id="activeClientId" :agency-id="agencyId" :client-name="activeName" :recipient="authorizationOnlyPackage && chosen ? {...chosen,cardAllowed:false} : chosen" :action="clinicalAction" :context="context" :release-contact="chosenReleaseContact" :branding="clinicalCatalog?.branding || {name:agencyName}" @reviewed="rememberSmartPreview" @close="previewItems=[]" />
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import {Send,Layers,ListChecks,ChevronRight,FileSignature,Clock,PenLine,CircleCheck,ChartNoAxesColumnIncreasing} from '@lucide/vue';
import {usePortalDocumentRecords} from '../enrollment/usePortalDocumentRecords';
import PortalSelectionPreview from '../enrollment/PortalSelectionPreview.vue';
import SafetyPlansPanel from '../safetyPlans/SafetyPlansPanel.vue';

const props = defineProps({
  open: Boolean, inline:Boolean, agencyName:String,
  clinicalMode:{type:String,default:''}, canUpdate:{type:Boolean,default:true},
  clientId: { type: [Number, String], default: null },
  agencyId: { type: [Number, String], default: null },
  clientName: { type: String, default: '' },
  guardianEmail: { type: String, default: '' },
  guardianName: { type: String, default: '' },
  recipientGuardianId: Number
});
const emit = defineEmits(['close', 'sent', 'created']);

const catalog = reactive({ documents: [], assessments: [], portalSteps: [] });
const previewedSmart = new Map();
function rememberSmartPreview({key,locale,contentHash}) { previewedSmart.set(key+':'+locale, contentHash); }
const smartKeys = ref([]), releaseSelected = ref(false), authorizationOnlyPackage = ref(false);
const releaseContactId = ref(null), releaseContacts = ref([]), contactError = ref(''), savingContact = ref(false);
const newContact = reactive({fullName:'',email:'',phone:''});
const selected = reactive({ documents: [], assessments: [], portalSteps: [] });
const organizations = ref([]);
const providers = ref([]);
const shell = reactive({ organizationId: '', fullName: '', initials: '', guardianFirstName: '', guardianLastName: '', guardianEmail: '', providerId: '' });
const createdClientId = ref(null);
const createdName = ref('');
const guardianEmail = ref('');
const guardianFirstName = ref('');
const guardianLastName = ref('');
const error = ref('');
const success = ref('');
const saving = ref(false);
const enabled=ref(false),readinessLoading=ref(false),requestId=ref(null),attemptedDelivery=ref(false);
let generation=0;

const activeClientId = computed(() => Number(props.clientId || createdClientId.value || 0) || null);
const activeName = computed(() => props.clientName || createdName.value);

const selectedOrgType = computed(() => String(organizations.value.find((org) => Number(org.id) === Number(shell.organizationId))?.organization_type || '').toLowerCase());

const clinical=usePortalDocumentRecords(props,activeClientId,activeName);
const {context,catalog:clinicalCatalog,loading:clinicalLoading,error:clinicalError,editorId,editor,preparing,selected:clinicalSelection}=clinical;
const clinicalAction=ref('complete'), authority=ref(false), catalogLoading=ref(false), historyError=ref(false);
const picker=ref(''), pickerPanel=ref(null), previewItems=ref([]), catalogSearch=ref('');
const busyLoading=computed(()=>readinessLoading.value || catalogLoading.value || clinicalLoading.value);
const anyUpdates=computed(()=>selected.documents.length+selected.assessments.length+selected.portalSteps.length>0);
const needsAuthority = computed(() => clinicalSelection.value.length > 0 || smartKeys.value.length > 0 || releaseSelected.value);
const anySelected = computed(() => anyUpdates.value || needsAuthority.value);
const includeUpdateEmail = computed(() => anyUpdates.value);
const chosenReleaseContact = computed(() => releaseContacts.value.find(entry => entry.id === releaseContactId.value)?.contact);
const typedForms = computed(() => [
  ...(enabled.value && props.clinicalMode === 'full' ? [{group:'smart',id:'smart-disclosure',title:'Current provider disclosure'}] : []),
  ...(enabled.value && schoolClient.value && props.clinicalMode === 'full' ? [{group:'smart',id:'smart-school-roi',title:'Smart School ROI · ' + (schoolName.value || 'Client’s school')}] : []),
  ...(props.clinicalMode ? [{group:'release',id:'release-of-information',title:'Release of information'}] : [])
]);
const updateChoices=computed(()=>[
  ...catalog.documents.map(d=>({group:'documents',id:d.id,title:d.name})),
  ...catalog.assessments.map(a=>({group:'assessments',id:a.family,title:a.title,assignable:a.assignable,availabilityLabel:a.availabilityLabel})),
  ...catalog.portalSteps.map(s=>({group:'portalSteps',id:s.key,title:s.title,detail:s.detail}))
]);
const selectedItems=computed(()=>[...typedForms.value.filter(isSelected),...updateChoices.value.filter(isSelected),...clinicalSelection.value]);
const groupLabels={smart:'School & provider forms',release:'Releases',foundation:'Current agreements',portalSteps:'Portal tasks',documents:'Other agency documents',records:'Saved documents',assessments:'Assessments'};
const selectionGroups=computed(()=>{
  const choices=[...(picker.value==='create'?[]:typedForms.value),...updateChoices.value,...clinical.foundations.value,...clinical.saved.value];
  return Object.entries(groupLabels).filter(([key])=>key!=='records'||picker.value!=='create').map(([key,label])=>({
    key,label,items:choices.filter(d=>d.group===key && d.title.toLowerCase().includes(catalogSearch.value.toLowerCase()))
  })).filter(group=>group.items.length);
});
function idsFor(group){
  if(group==='records')return clinical.recordIds.value;
  if(group==='foundation')return clinical.foundationKeys.value;
  return selected[group];
}
function isSelected(item){
  if(item.group==='smart')return smartKeys.value.includes(item.id);
  if(item.group==='release')return releaseSelected.value;
  return idsFor(item.group).includes(item.id);
}
function toggleItem(item,on){
  if(item.assignable===false)return;
  authority.value=false;
  if(item.group==='portalSteps' && item.id==='payment')authorizationOnlyPackage.value=false;
  if(item.group==='release'){
    releaseSelected.value=on;
    if(on)void loadReleaseContacts();
    return;
  }
  const ids=item.group==='smart'?smartKeys.value:idsFor(item.group),index=ids.indexOf(item.id);
  if(on && index<0)ids.push(item.id);
  if(!on && index>=0)ids.splice(index,1);
}
const contextOptions=[
  {key:'channel',label:'Setting',options:[['office','Office / virtual'],['school','School']]},
  {key:'audience',label:'Completed by',options:[['guardian','Parent / guardian'],['self','Client']]},
  {key:'service',label:'Service',options:[['counseling','Counseling'],['tutoring','Tutoring']]},
  {key:'locale',label:'Form language',options:[['en','English'],['es','Spanish']]}
];
async function openPicker(value){
  if(saving.value)return;
  if(attemptedDelivery.value){
    if(error.value && !window.confirm('Delivery was not confirmed. Check assignment history before starting another selection. Start a new selection?'))return;
    clearSelection();attemptedDelivery.value=false;requestId.value=null;error.value='';success.value='';
  }
  if(value==='create')clinical.recordIds.value=[];
  picker.value=value;catalogSearch.value='';await nextTick();pickerPanel.value?.focus();
}
function clearSelection(){
  for(const group of Object.keys(selected))selected[group]=[];
  authorizationOnlyPackage.value=false;
  clinical.foundationKeys.value=[];clinical.recordIds.value=[];smartKeys.value=[];releaseSelected.value=false;releaseContactId.value=null;authority.value=false;
}
async function reloadWorkspace(){await Promise.all([enabled.value?loadCatalog().catch(()=>{error.value='The assignment list could not be refreshed.';}):null,clinical.load()]);}
function prepareToLeave(){return !saving.value && clinical.canLeave();}
defineExpose({prepareToLeave});
const schoolClient=ref(false),schoolName=ref(''),schoolExpiry=ref('');
const packages=ref([]),items=ref([]),recipients=ref([]),chosenId=ref(''),packageName=ref(''),schoolOnly=ref(false),packageFilter=ref(''),search=ref('');
const itemType=ref(''),itemStatus=ref('');
const allItems = computed(() => {
  const history = [...items.value, ...clinical.assignments.value];
  return props.recipientGuardianId
    ? history.filter(item => Number(item.recipientUserId) === props.recipientGuardianId)
    : history;
});
const typeName=item=>item.typeLabel || ({document:'Document',assessment:'Assessment',portal_step:'Portal step',billing:'Billing'}[item.item_type] || 'Portal step');
const statusName=value=>({complete:'Completed',in_progress:'In progress',result:'With results'}[value] || String(value).replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()));
const dateLabel=value=>new Date(value).toLocaleDateString();
function progressLabel(item){
  if(Number(item.has_result) && item.overall_score!=null && item.overall_score!=='null')return 'Score: '+item.overall_score;
  if(item.signedAt || item.completed_at)return (item.progress==='Signed'?'Signed ':'Completed ')+dateLabel(item.completed_at || item.signedAt)+(Number(item.has_result)?' · Result available':'');
  if(Number(item.has_result))return 'Result available';
  return item.progress || ({in_progress:'Started',pending:'Awaiting action',complete:'Completed'}[item.status] || '—');
}
const statuses=computed(()=>[...new Set(['pending','in_progress','complete','result',...allItems.value.map(i=>i.status)])]);
const metrics=computed(()=>[
  {label:'Assigned',filter:'',tone:'assigned',detail:'Total assignments',icon:Send},
  {label:'Pending',filter:'pending',tone:'pending',detail:'Awaiting recipient',icon:Clock},
  {label:'In progress',filter:'in_progress',tone:'started',detail:'Started',icon:PenLine},
  {label:'Completed',filter:'complete',tone:'complete',detail:'Finished',icon:CircleCheck},
  {label:'With results',filter:'result',tone:'result',detail:'Assessment results',icon:ChartNoAxesColumnIncreasing}
].map(m=>({...m,value:allItems.value.filter(i=>matchesStatus(i,m.filter)).length})));
function matchesStatus(i,status){return !status || (status==='result'?!!Number(i.has_result):i.status===status);}
const filteredItems=computed(()=>allItems.value.filter(i=>(!itemType.value || typeName(i)===itemType.value) && matchesStatus(i,itemStatus.value) && i.title.toLowerCase().includes(search.value.toLowerCase())));
const paymentSelected=computed(()=>selected.portalSteps.some(k=>['payment','authorization'].includes(k)));
const paymentOnly=computed(()=>paymentSelected.value && !selected.documents.length && !selected.assessments.length && selected.portalSteps.every(k=>['payment','authorization'].includes(k)));
const eligibleRecipients=computed(()=>{
  const updateRecipients=recipients.value.filter(r=>(paymentOnly.value || r.forms) && (!paymentSelected.value || r.billing));
  const schoolRelease=smartKeys.value.includes('smart-school-roi');
  const allowed=schoolRelease ? updateRecipients.filter(r=>r.kind!=='client') : updateRecipients;
  if(!needsAuthority.value)return allowed;
  const clinicalRecipients=(clinicalCatalog.value?.recipients || []).filter(r=>!schoolRelease || r.kind==='guardian');
  if(!anyUpdates.value && !smartKeys.value.length)return clinicalRecipients;
  return clinicalRecipients.flatMap(r=>{
    const update=allowed.find(u=>Number(u.id)===Number(r.id));
    return update?[{...update,kind:r.kind}]:[];
  });
});
const eligible = computed(() => props.recipientGuardianId
  ? eligibleRecipients.value.filter(recipient => Number(recipient.id) === props.recipientGuardianId && recipient.kind !== 'client')
  : eligibleRecipients.value);
const chosen=computed(()=>eligible.value.find(r=>Number(r.id)===Number(chosenId.value)));
watch(eligible,rows=>{if(!rows.some(r=>Number(r.id)===Number(chosenId.value)))chosenId.value=!saving.value && rows.length===1?rows[0].id:'';},{flush:'sync'});
watch(chosenId,()=>{authority.value=false;},{flush:'sync'});
const canSend=computed(()=>anySelected.value && chosen.value && !saving.value && !attemptedDelivery.value && clinicalSelection.value.length+Number(releaseSelected.value)<=30 && (!needsAuthority.value || chosen.value.kind!=='guardian' || authority.value));
const visiblePackages=computed(()=>packages.value.filter(p=>!packageFilter.value || Number(p.school_only)));
const packageSize=p=>['documents','assessments','portalSteps','foundationKeys'].reduce((n,k)=>n+(p.selection_json?.[k]?.length || 0),0);
async function usePackage(pkg){
  if(saving.value || attemptedDelivery.value)return;
  const stored=pkg.selection_json;
  const paymentSteps=stored.portalSteps || [];
  const useCurrentPayment=catalog.portalSteps.some(step=>step.key==='payment');
  const selection=useCurrentPayment
    ? {...stored,portalSteps:[...new Set(paymentSteps.map(key=>key==='authorization'?'payment':key))]}
    : stored;
  authority.value=false;
  if(selection.foundationKeys?.length && props.clinicalMode!=='full'){
    error.value='This package includes enrollment forms. Open it in the client portal workspace with clinical access.';return;
  }
  const current=generation;
  if(selection.foundationKeys?.length){
    Object.assign(context,selection.context);
    await nextTick();await clinical.whenLoaded();
    if(current!==generation)return;
    if(selection.foundationKeys.some(key=>!clinical.foundations.value.some(d=>d.id===key))){
      error.value='An enrollment form in this package is unavailable for this client.';return;
    }
  }
  const allowed={documents:catalog.documents.map(r=>r.id),assessments:catalog.assessments.filter(r=>r.assignable!==false).map(r=>r.family),portalSteps:catalog.portalSteps.map(r=>r.key)};
  if(Object.keys(allowed).some(k=>(selection[k]||[]).some(v=>!allowed[k].includes(v)))){
    error.value='This package contains an unavailable item. Choose current items individually.';
    return;
  }
  picker.value='items';catalogSearch.value='';clinical.recordIds.value=[];smartKeys.value=[];releaseSelected.value=false;clinical.foundationKeys.value=[...(selection.foundationKeys||[])];
  error.value='';
  authorizationOnlyPackage.value=useCurrentPayment && paymentSteps.includes('authorization') && !paymentSteps.includes('payment');
  for(const key of Object.keys(allowed))selected[key]=[...(selection[key]||[])];
}
const refreshAvailable = computed(() => enabled.value && props.clinicalMode==='full' && clinicalCatalog.value?.refreshFoundationKeys?.length);
async function useRefreshPackage(){
  if(saving.value || attemptedDelivery.value)return;
  clearSelection();
  clinicalAction.value='complete';
  clinical.foundationKeys.value=[...clinicalCatalog.value.refreshFoundationKeys];
  smartKeys.value=['smart-disclosure'];
  selected.portalSteps=['information'];
  await openPicker('items');
}
async function loadReleaseContacts(){
  const current=generation;
  contactError.value='';
  try {
    const {data}=await api.get(`/clients/${activeClientId.value}/contacts`);
    if(current===generation)releaseContacts.value=(data.items || []).filter(entry=>entry.isActive && entry.contact?.isActive);
  } catch(e) {
    if(current===generation)contactError.value=e.response?.data?.error?.message || 'Saved contacts could not be loaded.';
  }
}
async function addReleaseContact(){
  const current=generation;
  if(savingContact.value || !newContact.fullName)return;
  savingContact.value=true;
  contactError.value='';
  try {
    const {data}=await api.post(`/clients/${activeClientId.value}/contacts`,{...newContact,importContext:'release_recipient'});
    if(current!==generation)return;
    Object.assign(newContact,{fullName:'',email:'',phone:''});
    await loadReleaseContacts();
    if(current===generation)releaseContactId.value=Number(data.affiliation?.id) || null;
  } catch(e) {
    if(current===generation)contactError.value=e.response?.data?.error?.message || 'The contact could not be saved.';
  } finally { savingContact.value=false; }
}
async function savePackage(){
  const current=generation;
  saving.value=true;error.value='';
  try{
    await api.post(`/clients/${activeClientId.value}/updates/packages`,{...selected,name:packageName.value,schoolOnly:schoolOnly.value,foundationKeys:clinical.foundationKeys.value,context:{...context}});
    if(current===generation){packageName.value='';success.value='Agency package saved.';picker.value='packages';await loadCatalog();}
  }catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Could not save package.';}
  finally{if(current===generation)saving.value=false;}
}
async function remind(item){
  const current=generation;
  saving.value=true;error.value='';
  try{if(item.recordId){
      await api.post('/clinical-forms/'+item.recordId+'/signers/'+item.id+'/remind');
      if(current===generation)success.value='Reminder queued.';return;
    }
    const {data}=await (item.item_type==='billing'?api.post(`/family-billing/staff/tasks/${item.id}/remind`,{clientId:activeClientId.value,agencyId:Number(props.agencyId)}):api.post(`/clients/${activeClientId.value}/updates/items/${item.id}/remind`));if(current===generation)success.value='Reminder: '+data.status;}
  catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Could not confirm the reminder.';}
  finally{if(current===generation)saving.value=false;}
}
function providerName(provider) {
  return provider.name || [provider.first_name, provider.last_name].filter(Boolean).join(' ') || `Provider ${provider.id}`;
}
function splitName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}
function close() { if (prepareToLeave()) emit('close'); }

async function loadCatalog() {
  if (!activeClientId.value) return;
  const current=generation;
  catalogLoading.value=true;
  let response;
  try{response=await api.get(`/clients/${activeClientId.value}/updates/catalog`);}
  catch(error){if(current===generation)historyError.value=true;throw error;}
  finally{if(current===generation)catalogLoading.value=false;}
  if(current!==generation)return;
  historyError.value=false;
  const firstSchoolLoad = !schoolClient.value && response.data?.schoolClient===true;
  schoolClient.value=response.data?.schoolClient===true;schoolName.value=response.data?.schoolName || '';schoolExpiry.value=String(response.data?.schoolRoiExpiresAt||'').slice(0,10);
  if (firstSchoolLoad) context.channel='school';
  recipients.value=response.data?.recipients||[];packages.value=response.data?.packages||[];items.value=response.data?.items||[];
  catalog.documents = response.data?.documents || [];
  catalog.assessments = response.data?.assessments || [];
  catalog.portalSteps = (response.data?.portalSteps || []).filter(s=>response.data.canAssignPayments!==false || !['payment','authorization'].includes(s.key));
}

async function loadShellOptions() {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId) return;
  const current=generation;
  try {
    const response = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
    if(current!==generation)return;
    organizations.value = (Array.isArray(response.data) ? response.data : []).filter((org) => String(org.organization_type || '').toLowerCase() !== 'agency');
  } catch {
    if(current!==generation)return;
    organizations.value = [];
  }
  if (!organizations.value.length) {
    try {
      const response = await api.get(`/agencies/${agencyId}/schools`);
      if(current!==generation)return;
      organizations.value = (response.data || []).map((row) => ({ id: row.school_organization_id, name: row.school_name, organization_type: row.school_organization_type || 'school' }));
    } catch {
      if(current!==generation)return;
      organizations.value = [];
    }
  }
  try {
    const response = await api.get('/provider-scheduling/providers', { params: { agencyId } });
    if(current!==generation)return;
    providers.value = response.data || [];
  } catch {
    if(current!==generation)return;
    providers.value = [];
  }
}

function clientTypeFor(orgType) {
  if (orgType === 'school') return 'school';
  if (orgType === 'learning') return 'learning';
  if (orgType === 'life_coach' || orgType === 'consultant') return 'basic_nonclinical';
  return 'clinical';
}

async function createShell() {
  if (saving.value||!enabled.value) return;
  error.value = '';
  if (selectedOrgType.value === 'school' && !/^[A-Za-z]{6}$/.test(shell.initials.trim())) {
    error.value = 'School clients use exactly 6 initials.';
    return;
  }
  saving.value = true;
  const current=generation;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await api.post('/clients', {
      organization_id: Number(shell.organizationId),
      agency_id: Number(props.agencyId),
      full_name: shell.fullName.trim(),
      initials: shell.initials.trim(),
      submission_date: today,
      source: 'ADMIN_CREATED',
      client_type: clientTypeFor(selectedOrgType.value),
      provider_id: shell.providerId ? Number(shell.providerId) : null,
      guardian_portal_enabled: 0,
      serviceType: selectedOrgType.value === 'learning' ? 'tutoring' : 'counseling'
    });
    const client = response.data || {};
    if(current!==generation)return;
    if (!client.id) throw new Error('The client could not be saved');
    createdClientId.value = client.id;
    createdName.value = client.full_name || shell.fullName.trim();
    guardianFirstName.value = shell.guardianFirstName.trim();
    guardianLastName.value = shell.guardianLastName.trim();
    guardianEmail.value = shell.guardianEmail.trim();
    emit('created', client);
    await loadCatalog();
  } catch (err) {
    if(current===generation)error.value = err.response?.data?.error?.message || err.message || 'The client could not be added.';
  } finally {
    saving.value = false;
  }
}

let lastClinicalRequest=null;
async function send() {
  if (!canSend.value) return;
  error.value='';success.value='';
  const recipient=chosen.value, includeUpdates=anyUpdates.value;
  const current=generation,clientId=activeClientId.value,agencyId=Number(props.agencyId);
  guardianEmail.value=recipient.email || '';
  saving.value=true;
  let assignedClinical=false;
  try {
    const requestContext={...context};
    const signerAuthority=authority.value;
    const reviewedSmartForms = [];
    for(const key of smartKeys.value){
      const {data}=await api.get(`/clients/${clientId}/updates/preview/smart/${key}`,{params:{locale:requestContext.locale}});
      const previewHash=previewedSmart.get(key+':'+requestContext.locale);
      if(previewHash && previewHash!==data.context?.contentHash){
        if(current===generation)error.value='The provider disclosure changed. Open its preview again before assigning.';
        return;
      }
      reviewedSmartForms.push({key,contentHash:data.context?.contentHash});
    }
    if(current!==generation)return;
    if(clinicalSelection.value.length || releaseSelected.value){
      const documents=clinicalSelection.value.map(d=>d.group==='records'?{recordId:d.id,version:d.version}:{foundationKey:d.id});
      if(releaseSelected.value)documents.push({release:true,contactId:releaseContactId.value});
      const payload={agencyId,recipient:{id:recipient.id,kind:recipient.kind},authorityConfirmed:signerAuthority,action:clinicalAction.value,context:requestContext,documents};
      const fingerprint=JSON.stringify([clientId,payload]);
      if(lastClinicalRequest?.fingerprint!==fingerprint)lastClinicalRequest={fingerprint,requestKey:crypto.randomUUID(),planDate:new Date().toLocaleDateString('en-CA')};
      const {data}=await api.post('/enrollment-portal/clients/'+clientId+'/assignments',{...payload,requestKey:lastClinicalRequest.requestKey,planDate:lastClinicalRequest.planDate});
      if(current!==generation)return;
      assignedClinical=true;lastClinicalRequest=null;
      success.value=data.assignedCount ? data.assignedCount+' document(s) assigned. A portal notification is queued.' : 'Selected documents are already assigned.';
      clinical.recordIds.value=[];
      clinical.foundationKeys.value=[];
      releaseSelected.value=false;
      await clinical.load();
      if(current!==generation)return;
    }
    for(const reviewed of reviewedSmartForms){
      await api.post(`/clients/${clientId}/updates/smart-form`,{...reviewed,locale:requestContext.locale,recipient:{id:recipient.id,kind:recipient.kind},authorityConfirmed:signerAuthority});
      if(current!==generation)return;
      smartKeys.value=smartKeys.value.filter(key=>key!==reviewed.key);
      success.value='Current forms are assigned in the portal.';
    }
    if(!includeUpdates){
      if(reviewedSmartForms.length)await loadCatalog();
      return;
    }
    if(paymentSelected.value){
      attemptedDelivery.value=true;
      const {data}=await api.post('/family-billing/staff/tasks',{agencyId,guardianUserId:recipient.id,clientIds:[clientId],fromPortal:true,requireCard:selected.portalSteps.includes('payment') && recipient.cardAllowed!==false && !authorizationOnlyPackage.value});
      if(current!==generation)return;
      if(paymentOnly.value){
        const notice=await api.post(`/family-billing/staff/notices/${data.noticeId}/send`,{agencyId});
        if(current===generation)success.value=notice.data?.blocked||notice.data?.skipped?'Payment authorization assigned. Notification held.':notice.data?.queued||notice.data?.pendingApproval?'Payment authorization assigned. Notification queued.':'Payment authorization assigned. Check Billing for delivery status.';
        return;
      }
      success.value='Payment authorization assigned in Billing.';
    }
    const created=await api.post(`/clients/${clientId}/updates`, {
      agencyId: Number(props.agencyId),
      send: false,
      documents: selected.documents,
      assessments: selected.assessments,
      portalSteps: selected.portalSteps.filter(key=>!['payment','authorization'].includes(key)),
      guardianUserId: recipient.id,
      guardianEmail: recipient.email,
      guardianFirstName: guardianFirstName.value.trim(),
      guardianLastName: guardianLastName.value.trim()
    });
    if(current!==generation)return;
    requestId.value=created.data?.request?.id;
    if(!requestId.value)throw new Error('The update request could not be saved.');
    attemptedDelivery.value=true;
    const {data}=await api.post(`/clients/${clientId}/updates/${requestId.value}/send`,{guardianEmail:recipient.email});
    if(current!==generation)return;
    success.value=({sent:'Portal update sent.',queued:'The update email is queued for approval. No delivery has been confirmed.',skipped:'The update email was not sent. Review notification preferences and email history.',redirected:'The update email went to the configured test inbox.',unconfirmed:'Delivery could not be confirmed. Check email history before creating another update.'})[data.deliveryStatus]||'Delivery could not be confirmed. Check email history.';
    if (Array.isArray(data.deliveries)) success.value = data.deliveries.map(row => `${row.name || row.email || 'Guardian'}: ${row.deliveryStatus.replaceAll('_', ' ')}`).join(' · ');
    if(data.deliveryStatus==='sent')emit('sent');
  } catch (err) {
    if(assignedClinical && current===generation)success.value='Enrollment documents were assigned. Review the remaining items below.';
    if(current===generation && paymentOnly.value && err.response?.status>=400 && err.response?.status<500)attemptedDelivery.value=false;
    if(current===generation)error.value = err.response?.data?.error?.message || (attemptedDelivery.value?'Delivery could not be confirmed. Check email history before creating another update.':'The update could not be saved.');
  } finally {
    if(current===generation){
      if(includeUpdates && props.inline && attemptedDelivery.value){
        try{await loadCatalog();}catch{if(current===generation)error.value+=' Refresh to see the latest assignments.';}
      }
      if(current===generation)saving.value=false;
    }
  }
}

watch(() => [props.open,props.clientId,props.agencyId,props.canUpdate], async ([open]) => {
  const current=++generation;
  previewedSmart.clear();
  historyError.value=false;lastClinicalRequest=null;previewItems.value=[];authority.value=false;picker.value=props.inline?'':'items';catalogSearch.value='';catalogLoading.value=false;
  if (!open) return;
  error.value = '';
  success.value = '';
  createdClientId.value = null;
  createdName.value = '';
  authorizationOnlyPackage.value=false;
  selected.documents = [];
  selected.assessments = [];
  selected.portalSteps = [];
  itemType.value='';itemStatus.value='';schoolClient.value=false;schoolName.value='';schoolExpiry.value='';
  smartKeys.value=[];releaseSelected.value=false;releaseContactId.value=null;releaseContacts.value=[];contactError.value='';packages.value=[];items.value=[];recipients.value=[];chosenId.value='';packageName.value='';schoolOnly.value=false;packageFilter.value='';search.value='';saving.value=false;
  context.channel='office';
  catalog.documents=[];catalog.assessments=[];catalog.portalSteps=[];organizations.value=[];providers.value=[];
  enabled.value=false;requestId.value=null;attemptedDelivery.value=false;readinessLoading.value=true;
  if(!props.canUpdate){readinessLoading.value=false;return;}
  try{const {data}=await api.get('/client-updates/status');if(current!==generation)return;enabled.value=data.enabled===true;}catch{if(current===generation)error.value='Update availability could not be checked.';}finally{if(current===generation)readinessLoading.value=false;}
  if(current!==generation)return;
  if(!enabled.value)return;
  const names = splitName(props.guardianName);
  guardianFirstName.value = names.first;
  guardianLastName.value = names.last;
  guardianEmail.value = props.guardianEmail || '';
  shell.guardianFirstName = names.first;
  shell.guardianLastName = names.last;
  shell.guardianEmail = props.guardianEmail || '';
  if (activeClientId.value) {
    try { await loadCatalog(); } catch (err) { if(current===generation)error.value = err.response?.data?.error?.message || 'The update list could not be loaded.'; }
  } else {
    await loadShellOptions();
  }
}, { immediate: true });
onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.cu-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:#142c4766}
.cu-modal{box-sizing:border-box;width:min(1240px,100%);max-height:92dvh;overflow:auto;padding:clamp(16px,2vw,28px);background:#fff;color:#173451;border:1px solid #ced9e5;border-top:4px solid #ba9650;border-radius:14px;font:inherit;font-family:Montserrat,Arial,sans-serif}
.inline.cu-backdrop{position:static;display:block;padding:0;background:transparent}.inline .cu-modal{width:100%;max-height:none;overflow:visible}
.cu-modal header,.cu-modal footer,.heading-actions,.list-header,.filters,.context-options{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.cu-modal header,.list-header{justify-content:space-between}.cu-modal h3,.cu-modal h4,.cu-modal h5{color:#123052;margin:0}.cu-modal header h3{display:flex;align-items:center;gap:10px;font-size:1.5rem}.cu-modal header img{width:32px;height:32px}.cu-modal header p,.hint,small{color:#52657a}.cu-modal header p{margin:4px 0 0}
.cu-modal button,.cu-modal input:not([type=checkbox]),.cu-modal select{font:inherit;box-sizing:border-box;max-width:100%;min-width:0;padding:8px 12px;border:1px solid #cad7e4;border-radius:7px;background:white;color:#193a60}
.cu-modal button{cursor:pointer}.cu-modal button:disabled{opacity:.55;cursor:default}.cu-modal .btn-primary{background:#123967;color:#fff;border-color:#123967}.heading-actions button,.choice{display:flex;align-items:center;gap:8px}.heading-actions svg,.choice svg{width:18px;height:18px;flex-shrink:0}
.cu-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:22px 0}.cu-metrics button{display:flex;align-items:center;gap:12px;padding:14px;text-align:left;border-color:transparent;background:#edf4fc;color:#22496c}.cu-metrics b{font-size:1.4rem}.cu-metrics small{display:block;margin-top:3px}.cu-metrics .pending{background:#fff6e4;color:#845e09}.cu-metrics .started{background:#eaf2fe}.cu-metrics .complete{background:#eaf6ee;color:#266140}.cu-metrics .result{background:#f2effb;color:#66508c}.cu-metrics button[aria-pressed=true]{border-color:#8ca3bf}
.cu-layout{display:grid;grid-template-columns:minmax(200px,.72fr) minmax(0,2fr);align-items:start;gap:16px}.assignment-panel,.assigned-list,.picker-panel,.review-selection{border:1px solid #d4dfe9;border-radius:11px;padding:16px;min-width:0}.cu-modal h4{font-size:1.08rem}.cu-modal h5{margin:14px 0 6px;font-size:.9rem}.cu-modal .choice,.package-link{width:100%;text-align:left;margin-top:9px}.choice svg:last-child,.package-link small{margin-left:auto}.cu-modal .package-link{display:flex;align-items:center;justify-content:space-between}.filters{margin:14px 0}.filters input{flex:1;min-width:135px}.request-progress{display:grid;gap:3px;margin-top:4px}.request-progress progress{max-width:100%;width:100px;height:7px;accent-color:#275e94}.table-scroll{overflow-x:auto}.assigned-list table{width:100%;border-collapse:collapse;font-size:.85rem}.assigned-list th,.assigned-list td{padding:12px 8px;border-bottom:1px solid #e3e9ef;text-align:left}.assigned-list th{color:#52647a;font-weight:600;background:#f6f8fb}.assigned-list td.empty{text-align:center;padding:24px;color:#607187}.status-tag{display:inline-block;background:#eef1f6;border-radius:6px;padding:3px 7px}.status-tag.pending{background:#fff2cd;color:#795800}.status-tag.complete{background:#e0f3e7;color:#23563a}.status-tag.in_progress{background:#e4edff;color:#1a4886}.picker-panel,.review-selection{margin-top:16px;padding:18px}.cu-modal fieldset{border:0;padding:0;margin:12px 0;min-width:0}.release-recipient{margin:12px 0;padding:12px;border:1px solid #d5dfeb;border-radius:8px}.release-recipient form{display:flex;flex-wrap:wrap;align-items:end;gap:8px;margin-top:10px}
.cu-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(270px,100%),1fr));align-items:start;gap:15px;margin-top:12px}.cu-grid section{border:1px solid #d4dfe9;border-radius:9px;padding:0 12px 8px}.pick-row{display:flex;align-items:center;gap:6px;border-top:1px solid #e7edf2;padding:8px 0}.pick-row label{flex:1}.cu-modal .text-action{padding:3px;border:0;color:#205d93;text-decoration:underline}.review-selection label,.cu-shell label,.context-options label{display:block;margin:10px 0}.context-options select,.cu-shell input,.cu-shell select{display:block;margin-top:4px}.review-selection footer{justify-content:flex-end;margin-top:12px}.cu-error,.cu-ok{padding:10px;border-radius:6px}.cu-error{color:#883221;background:#fdf1ed}.cu-ok{color:#235b3c;background:#edf7ee}
@media(max-width:950px){.cu-layout{grid-template-columns:1fr}.cu-metrics{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}}
@media(max-width:540px){.cu-backdrop{padding:6px}.cu-modal{padding:12px}.cu-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cu-metrics button{padding:10px}.heading-actions{width:100%}.cu-grid{display:block}.cu-grid section{margin:8px 0}}
</style>
