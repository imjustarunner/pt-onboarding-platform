<template>
  <div v-if="open" class="cu-backdrop" @click.self="close">
    <div class="cu-modal" role="dialog" aria-label="Client update">
      <header>
        <div>
          <h3>Client update</h3>
          <p>Choose only what this person still needs. This does not send a full enrollment.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="close">Close</button>
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
        <div class="cu-guardian">
          <label>Guardian first name <input v-model="guardianFirstName" maxlength="80" /></label>
          <label>Guardian last name <input v-model="guardianLastName" maxlength="80" /></label>
          <label>Guardian email <input v-model="guardianEmail" type="email" required maxlength="255" /></label>
        </div>
        <p class="hint">Choose an existing authorized portal contact. If this person needs a portal account or an access review, complete the portal-contact setup first. The update does not change portal rights. One email links to the selected items after sign-in.</p>
        <p v-if="error" class="cu-error">{{ error }}</p>
        <p v-if="success" class="cu-ok">{{ success }}</p>
        <footer>
          <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving || attemptedDelivery || !anySelected" @click="send">{{ saving ? 'Sending…' : 'Send portal update' }}</button>
        </footer>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: Boolean,
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
  catalog.documents = response.data?.documents || [];
  catalog.assessments = response.data?.assessments || [];
  catalog.portalSteps = response.data?.portalSteps || [];
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
  if (!guardianFirstName.value.trim() || !guardianLastName.value.trim() || !guardianEmail.value.includes('@')) {
    error.value = 'Enter the guardian’s first name, last name, and email.';
    return;
  }
  saving.value = true;
  const current=generation,clientId=activeClientId.value;
  try {
    const created=await api.post(`/clients/${clientId}/updates`, {
      agencyId: Number(props.agencyId),
      send: false,
      documents: selected.documents,
      assessments: selected.assessments,
      portalSteps: selected.portalSteps,
      guardianEmail: guardianEmail.value.trim(),
      guardianFirstName: guardianFirstName.value.trim(),
      guardianLastName: guardianLastName.value.trim()
    });
    if(current!==generation)return;
    requestId.value=created.data?.request?.id;
    if(!requestId.value)throw new Error('The update request could not be saved.');
    attemptedDelivery.value=true;
    const {data}=await api.post(`/clients/${clientId}/updates/${requestId.value}/send`,{guardianEmail:guardianEmail.value.trim()});
    if(current!==generation)return;
    success.value=({sent:'Portal update sent.',queued:'The update email is queued for approval. No delivery has been confirmed.',skipped:'The update email was not sent. Review notification preferences and email history.',redirected:'The update email went to the configured test inbox.',unconfirmed:'Delivery could not be confirmed. Check email history before creating another update.'})[data.deliveryStatus]||'Delivery could not be confirmed. Check email history.';
    if (Array.isArray(data.deliveries)) success.value = data.deliveries.map(row => `${row.name || row.email || 'Guardian'}: ${row.deliveryStatus.replaceAll('_', ' ')}`).join(' · ');
    if(data.deliveryStatus==='sent')emit('sent');
  } catch (err) {
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
</style>
