<template>
  <section class="client-referrals">
    <h3>Referrals · referred by / referred to</h3>
    <p>Connect current or past referrals to a directory organization. Existing documents can be linked without uploading them again.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="faxFieldsWarning" role="status">{{ faxFieldsWarning }}</p>
    <details v-if="faxFields"><summary>Reviewed fax intake details</summary><dl>
      <template v-for="(value, key) in faxFields" :key="key"><dt>{{ fieldLabels[key] || key }}</dt><dd>{{ value }}</dd></template>
    </dl></details>
    <ul v-if="links.length"><li v-for="link in links" :key="link.id">
      <strong>{{ link.direction === 'incoming' ? 'Referred by' : 'Referred to' }}: {{ link.name }}</strong>
      <span v-if="link.referral_date"> · {{ String(link.referral_date).slice(0,10) }}</span>
      <span v-if="link.phi_document_id"> · Linked document #{{ link.phi_document_id }}</span>
      <div>{{ link.phone }} <span v-if="link.fax">· Fax {{ link.fax }}</span></div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="edit(link)">Edit link</button>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="remove(link)">Remove link</button>
    </li></ul>
    <button v-if="!editing" type="button" class="btn btn-secondary" @click="startNew">+ Link a referral, including a past referral</button>
    <div v-if="editing" class="referral-form">
      <ReferralEntityPicker v-model="entryId" :agency-id="agencyId" />
      <label>Direction <select v-model="direction"><option value="incoming">Referred by (incoming)</option><option value="outgoing">Referred to (outgoing)</option></select></label>
      <label>Original referral date <input v-model="referralDate" type="date" /></label>
      <label>Existing referral document (optional)<select v-model="documentId"><option :value="null">No document</option><option v-for="doc in documents" :key="doc.id" :value="doc.id">{{ doc.document_title || doc.document_type || 'Document' }} · #{{ doc.id }} · {{ String(doc.uploaded_at).slice(0,10) }}</option></select></label>
      <button type="button" class="btn btn-primary" :disabled="busy || !entryId" @click="save">{{ busy ? 'Saving…' : 'Save referral link' }}</button>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="editing = false">Cancel</button>
    </div>
  </section>
</template>
<script setup>
import { ref, watch, nextTick } from 'vue';
import api from '../../services/api';
import ReferralEntityPicker from '../referralDirectory/ReferralEntityPicker.vue';
const props = defineProps({ clientId: [Number, String], agencyId: [Number, String] });
const links = ref([]), documents = ref([]), editing = ref(false), busy = ref(false), error = ref('');
const faxFields = ref(null), fieldLabels = ref({}), faxFieldsWarning = ref('');
const linkId = ref(null);
const entryId = ref(null), direction = ref('incoming'), referralDate = ref(''), documentId = ref(null);
const config = () => ({ params: { agencyId: props.agencyId } });
let loadSequence = 0;
async function load() {
  const current = ++loadSequence;
  if (!props.clientId || !props.agencyId) return;
  try { const { data } = await api.get(`/client-referral-links/clients/${props.clientId}`, config()); if (current === loadSequence) { links.value = data.links; documents.value = data.documents; faxFields.value = data.faxFields || null; fieldLabels.value = data.fieldLabels || {}; faxFieldsWarning.value = data.faxFieldsWarning || ''; } }
  catch { if (current === loadSequence) error.value = 'Unable to load referral links.'; }
}
function startNew() { linkId.value = null; entryId.value = null; direction.value = 'incoming'; referralDate.value = ''; documentId.value = null; editing.value = true; }
async function edit(link) { linkId.value = link.id; editing.value = true; await nextTick(); entryId.value = link.entry_id; direction.value = link.direction; referralDate.value = link.referral_date ? String(link.referral_date).slice(0,10) : ''; documentId.value = link.phi_document_id; }
async function save() {
  busy.value = true; error.value = '';
  try { await api.post(`/client-referral-links/clients/${props.clientId}`, { linkId: linkId.value, entryId: entryId.value, direction: direction.value, referralDate: referralDate.value, documentId: documentId.value }, config()); editing.value = false; await load(); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Could not save referral link.'; }
  finally { busy.value = false; }
}
async function remove(link) {
  busy.value = true; error.value = '';
  try { await api.delete(`/client-referral-links/clients/${props.clientId}/${link.id}`, config()); await load(); }
  catch { error.value = 'Could not remove referral link.'; }
  finally { busy.value = false; }
}
watch(() => [props.clientId, props.agencyId], () => { links.value = []; documents.value = []; faxFields.value = null; faxFieldsWarning.value = ''; editing.value = false; error.value = ''; load(); }, { immediate: true });
</script>
<style scoped>
.client-referrals { padding:16px; border:1px solid var(--border-color,#ddd); border-radius:10px; margin:12px 0; } .referral-form,label { display:grid; gap:8px; } li { margin:12px 0; } li button { margin:6px; } input,select { padding:8px; max-width:100%; } p { color:var(--text-secondary,#666); }
</style>
