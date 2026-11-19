<template>
  <div v-if="open" class="cu-backdrop" :class="{inline}" @click.self="close">
    <div class="cu-modal" :role="inline ? 'region' : 'dialog'" aria-label="Client update">
      <header>
        <div>
          <h3><img src="/auricwell/mark.svg" alt="AuricWell" /> Documents &amp; assessments</h3>
          <p>Assign a package or choose individual items for this client.</p>
        </div>
        <button v-if="!inline" type="button" class="btn btn-secondary btn-sm" @click="close">Close</button>
      </header>

      <p v-if="!enabled" role="status">{{ readinessLoading?'Checking update availability…':'Client updates are on hold while delivery and portal access are reviewed. No updates have been sent.' }}</p>
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

      <template v-else-if="enabled">
        <p class="cu-who">{{ activeName || 'Client' }} <span v-if="activeClientId">· #{{ activeClientId }}</span></p>
        <p v-if="schoolClient">School release expires · {{ schoolExpiry || 'No expiration recorded' }}</p>
        <section class="cu-metrics" aria-label="Assignment summary">
          <div><strong>{{ items.length }}</strong> Assigned</div><div><strong>{{ items.filter(i=>i.status==='pending').length }}</strong> Pending</div><div><strong>{{ items.filter(i=>i.status==='in_progress').length }}</strong> In progress</div><div><strong>{{ items.filter(i=>i.status==='complete').length }}</strong> Completed</div><div><strong>{{ items.filter(i=>Number(i.has_result)).length }}</strong> With results</div>
        </section>
        <fieldset class="cu-layout" :disabled="saving"><div><details class="cu-section"><summary>Agency packages</summary>
          <label>Filter <select v-model="packageFilter"><option value="">All packages</option><option value="school">School packages</option></select></label>
          <button v-for="pkg in packages.filter(p=>!packageFilter || Number(p.school_only))" type="button" :key="pkg.id" @click="usePackage(pkg)">{{ pkg.name }}</button>
          <p v-if="!packages.length">No packages created for this agency.</p>
          <label>Package name <input v-model.trim="packageName" maxlength="100" /></label>
          <label><input v-model="schoolOnly" type="checkbox" /> School package</label>
          <button type="button" :disabled="saving||!packageName||!anySelected" @click="savePackage">Save selected items as package</button>
        </details>
        <details open class="cu-section"><summary>Individual forms, assessments and portal steps</summary>
        <div class="cu-grid">
          <section>
            <h4>Documents</h4>
            <label v-for="doc in catalog.documents" :key="doc.id"><input v-model="selected.documents" type="checkbox" :value="doc.id" /> {{ doc.name }}</label>
            <p v-if="!catalog.documents.length" class="hint">No active document templates.</p>
          </section>
          <section>
            <h4>Assessments</h4>
            <label v-for="item in catalog.assessments" :key="item.family"><input v-model="selected.assessments" type="checkbox" :value="item.family" /> {{ item.title }}</label>
          </section>
          <section>
            <h4>Portal steps</h4>
            <label v-for="step in catalog.portalSteps" :key="step.key"><input v-model="selected.portalSteps" type="checkbox" :value="step.key" /> {{ step.title }}</label>
          </section>
        </div>
        </details>
        <label class="cu-recipient">Portal recipient
          <select v-model="chosenId"><option value="">Select a linked account</option><option v-for="r in eligible" :value="r.id" :key="r.id">{{ r.name }} · {{ r.email }}</option></select>
        </label>
        <p v-if="!eligible.length" class="hint">No linked account has access to this selection. Open Portal → Manage portal access to check the link. For a tutoring-only guardian, check the responsible payer under Account → Billing.</p>
        </div><details open class="cu-section assigned-list"><summary>Assigned items ({{ items.length }})</summary>
          <input v-model="search" placeholder="Search assigned items" aria-label="Search assigned items" />
          <select aria-label="Filter by type" v-model="itemType"><option value="">All types</option><option v-for="type in [...new Set(items.map(i=>i.item_type))]" :key="type">{{ type }}</option></select>
          <select aria-label="Filter by status" v-model="itemStatus"><option value="">All statuses</option><option v-for="status in [...new Set(items.map(i=>i.status))]" :value="status" :key="status">{{ status.replaceAll('_',' ') }}</option></select>
          <p v-if="!filteredItems.length">No assigned items match.</p>
          <table v-else><thead><tr><th>Item</th><th>Recipient</th><th>Status</th><th></th></tr></thead><tbody>
            <tr v-for="item in filteredItems" :key="item.item_type+item.id"><td>{{ item.title }}</td><td>{{ item.first_name }} {{ item.last_name }}</td><td>{{ item.status.replaceAll('_',' ') }}{{ Number(item.has_result) ? ' · Result available' : '' }}</td><td><button v-if="['pending','in_progress'].includes(item.status)" :disabled="saving" @click="remind(item)">Resend reminder</button></td></tr>
          </tbody></table>
        </details>
        </fieldset><p v-if="error" class="cu-error">{{ error }}</p>
        <p v-if="success" class="cu-ok">{{ success }}</p>
        <footer>
          <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving || attemptedDelivery || !anySelected || !chosen" @click="send">{{ saving ? 'Sending…' : 'Send portal update' }}</button>
        </footer>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: Boolean, inline:Boolean,
  clientId: { type: [Number, String], default: null },
  agencyId: { type: [Number, String], default: null },
  clientName: { type: String, default: '' },
  guardianEmail: { type: String, default: '' },
  guardianName: { type: String, default: '' }
});
const emit = defineEmits(['close', 'sent', 'created']);

const catalog = reactive({ documents: [], assessments: [], portalSteps: [] });
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
const anySelected = computed(() => selected.documents.length + selected.assessments.length + selected.portalSteps.length > 0);
const selectedOrgType = computed(() => String(organizations.value.find((org) => Number(org.id) === Number(shell.organizationId))?.organization_type || '').toLowerCase());

const schoolClient=ref(false),schoolExpiry=ref('');
const packages=ref([]),items=ref([]),recipients=ref([]),chosenId=ref(''),packageName=ref(''),schoolOnly=ref(false),packageFilter=ref(''),search=ref('');
const itemType=ref(''),itemStatus=ref('');
const filteredItems=computed(()=>items.value.filter(i=>(!itemType.value||i.item_type===itemType.value)&&(!itemStatus.value||i.status===itemStatus.value)&&i.title.toLowerCase().includes(search.value.toLowerCase())));
const paymentSelected=computed(()=>selected.portalSteps.some(k=>['payment','authorization'].includes(k)));
const paymentOnly=computed(()=>paymentSelected.value && !selected.documents.length && !selected.assessments.length && selected.portalSteps.every(k=>['payment','authorization'].includes(k)));
const eligible=computed(()=>recipients.value.filter(r=>(paymentOnly.value || r.forms) && (!paymentSelected.value || r.billing) && (!selected.portalSteps.includes('payment') || r.cardAllowed!==false)));
const chosen=computed(()=>eligible.value.find(r=>r.id===chosenId.value));
watch(eligible,rows=>{if(!rows.some(r=>r.id===chosenId.value))chosenId.value=rows.length===1?rows[0].id:'';},{flush:'sync'});
function usePackage(pkg){
  const allowed={documents:catalog.documents.map(r=>r.id),assessments:catalog.assessments.map(r=>r.family),portalSteps:catalog.portalSteps.map(r=>r.key)};
  if(Object.keys(allowed).some(k=>(pkg.selection_json[k]||[]).some(v=>!allowed[k].includes(v)))){
    error.value='This package contains an unavailable item. Choose current items individually.';
    return;
  }
  error.value='';
  for(const key of Object.keys(allowed))selected[key]=[...(pkg.selection_json[key]||[])];
}
async function savePackage(){
  const current=generation;
  saving.value=true;error.value='';
  try{
    await api.post(`/clients/${activeClientId.value}/updates/packages`,{...selected,name:packageName.value,schoolOnly:schoolOnly.value});
    if(current===generation){packageName.value='';await loadCatalog();}
  }catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Could not save package.';}
  finally{if(current===generation)saving.value=false;}
}
async function remind(item){
  const current=generation;
  saving.value=true;error.value='';
  try{const {data}=await (item.item_type==='billing'?api.post(`/family-billing/staff/tasks/${item.id}/remind`,{clientId:activeClientId.value,agencyId:Number(props.agencyId)}):api.post(`/clients/${activeClientId.value}/updates/items/${item.id}/remind`));if(current===generation)success.value='Reminder: '+data.status;}
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
function close() { if (!saving.value) emit('close'); }

async function loadCatalog() {
  if (!activeClientId.value) return;
  const current=generation;
  const response = await api.get(`/clients/${activeClientId.value}/updates/catalog`);
  if(current!==generation)return;
  schoolClient.value=response.data?.schoolClient===true;schoolExpiry.value=String(response.data?.schoolRoiExpiresAt||'').slice(0,10);
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

async function send() {
  if (saving.value || attemptedDelivery.value || !enabled.value || !anySelected.value) return;
  error.value = '';
  success.value = '';
  if (!chosen.value) return;
  const recipient=chosen.value;
  guardianEmail.value=recipient.email;
  saving.value = true;
  const current=generation,clientId=activeClientId.value,agencyId=Number(props.agencyId);
  try {
    if(paymentSelected.value){
      attemptedDelivery.value=true;
      const {data}=await api.post('/family-billing/staff/tasks',{agencyId,guardianUserId:recipient.id,clientIds:[clientId],fromPortal:true,requireCard:selected.portalSteps.includes('payment')});
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
      portalSteps: selected.portalSteps,
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
    if(data.deliveryStatus==='sent'){emit('sent');if(props.inline)await loadCatalog();}
  } catch (err) {
    if(paymentOnly.value && err.response?.status>=400 && err.response?.status<500)attemptedDelivery.value=false;
    if(current===generation)error.value = err.response?.data?.error?.message || (attemptedDelivery.value?'Delivery could not be confirmed. Check email history before creating another update.':'The update could not be saved.');
  } finally {
    saving.value = false;
  }
}

watch(() => [props.open,props.clientId,props.agencyId], async ([open]) => {
  const current=++generation;
  if (!open) return;
  error.value = '';
  success.value = '';
  createdClientId.value = null;
  createdName.value = '';
  selected.documents = [];
  selected.assessments = [];
  selected.portalSteps = [];
  itemType.value='';itemStatus.value='';schoolClient.value=false;schoolExpiry.value='';packages.value=[];items.value=[];recipients.value=[];chosenId.value='';packageName.value='';schoolOnly.value=false;packageFilter.value='';search.value='';saving.value=false;
  catalog.documents=[];catalog.assessments=[];catalog.portalSteps=[];organizations.value=[];providers.value=[];
  enabled.value=false;requestId.value=null;attemptedDelivery.value=false;readinessLoading.value=true;
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
.cu-backdrop { position: fixed; inset: 0; background: rgba(16, 32, 48, .45); z-index: 80; display: grid; place-items: center; padding: 24px; }
.cu-modal { width: min(920px, 100%); max-height: calc(100vh - 48px); overflow: auto; background: #fff; border-radius: 14px; padding: 20px; color: #173451; }
.cu-modal header, .cu-modal footer, .cu-guardian { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.cu-modal h3 { margin: 0 0 4px; }
.cu-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 16px 0; }
.cu-grid section { max-height: 280px; overflow: auto; border: 1px solid #d6e3ef; border-radius: 10px; padding: 12px; }
.cu-grid label, .cu-shell label, .cu-guardian label { display: block; margin: 8px 0; font-size: 14px; }
.cu-shell input, .cu-shell select, .cu-guardian input { display: block; width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box; }
.cu-error { color: #9b2c2c; }
.cu-ok { color: #1f7a45; }
.hint, small { color: #52647c; }
@media (max-width: 800px) { .cu-grid, .cu-guardian { grid-template-columns: 1fr; display: grid; } }
.cu-modal{font-family:Montserrat,Arial,sans-serif;border-top:5px solid #c19b50;width:min(1080px,100%)}.cu-modal h3{display:flex;align-items:center;gap:10px;color:#132c51}.cu-modal h3 img{width:34px}.cu-metrics{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.cu-metrics div{flex:1;padding:15px;background:#eef3fa;border-radius:9px}.cu-metrics div:nth-child(2){background:#fcf6e8}.cu-metrics strong{font-size:1.4rem}.cu-section{padding:14px;border:1px solid #d0dbe7;border-radius:9px;margin:12px 0}.cu-section summary{cursor:pointer;font-weight:650}.cu-section label,.cu-section button{margin:8px}.cu-section table{width:100%;text-align:left}.cu-recipient{display:grid;gap:6px}.cu-recipient select{padding:10px}
.inline.cu-backdrop{position:static;display:block;padding:0;background:transparent}.inline .cu-modal{box-sizing:border-box;max-height:none;width:100%;overflow:visible}.cu-layout{padding:0;margin:0;min-width:0;border:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.cu-grid{grid-template-columns:1fr}.cu-grid section{max-height:175px}.assigned-list{align-self:start;overflow:auto}.cu-layout th,.cu-layout td{text-align:left;padding:9px 4px;border-bottom:1px solid #dbe3eb}.cu-layout table{font-size:.85rem}.cu-layout button{cursor:pointer}@media(max-width:800px){.cu-layout{display:block}}
</style>
