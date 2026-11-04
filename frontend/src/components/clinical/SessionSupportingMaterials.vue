<template>
  <details v-if="Number(clinicalSessionId)" class="session-materials" @toggle="onToggle">
    <summary>Supporting materials</summary>
    <div v-if="opened" class="materials-body">
      <p>Worksheets and other files for this session stay together here. Sharing to a client’s Documents is optional.</p>
      <p v-if="loading" role="status">Loading supporting materials…</p>
      <ul v-else-if="materials.length">
        <li v-for="material in materials" :key="material.id">
          <button v-if="material.available" type="button" :disabled="busy" @click="download(material)">{{ material.title }}</button>
          <strong v-else>{{ material.title }}</strong>
          <small v-if="!material.available">Encrypted · {{ material.scanStatus === 'infected' ? 'blocked by security scan' : 'pending private security scan' }}. Opening and sharing are unavailable.</small>
          <small v-else-if="material.sharedWith?.length">In client Documents for: {{ material.sharedWith.map(person => person.name).join(', ') }}</small>
          <small v-else>Care team only</small>
          <div v-if="(material.sharingRecipients || material.sharedWith)?.length" class="material-share-access">
            <small>Portal access granted to:</small>
            <div v-for="person in material.sharingRecipients || material.sharedWith" :key="person.id">
              <span>{{ person.name }}</span>
              <button type="button" :data-testid="`revoke-material-${material.id}-${person.id}`" :aria-label="`Remove ${person.name}’s portal access to ${material.title}`" :disabled="busy" @click="removeAccess(material, person)">Remove access</button>
            </div>
            <small v-if="!material.available">These grants remain recorded while opening is blocked. You can remove access now.</small>
          </div>
          <button v-if="material.available" type="button" :disabled="busy" @click="beginSharing(material)">Share in client Documents…</button>
          <button v-else type="button" :disabled="busy" @click="retryScan(material)">Retry private security scan</button>
        </li>
      </ul>
      <p v-else-if="!loading">No supporting materials for this session yet.</p>
      <form @submit.prevent="upload">
        <h4>{{ sharingMaterial ? `Share ${sharingMaterial.title}` : 'Add session materials' }}</h4>
        <p v-if="sharingMaterial">Existing shares stay available. Choose additional people to give access to this file.</p>
        <template v-if="!sharingMaterial">
          <label>Title <input v-model="title" maxlength="255" :disabled="busy" placeholder="For example, CBT thought record" /></label>
          <label>File <input :key="inputKey" type="file" accept="application/pdf,image/jpeg,image/png" :disabled="busy" @change="file = $event.target.files?.[0] || null" /></label>
          <small>PDF, JPEG or PNG, up to 25 MB. Files are encrypted before storage. They can be opened or shared after the private security scan passes.</small>
          <label><input v-model="includeInDocuments" data-testid="include-client-documents" type="checkbox" :disabled="busy" /> Include in client documents?</label>
        </template>
        <fieldset v-if="includeInDocuments" :disabled="busy || recipientsLoading">
          <legend>Who may access this file in their portal?</legend>
          <p v-if="recipientsLoading" role="status">Checking current document permissions…</p>
          <template v-else>
            <label v-if="guardians.length > 1"><input data-testid="all-guardians" type="checkbox" :checked="allGuardiansSelected" @change="selectAllGuardians($event.target.checked)" /> Share with all eligible parents / guardians listed below</label>
            <label v-for="person in recipients" :key="person.id"><input v-model="recipientIds" :data-testid="`material-recipient-${person.id}`" type="checkbox" :value="person.id" /> {{ person.kind === 'client' ? 'Share with client' : 'Share with' }} {{ person.name }}</label>
            <p v-if="!recipients.length">No linked client or guardian currently has permission to receive documents.</p>
          </template>
          <label><input v-model="reviewed" data-testid="material-sharing-reviewed" type="checkbox" /> I reviewed this file and approve sharing it with the selected people.</label>
        </fieldset>
        <button type="submit" data-testid="upload-session-material" :disabled="busy || (!sharingMaterial && (!file || !title.trim())) || (includeInDocuments && (!recipientIds.length || !reviewed || recipientsLoading))">{{ busy ? 'Saving…' : sharingMaterial ? 'Share with selected people' : 'Add session materials' }}</button>
        <button v-if="sharingMaterial" type="button" :disabled="busy" @click="sharingMaterial = null; includeInDocuments = false">Back to adding materials</button>
      </form>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api.js';
const props = defineProps({ clinicalSessionId: { type: [Number, String], required: true }, transport: { type: Object, default: null } });
// A public fixture can supply local transport; production retains the authenticated API.
const client = props.transport || api;
const opened = ref(false), loaded = ref(false), loading = ref(false), busy = ref(false), materials = ref([]);
const title = ref(''), file = ref(null), inputKey = ref(0), includeInDocuments = ref(false);
const recipients = ref([]), recipientsLoading = ref(false), recipientIds = ref([]), reviewed = ref(false);
const error = ref(''), notice = ref('');
const sharingMaterial = ref(null);
let generation = 0;
const base = () => `/clinical-data/sessions/${Number(props.clinicalSessionId)}/materials`;
const guardians = computed(() => recipients.value.filter(person => person.kind === 'guardian'));
const allGuardiansSelected = computed(() => guardians.value.length > 0 && guardians.value.every(person => recipientIds.value.includes(person.id)));
const message = (e, fallback) => e.response?.data?.error?.message || e.message || fallback;
watch(() => props.clinicalSessionId, () => {
  generation++; loaded.value = false; materials.value = []; recipients.value = []; recipientIds.value = [];
  title.value = ''; file.value = null; inputKey.value++; includeInDocuments.value = false; reviewed.value = false;
  error.value = ''; notice.value = ''; busy.value = false; loading.value = false; recipientsLoading.value = false; sharingMaterial.value = null;
  if (opened.value) load();
});
watch([recipientIds, file], () => { reviewed.value = false; }, { deep: true });
watch(includeInDocuments, async enabled => {
  recipientIds.value = []; reviewed.value = false;
  if (!enabled) return;
  await loadRecipients();
});
async function loadRecipients() {
  const token = generation; recipientsLoading.value = true; error.value = '';
  try {
    const response = await client.get(`${base()}/recipients`);
    if (token === generation && includeInDocuments.value) recipients.value = response.data || [];
  } catch (e) { if (token === generation) { recipients.value = []; error.value = message(e, 'Could not check document permissions.'); } }
  finally { if (token === generation) recipientsLoading.value = false; }
}
function beginSharing(material) {
  sharingMaterial.value = material; recipientIds.value = []; reviewed.value = false;
  if (includeInDocuments.value) loadRecipients(); else includeInDocuments.value = true;
}
function selectAllGuardians(selected) {
  const guardianIds = guardians.value.map(person => person.id);
  recipientIds.value = selected ? [...new Set([...recipientIds.value, ...guardianIds])] : recipientIds.value.filter(id => !guardianIds.includes(id));
}
async function onToggle(event) {
  opened.value = event.target.open;
  if (opened.value && !loaded.value) await load();
}
async function load() {
  const token = generation; loading.value = true;
  try { const response = await client.get(base()); if (token === generation) { materials.value = response.data || []; loaded.value = true; } }
  catch (e) { if (token === generation) error.value = message(e, 'Could not load supporting materials.'); }
  finally { if (token === generation) loading.value = false; }
}
async function upload() {
  if (sharingMaterial.value) return shareExisting();
  if (busy.value || !file.value || !title.value.trim() || (includeInDocuments.value && (!recipientIds.value.length || !reviewed.value))) return;
  const token = generation, path = base(), selected = [...recipientIds.value], share = includeInDocuments.value;
  busy.value = true; error.value = ''; notice.value = '';
  let saved = false;
  try {
    const data = new FormData(); data.append('file', file.value); data.append('title', title.value.trim());
    const response = await client.post(path, data);
    saved = true;
    if (token !== generation) return;
    const material = response.data;
    materials.value.unshift(material);
    if (!material.available) notice.value = 'Saved encrypted and pending a private security scan. This file has not been shared and cannot be opened yet.';
    else if (share) {
      const sharing = await client.put(`${path}/${material.id}/sharing`, { recipientIds: selected, reviewed: true });
      if (token !== generation) return;
      material.sharedWith = sharing.data.sharedWith;
      material.sharingRecipients = sharing.data.sharedWith;
      notice.value = 'Saved. The selected people can access this file in their portal’s Documents.';
    } else notice.value = 'Saved for this session’s care team.';
    title.value = ''; file.value = null; inputKey.value++; includeInDocuments.value = false; reviewed.value = false;
  } catch (e) {
    if (token === generation) error.value = `${saved ? 'The encrypted material was saved. Sharing was not completed; check its recipients before trying again. ' : ''}${message(e, 'Could not save supporting materials.')}`;
  } finally { if (token === generation) busy.value = false; }
}
async function shareExisting() {
  if (busy.value || !recipientIds.value.length || !reviewed.value || recipientsLoading.value) return;
  const token = generation, material = sharingMaterial.value; busy.value = true; error.value = ''; notice.value = '';
  try {
    const response = await client.put(`${base()}/${material.id}/sharing`, { recipientIds: [...recipientIds.value], reviewed: true });
    if (token !== generation) return;
    material.sharedWith = response.data.sharedWith;
    material.sharingRecipients = response.data.sharedWith;
    notice.value = 'The selected people can access this file in their portal’s Documents.';
    sharingMaterial.value = null; includeInDocuments.value = false;
  } catch (e) { if (token === generation) error.value = message(e, 'Sharing was not completed.'); }
  finally { if (token === generation) busy.value = false; }
}
async function retryScan(material) {
  const token = generation; busy.value = true; error.value = ''; notice.value = '';
  try {
    const response = await client.post(`${base()}/${material.id}/scan`);
    if (token !== generation) return;
    Object.assign(material, response.data);
    notice.value = material.available ? 'Security scan passed. You may now open or explicitly share this file.' : 'This file remains unavailable until its private security scan passes.';
  } catch (e) { if (token === generation) error.value = message(e, 'Could not complete the private security scan.'); }
  finally { if (token === generation) busy.value = false; }
}
async function removeAccess(material, person) {
  if (busy.value) return;
  const token = generation; busy.value = true; error.value = ''; notice.value = '';
  try {
    await client.delete(`${base()}/${material.id}/sharing/${person.id}`);
    if (token !== generation) return;
    const grants = material.sharingRecipients || material.sharedWith || [];
    material.sharedWith = (material.sharedWith || []).filter(recipient => Number(recipient.id) !== Number(person.id));
    material.sharingRecipients = grants.filter(recipient => Number(recipient.id) !== Number(person.id));
    notice.value = `Portal access removed for ${person.name}. The session attachment remains stored. You can explicitly share it again after its security scan passes.`;
  } catch (e) { if (token === generation) error.value = message(e, 'Could not remove portal access.'); }
  finally { if (token === generation) busy.value = false; }
}
async function download(material) {
  const token = generation; error.value = '';
  try {
    const response = await client.get(`${base()}/${material.id}/download`, { responseType: 'blob' });
    if (token !== generation) return;
    const url = URL.createObjectURL(new Blob([response.data], { type: material.mimeType }));
    const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[material.mimeType] || '';
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = /\.(pdf|jpe?g|png)$/i.test(material.title) ? material.title : `${material.title}${extension}`;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { if (token === generation) error.value = message(e, 'Could not open this material.'); }
}
</script>

<style scoped>
.session-materials{margin:14px 0;border:1px solid var(--border,#dce4ed);border-radius:10px;background:var(--bg-surface,#fff)}
summary{padding:14px;cursor:pointer;font-weight:700}.materials-body{padding:0 14px 14px}.materials-body p{line-height:1.5}.materials-body small{display:block;color:var(--text-muted,#53657a);line-height:1.5}.materials-body ul{padding-left:22px}.materials-body li{margin:12px 0}.materials-body form{border-top:1px solid var(--border,#dce4ed);padding-top:12px}.materials-body label{display:block;margin:10px 0}.materials-body input:not([type=checkbox]){display:block;box-sizing:border-box;width:100%;padding:9px;margin-top:5px}.materials-body fieldset{margin:12px 0;border:1px solid var(--border,#dce4ed)}.materials-body button{padding:9px 12px;cursor:pointer}.materials-body [role=alert]{color:var(--danger,#a02727)}
</style>
