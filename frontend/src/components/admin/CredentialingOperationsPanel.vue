<template>
  <section class="credential-operations" aria-label="Credentialing reminders and email">
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="kind === 'payer'">
      <h3>Payer documents</h3>
      <p>Secure payer records, including contracts and fee schedules.</p>
      <ul><li v-for="document in documents" :key="document.id"><button type="button" @click="viewDocument(document)">{{ document.title }}</button> · {{ document.documentType.replaceAll('_', ' ') }}</li></ul>
      <p v-if="!documents.length && !loading">No payer documents uploaded.</p>
      <form v-if="!readOnly" @submit.prevent="upload">
        <label>Document title<input v-model.trim="documentTitle" required maxlength="200" /></label>
        <label>Document type<select v-model="documentType"><option value="fee_schedule">Fee schedule</option><option value="contract">Contract</option><option value="welcome_letter">Welcome letter</option><option value="other">Other</option></select></label>
        <label>PDF or image (up to 12 MB)<input ref="fileInput" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" required @change="file = $event.target.files?.[0]" /></label>
        <button :disabled="busy || !file">Upload securely</button>
      </form>
    </section>
    <template v-if="!documentsOnly">
      <section>
        <h3>Credentialing team reminders</h3>
        <p>Schedule a follow-up, expiration, or renewal reminder for the authorized credentialing team.</p>
        <ul><li v-for="reminder in reminders" :key="reminder.id"><strong>{{ reminder.title }}</strong> · {{ localDate(reminder.remindAt) }} · {{ reminder.status }} <template v-if="['pending','delivered'].includes(reminder.status)"><button @click="finish(reminder, 'completed')" :disabled="busy">Complete</button><button @click="finish(reminder, 'cancelled')" :disabled="busy">Cancel</button></template></li></ul>
        <form @submit.prevent="addReminder"><label>Reminder<input v-model.trim="reminderTitle" required maxlength="200" placeholder="Renew contract or verify expiration" /></label><label>Remind the team at (your local time)<input v-model="remindAt" type="datetime-local" required /></label><button :disabled="busy">Set reminder</button></form>
      </section>
      <section v-if="kind === 'provider'">
        <h3>Provider–payer email</h3>
        <p>Create an optional receive-only address for this credentialing case. Incoming messages and files become credentialing tickets linked to this provider and payer.</p>
        <template v-if="mailbox"><label>Receive-only email<input :value="mailbox.emailAddress" readonly /></label><button @click="copyEmail" :disabled="busy">Copy email</button></template>
        <button v-else type="button" @click="createEmail" :disabled="busy || loading">Create email</button>
        <ul><li v-for="ticket in tickets" :key="ticket.id"><button @click="openTicket(ticket)">{{ ticket.subject || `Credentialing ticket #${ticket.id}` }}</button> · {{ ticket.status }}</li></ul>
        <section v-if="ticketDetail"><h4>{{ ticketDetail.ticket?.subject || 'Credentialing email' }}</h4><button @click="ticketDetail = null">Close email</button><article v-for="message in ticketDetail.messages" :key="message.id"><small>{{ localDate(message.created_at) }}</small><p class="email-body">{{ message.body }}</p></article><button v-for="attachment in ticketDetail.attachments" :key="attachment.id" @click="viewAttachment(attachment)">{{ attachment.file_name }}</button></section>
      </section>
    </template>
    <p v-if="loading" role="status">Loading credentialing details…</p><p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
<script setup>
import { ref, computed, inject, watch, onBeforeUnmount } from 'vue';
import { viewCredentialingFile } from '../../utils/credentialingDocuments.js';
import defaultApi from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true }, kind: { type: String, required: true }, recordId: { type: Number, required: true }, documentsOnly: Boolean, readOnly: Boolean });
const api = inject('credentialingTransport', defaultApi);
const base = computed(() => `/agencies/${props.agencyId}/credentialing`);
const subject = computed(() => `${base.value}/subjects/${props.kind}/${props.recordId}`);
const documents = ref([]), reminders = ref([]), tickets = ref([]), mailbox = ref(null), loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), ticketDetail = ref(null);
const documentTitle = ref(''), documentType = ref('fee_schedule'), file = ref(null), fileInput = ref(null), reminderTitle = ref(''), remindAt = ref('');
let generation = 0;
const localDate = value => value ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`).toLocaleString() : '';
const message = e => e.response?.data?.error?.message || e.message || 'Credentialing details could not be saved.';
async function load() {
  const current = ++generation; loading.value = true; error.value = ''; documents.value = []; reminders.value = []; tickets.value = []; mailbox.value = null; ticketDetail.value = null;
  try {
    const [docs, notes, email, threads] = await Promise.all([
      props.kind === 'payer' ? api.get(`${base.value}/insurances/${props.recordId}/documents`) : null,
      !props.documentsOnly ? api.get(`${subject.value}/reminders`) : null,
      props.kind === 'provider' && !props.documentsOnly ? api.get(`${base.value}/cases/${props.recordId}/email`) : null,
      props.kind === 'provider' && !props.documentsOnly ? api.get(`${base.value}/cases/${props.recordId}/tickets`) : null
    ]);
    if (current !== generation) return;
    documents.value = docs?.data.items || []; reminders.value = notes?.data.items || []; mailbox.value = email?.data.mailbox || null; tickets.value = threads?.data.items || [];
    if (!props.documentsOnly) void api.patch(`${subject.value}/notifications/read`, {}).catch(() => {});
  } catch (e) { if (current === generation) error.value = message(e); }
  finally { if (current === generation) loading.value = false; }
}
async function change(fn) { const current = generation; busy.value = true; error.value = ''; notice.value = ''; try { await fn(); if (current === generation) await load(); } catch (e) { if (current === generation) error.value = message(e); } finally { busy.value = false; } }
async function upload() { const body = new FormData(); body.append('title', documentTitle.value); body.append('documentType', documentType.value); body.append('file', file.value); await change(async () => { await api.post(`${base.value}/insurances/${props.recordId}/documents`, body, { headers: { 'Content-Type': 'multipart/form-data' } }); documentTitle.value = ''; file.value = null; if (fileInput.value) fileInput.value.value = ''; }); }
async function addReminder() { if (!remindAt.value) return; await change(async () => { await api.post(`${subject.value}/reminders`, { title: reminderTitle.value, remindAt: new Date(remindAt.value).toISOString() }); reminderTitle.value = ''; remindAt.value = ''; }); }
async function finish(reminder, status) { await change(() => api.patch(`${subject.value}/reminders/${reminder.id}`, { status })); }
async function createEmail() { await change(() => api.post(`${base.value}/cases/${props.recordId}/email`, {})); }
async function copyEmail() { try { await navigator.clipboard.writeText(mailbox.value.emailAddress); notice.value = 'Email address copied.'; } catch { error.value = 'Select and copy the email address above.'; } }
async function download(path, filename) { try { const { data } = await api.get(path, { responseType: 'blob' }); const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { error.value = message(e); } }
async function viewDocument(document) { try { await viewCredentialingFile(api, `${base.value}/insurances/${props.recordId}/documents/${document.id}`); } catch (e) { error.value = message(e); } }
async function viewAttachment(attachment) { await download(`${base.value}/cases/${props.recordId}/tickets/${ticketDetail.value.ticket.id}/attachments/${attachment.id}`, attachment.file_name); }
async function openTicket(ticket) { const current = generation; try { const { data } = await api.get(`${base.value}/cases/${props.recordId}/tickets/${ticket.id}`); if (current === generation) ticketDetail.value = data; } catch (e) { if (current === generation) error.value = message(e); } }
watch(() => [props.agencyId, props.kind, props.recordId], load, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>
<style scoped>
.credential-operations{border-top:1px solid var(--app-line,#dce4df);margin-top:24px;padding-top:12px}.credential-operations section{margin:18px 0}.credential-operations form{display:grid;gap:10px}.credential-operations label{display:grid;gap:6px}.credential-operations input,.credential-operations select{box-sizing:border-box;width:100%;padding:9px;font:inherit}.credential-operations button{margin:4px;padding:7px 10px;font:inherit;cursor:pointer}.credential-operations li{margin:12px 0}.credential-operations [role=alert]{color:#a32121}.email-body{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
