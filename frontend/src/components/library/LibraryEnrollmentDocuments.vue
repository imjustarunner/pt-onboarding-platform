<template>
  <section class="enrollment-library" aria-label="Enrollment documents">
    <header class="enrollment-heading">
      <div><p class="eyebrow">{{ catalog?.agency?.name || 'Your organization' }}</p><h2>Enrollment documents</h2><p>Current forms and agreements, ready to print or share.</p></div>
      <span class="auricwell-brand"><img src="/auricwell/mark.svg" alt="" />AuricWell</span>
    </header>
    <section class="packet-builder" aria-labelledby="packet-title">
      <div><h3 id="packet-title">Build an enrollment packet</h3><p>Choose who is enrolling and where services will take place.</p></div>
      <div class="packet-options">
        <label>Service<select aria-label="Enrollment service" :value="service" :disabled="busy" @change="changeOption('service', $event)"><option v-for="item in services" :key="item.key" :value="item.key">{{ item.label }}</option></select></label>
        <label>Setting<select aria-label="Enrollment setting" :value="setting" :disabled="busy" @change="changeOption('setting', $event)"><option value="office">Office or virtual</option><option value="school">School</option></select></label>
        <label>Enrolling<select aria-label="Enrollment signer"  :value="audience" :disabled="busy" @change="changeOption('audience', $event)"><option value="self">Myself · individual</option><option value="guardian">My dependent · guardian</option></select></label>
        <label>Language<select aria-label="Enrollment language" :value="locale" :disabled="busy" @change="changeOption('locale', $event)"><option value="en">English</option><option value="es">Español</option></select></label>
      </div>
      <p class="packet-context">{{ setting === 'school' ? (schoolId ? 'School details are supplied for this school.' : 'School fields stay blank. School portal packets include that school’s details.') : 'Includes space to describe provider preferences. No provider selection is required.' }}</p>
      <div class="packet-actions">
        <button type="button" class="primary" :disabled="!canDownload" @click="downloadPacket(false)">{{ downloading ? 'Preparing PDF…' : 'Download PDF' }}</button>
        <button type="button" :disabled="!canDownload" @click="downloadPacket(true)">Print / open PDF</button>
        <button type="button" :disabled="!canDownload" :aria-expanded="showEmail" @click="showEmail = !showEmail">Send PDF by email</button>
      </div>
      <p class="muted">The packet is assembled from the saved documents below. Download a copy to print or attach to an email.</p>
      <form v-if="showEmail" class="email-packet" @submit.prevent="sendPacket">
        <div class="email-client"><NoteAidClientPicker v-model="emailClientId" :agency-id="agencyId" :search-all-tenants="false" :disabled="emailBusy" /></div>
        <label v-if="emailClientId">Authorized recipient<select v-model="emailRecipientUserId" aria-label="Packet email recipient" required :disabled="emailBusy || recipientsLoading"><option value="">Choose a recipient</option><option v-for="recipient in emailRecipients" :key="recipient.userId" :value="recipient.userId">{{ recipient.name }} · {{ recipient.email }}</option></select></label>
        <p v-if="recipientsLoading" role="status">Loading authorized recipients…</p>
        <p v-else-if="emailClientId && !emailRecipients.length" class="muted">No authorized portal recipient with an email address is available. Check this client’s portal access, or download the packet to provide a paper copy.</p>
        <p v-if="selectedEmailRecipient" class="email-recipient">Sending to <strong>{{ selectedEmailRecipient.name }}</strong> at {{ selectedEmailRecipient.email }}.</p>
        <p>A blank enrollment packet will be attached. Client answers and medical records are not included.</p>
        <button type="submit" class="primary" :disabled="!canSendEmail">{{ emailBusy ? 'Sending…' : 'Send enrollment packet' }}</button>
      </form>
    </section>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
    <p v-if="loading" role="status">Loading enrollment documents…</p>
    <div v-else-if="loadError" class="error" role="alert">{{ loadError }} <button type="button" @click="load">Try again</button></div>
    <div v-else-if="catalog" class="foundation-layout">
      <nav class="foundation-list" aria-label="Enrollment source documents">
        <p class="eyebrow">Included documents</p>
        <button v-for="document in visibleDocuments" :key="document.key" type="button" :aria-current="selectedKey === document.key ? 'true' : undefined" :disabled="saving" @click="selectDocument(document)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h6" /></svg>
          <span>{{ document.title }}<small>{{ document.editable ? 'Source document' : 'Automatically maintained' }}</small></span>
        </button>
        <p v-if="!visibleDocuments.length" class="muted">{{ search.trim() ? 'No enrollment documents match your search.' : 'No source documents are available for this selection.' }}</p>
      </nav>
      <article v-if="selected" class="source-document">
        <header class="source-heading"><div><h3>{{ selected.title }}</h3><p class="muted">{{ selected.version === 0 ? 'Original agency source' : `Version ${selected.version || 1}` }}{{ editing && dirty ? ' · Unsaved changes' : '' }}</p></div>
          <div class="source-actions"><button v-if="!editing" type="button" @click="shareDocument">Share to client portal</button><button v-if="canEdit && !editing" type="button" @click="startEditing">Edit source document</button></div>
        </header>
        <p v-if="selected.protectedNote" class="protected-note">{{ selected.protectedNote }}</p>
        <template v-if="editing">
          <p class="edit-scope">Saved changes apply to future enrollment packets. Previously issued copies keep their original content.</p>
          <RichTextEditor :content="{ content: draftHtml }" @update="draftHtml = cleanHtml($event.content)" />
          <div class="edit-actions"><button type="button" class="primary" :disabled="saving || !dirty || conflict" @click="save">{{ saving ? 'Saving…' : 'Save source document' }}</button><button type="button" :disabled="saving" @click="cancelEditing">Cancel</button><button v-if="conflict" type="button" @click="reloadAfterConflict">Reload latest version</button></div>
          <p v-if="conflict" class="error" role="alert">This document changed elsewhere. Your edits are still here. Copy them before reloading the latest version.</p>
        </template>
        <div v-else class="source-preview" v-html="cleanHtml(selected.html)" />
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import RichTextEditor from '../admin/RichTextEditor.vue';
import NoteAidClientPicker from '../clinical/NoteAidClientPicker.vue';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, schoolId: { type: [Number, String], default: null }, search: { type: String, default: '' }, initialContext: { type: Object, default: () => ({}) } });
const emit = defineEmits(['saved', 'share-document']);
const auth = useAuthStore();
const catalog = ref(null), loading = ref(false), loadError = ref(''), actionError = ref(''), notice = ref('');
const service = ref(props.initialContext.service === 'tutoring' ? 'tutoring' : 'counseling'), setting = ref(props.initialContext.setting === 'school' ? 'school' : 'office'), audience = ref(props.initialContext.audience === 'guardian' ? 'guardian' : 'self'), locale = ref(props.initialContext.locale === 'es' ? 'es' : 'en');
const selectedKey = ref(''), editing = ref(false), draftHtml = ref(''), baseline = ref(''), saving = ref(false), conflict = ref(false);
const downloading = ref(false), showEmail = ref(false), emailBusy = ref(false);
const emailClientId = ref(null), emailRecipients = ref([]), emailRecipientUserId = ref(''), recipientsLoading = ref(false);
let recipientSequence = 0;
let sequence = 0, disposed = false;
const urls = new Set();
const cleanHtml = value => DOMPurify.sanitize(String(value || ''), { FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'style'], FORBID_ATTR: ['contenteditable'] });
const sourceChannel = computed(() => service.value === 'tutoring' ? 'tutoring' : setting.value);
const services = computed(() => {
  const raw = catalog.value?.services;
  const items = Array.isArray(raw) ? raw : ['counseling', 'tutoring'];
  return items.map(item => typeof item === 'string' ? { key: item, label: item === 'tutoring' ? 'Tutoring' : 'Counseling' } : { key: item.key || item.value || item.id, label: item.label || item.name || item.title }).filter(item => ['counseling', 'tutoring'].includes(item.key));
});
const documents = computed(() => catalog.value?.documents || []);
const visibleDocuments = computed(() => { const query = props.search.trim().toLowerCase(); return query ? documents.value.filter(document => `${document.title} ${document.key}`.toLowerCase().includes(query)) : documents.value; });
const selected = computed(() => documents.value.find(document => document.key === selectedKey.value));
const canEdit = computed(() => catalog.value?.canEdit === true && selected.value?.editable === true && ['admin', 'super_admin'].includes(auth.user?.effectiveRole || auth.user?.role));
const dirty = computed(() => editing.value && draftHtml.value !== baseline.value);
const busy = computed(() => loading.value || saving.value || downloading.value || emailBusy.value);
const canDownload = computed(() => !!catalog.value && !busy.value && !dirty.value && services.value.some(item => item.key === service.value));
const selectedEmailRecipient = computed(() => emailRecipients.value.find(recipient => Number(recipient.userId) === Number(emailRecipientUserId.value)));
const canSendEmail = computed(() => canDownload.value && !!emailClientId.value && !!selectedEmailRecipient.value && !recipientsLoading.value);
const sourceOptions = () => ({ agencyId: Number(props.agencyId), channel: sourceChannel.value, setting: setting.value, audience: audience.value, packetService: service.value, locale: locale.value, ...(setting.value === 'school' && props.schoolId ? { schoolId: Number(props.schoolId) } : {}) });
const packetOptions = () => ({ agencyId: Number(props.agencyId), channel: setting.value, audience: audience.value, service: service.value, locale: locale.value, ...(setting.value === 'school' && props.schoolId ? { schoolId: Number(props.schoolId) } : {}) });
const message = (error, fallback) => error?.response?.data?.error?.message || error?.response?.data?.message || fallback;
function prepareToLeave() { return !saving.value && (!dirty.value || window.confirm('Discard your unsaved changes to this source document?')); }
function resetEditor() { editing.value = false; draftHtml.value = ''; baseline.value = ''; conflict.value = false; }
async function load() {
  const request = ++sequence; loading.value = true; loadError.value = ''; actionError.value = ''; notice.value = ''; catalog.value = null; resetEditor();
  if (!Number(props.agencyId)) { loading.value = false; loadError.value = 'Choose an organization to view enrollment documents.'; return; }
  try {
    const { data } = await api.get('/enrollment-foundations', { params: sourceOptions() });
    if (disposed || request !== sequence) return;
    catalog.value = data;
    if (!documents.value.some(document => document.key === selectedKey.value)) selectedKey.value = documents.value[0]?.key || '';
  } catch (error) { if (!disposed && request === sequence) loadError.value = message(error, 'Enrollment documents could not be loaded. Please try again.'); }
  finally { if (!disposed && request === sequence) loading.value = false; }
}
async function changeOption(key, event) {
  const state = { service, setting, audience, locale }[key];
  if (!prepareToLeave()) { event.target.value = state.value; return; }
  state.value = event.target.value; showEmail.value = false; await load();
}
function selectDocument(document) { if (!prepareToLeave()) return; selectedKey.value = document.key; resetEditor(); actionError.value = ''; notice.value = ''; }
function startEditing() { if (!canEdit.value) return; baseline.value = cleanHtml(selected.value.editableHtml ?? selected.value.html); draftHtml.value = baseline.value; editing.value = true; actionError.value = ''; notice.value = ''; }
function cancelEditing() { if (prepareToLeave()) { resetEditor(); actionError.value = ''; } }
async function reloadAfterConflict() { if (prepareToLeave()) await load(); }
async function save() {
  if (!canEdit.value || !dirty.value || saving.value || conflict.value) return;
  const request = sequence, key = selected.value.key, submittedHtml = cleanHtml(draftHtml.value);
  saving.value = true; actionError.value = ''; notice.value = '';
  try {
    const { data } = await api.put(`/enrollment-foundations/${encodeURIComponent(key)}`, { ...sourceOptions(), version: selected.value.version, html: submittedHtml });
    if (disposed || request !== sequence) return;
    const saved = data.document || data;
    catalog.value.documents = documents.value.map(document => document.key === key ? saved : document);
    if (draftHtml.value === submittedHtml) { resetEditor(); notice.value = 'Source document saved. New packets will use this version.'; }
    else { baseline.value = cleanHtml(saved.editableHtml ?? saved.html); notice.value = 'Source document saved. Your latest edits still need to be saved.'; }
    emit('saved', saved);
  } catch (error) { if (!disposed && request === sequence) { conflict.value = error?.response?.status === 409; actionError.value = message(error, 'The document could not be saved. Your edits have been kept.'); } }
  finally { if (!disposed && request === sequence) saving.value = false; }
}
function shareDocument() { if (selected.value) emit('share-document', { ...packetOptions(), key: selected.value.key, title: selected.value.title, version: selected.value.version }); }
async function downloadPacket(print) {
  if (!canDownload.value) return;
  const request = sequence, options = packetOptions();
  let popup = null;
  if (print) { popup = window.open('', '_blank'); if (!popup) { actionError.value = 'Allow a new tab to print, or use Download PDF.'; return; } popup.opener = null; }
  downloading.value = true; actionError.value = ''; notice.value = '';
  try {
    const { data } = await api.get('/enrollment-foundations/packet.pdf', { params: options, responseType: 'blob' });
    if (disposed || request !== sequence) { popup?.close(); return; }
    const url = URL.createObjectURL(data); urls.add(url);
    if (popup) popup.location.href = url;
    else { const link = document.createElement('a'); link.href = url; link.download = `${options.service}-${options.channel}-${options.audience}-enrollment-${options.locale}.pdf`; document.body.appendChild(link); link.click(); link.remove(); }
    notice.value = print ? 'The packet is open in a new tab. Use its print button to print a copy.' : 'Enrollment packet downloaded.';
  } catch (error) { popup?.close(); if (!disposed && request === sequence) actionError.value = message(error, 'The PDF could not be prepared. Please try again.'); }
  finally { if (!disposed && request === sequence) downloading.value = false; }
}
async function sendPacket() {
  if (!canSendEmail.value || emailBusy.value) return;
  const request = sequence, options = packetOptions();
  emailBusy.value = true; actionError.value = ''; notice.value = '';
  try {
    const { data } = await api.post('/enrollment-foundations/packet-email', { ...options, clientId: Number(emailClientId.value), recipientUserId: Number(emailRecipientUserId.value) });
    if (disposed || request !== sequence) return;
    if (data.sent !== true) throw new Error('Email was not sent.');
    notice.value = 'Enrollment packet sent.'; showEmail.value = false; emailRecipientUserId.value = '';
  } catch (error) { if (!disposed && request === sequence) actionError.value = message(error, 'The email could not be sent. Please retry or download the PDF.'); }
  finally { if (!disposed && request === sequence) emailBusy.value = false; }
}
async function loadEmailRecipients() {
  const request = ++recipientSequence, agencyId = Number(props.agencyId), clientId = Number(emailClientId.value);
  emailRecipients.value = []; emailRecipientUserId.value = ''; recipientsLoading.value = false;
  if (!agencyId || !clientId) return;
  recipientsLoading.value = true; actionError.value = '';
  try {
    const { data } = await api.get('/enrollment-foundations/packet-recipients', { params: { agencyId, clientId } });
    if (!disposed && request === recipientSequence) emailRecipients.value = (data.recipients || []).filter(recipient => Number(recipient.userId) && recipient.email);
  } catch (error) { if (!disposed && request === recipientSequence) actionError.value = message(error, 'Authorized recipients could not be loaded. Please select the client again.'); }
  finally { if (!disposed && request === recipientSequence) recipientsLoading.value = false; }
}
watch(emailClientId, loadEmailRecipients);
function beforeUnload(event) { if (dirty.value || saving.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
watch(() => [props.agencyId, props.schoolId], () => { saving.value = false; downloading.value = false; emailBusy.value = false; showEmail.value = false; emailClientId.value = null; emailRecipients.value = []; emailRecipientUserId.value = ''; recipientSequence++; recipientsLoading.value = false; load(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; sequence++; recipientSequence++; window.removeEventListener('beforeunload', beforeUnload); urls.forEach(url => URL.revokeObjectURL(url)); });
defineExpose({ prepareToLeave, refresh: load });
</script>

<style scoped>
.enrollment-library{color:#203f39;min-width:0}.enrollment-heading,.source-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px}.enrollment-heading h2{font-size:24px;margin:4px 0 6px}.enrollment-heading p,.packet-builder p,.source-heading p{margin:6px 0;font-size:14px;line-height:1.55}.eyebrow{text-transform:uppercase;letter-spacing:.1em;font-size:11px!important;font-weight:700;color:#657c76}.auricwell-brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:19px;white-space:nowrap}.auricwell-brand img{width:34px;height:34px}.packet-builder{padding:20px;border:1px solid #d7e4df;border-radius:14px;background:#f4f8f6;margin-bottom:22px}.packet-builder h3,.source-heading h3{font-size:18px;margin:0}.packet-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0 12px}.enrollment-library label{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:600}.enrollment-library select,.enrollment-library input{width:100%;box-sizing:border-box;min-height:42px;border:1px solid #bfd1ca;border-radius:8px;background:white;color:#203f39;padding:9px 10px;font:inherit}.enrollment-library button{min-height:40px;padding:9px 13px;border:1px solid #bfd1ca;border-radius:8px;background:white;color:#244f44;font:inherit;font-size:13px;cursor:pointer}.enrollment-library button:hover{background:#edf4f0}.enrollment-library button:disabled{opacity:.5;cursor:default}.enrollment-library :focus-visible{outline:3px solid #69a394;outline-offset:3px}.enrollment-library .primary{background:#215c4c;color:white;border-color:#215c4c}.packet-actions,.source-actions,.edit-actions{display:flex;gap:8px;flex-wrap:wrap}.packet-context,.muted{color:#627b73;font-size:12px!important}.email-packet{display:grid;grid-template-columns:minmax(220px,360px) 1fr;gap:10px 16px;align-items:end;margin-top:16px;padding-top:16px;border-top:1px solid #d7e4df}.email-packet button{justify-self:start}.email-packet p{font-size:12px}.foundation-layout{display:grid;grid-template-columns:minmax(210px,270px) minmax(0,1fr);gap:22px;align-items:start}.foundation-list{display:grid;gap:5px;position:sticky;top:14px;max-height:75vh;overflow:auto}.foundation-list>button{display:flex;text-align:left;align-items:flex-start;gap:10px;border-color:transparent;padding:12px;line-height:1.45}.foundation-list>button[aria-current=true]{border-color:#d2e1d9;background:#eaf2ed;font-weight:700}.foundation-list svg{flex:none;width:23px;height:23px}.foundation-list small{display:block;font-weight:400;font-size:11px;color:#6d807a;margin-top:3px}.source-document{min-width:0;background:white;border:1px solid #dce6e1;border-radius:12px;overflow:hidden;padding:22px}.source-heading{flex-wrap:wrap;gap:12px;margin-bottom:16px}.source-preview{overflow-wrap:anywhere;font-size:14px;line-height:1.65}.source-preview :deep(img){max-width:100%;height:auto}.source-preview :deep(table){display:block;max-width:100%;overflow:auto;border-collapse:collapse}.source-preview :deep(td),.source-preview :deep(th){padding:8px;border:1px solid #dbe4df}.source-preview :deep(a){color:#236250}.source-preview :deep(h1){font-size:24px}.source-preview :deep(h2){font-size:21px}.source-preview :deep(h3){font-size:18px}.source-preview :deep(input){display:none}.protected-note,.edit-scope{padding:12px;border-radius:8px;font-size:13px;line-height:1.55;background:#f2f6f4}.edit-actions{margin-top:14px}.error{background:#fff1e9;color:#8a3a19;padding:12px;border-radius:8px;font-size:13px}.notice{background:#eaf5ed;padding:12px;border-radius:8px;font-size:13px}.source-document :deep(.editor-content){min-height:260px}.source-document :deep(.tiptap){outline:none;min-height:240px;overflow-wrap:anywhere}.source-document :deep(.editor-toolbar){flex-wrap:wrap}
@media(max-width:900px){.packet-options{grid-template-columns:repeat(2,minmax(0,1fr))}.foundation-layout{grid-template-columns:1fr}.foundation-list{position:static;display:flex;overflow:auto;max-height:none;padding-bottom:8px}.foundation-list>.eyebrow{display:none}.foundation-list>button{flex:0 0 210px}.source-document{padding:18px}.email-packet{grid-template-columns:1fr}}
@media(max-width:520px){.enrollment-heading{flex-wrap:wrap;gap:8px}.auricwell-brand{font-size:16px}.auricwell-brand img{width:26px;height:26px}.packet-builder{padding:15px}.packet-options{gap:10px}.packet-actions>button{flex:1 1 45%}.source-actions>button{flex:1}.source-heading{display:block}.source-actions{margin-top:12px}}
</style>
