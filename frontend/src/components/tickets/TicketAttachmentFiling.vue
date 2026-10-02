<template>
  <section class="ticket-attachment-filing" aria-label="Ticket attachments">
    <strong>Attachments</strong>
    <template v-if="canFile">
      <p v-if="ticket.client_id">Add files to: <strong>{{ clientLabel }}</strong>.</p>
      <p v-else>Choose the existing client before adding a registration packet to their profile.</p>
      <button type="button" :disabled="busy || !!linkingClientId" @click="choosing = !choosing">{{ ticket.client_id ? 'Change linked client' : 'Choose client' }}</button>
      <form v-if="choosing" @submit.prevent="search">
        <label>Find client<input v-model="query" type="search" placeholder="Name or initials" minlength="2" required /></label>
        <button :disabled="searching || !!linkingClientId">{{ searching ? 'Searching…' : 'Search' }}</button>
        <ul>
          <li v-for="client in results" :key="client.clientId">
            <span>{{ client.fullName || client.initials || `Client #${client.clientId}` }} · {{ client.identifierCode || client.clientId }}</span>
            <button type="button" :disabled="!!linkingClientId" @click="$emit('link-client', client)">{{ linkingClientId === client.clientId ? 'Linking…' : 'Link this client' }}</button>
          </li>
        </ul>
      </form>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div v-for="attachment in attachments" :key="attachment.id" class="attachment-row">
      <button type="button" class="attachment-name" @click="$emit('open', attachment)">{{ attachment.file_name || 'Attachment' }}</button>
      <span class="size">{{ sizeLabel(attachment.file_size) }}</span>
      <template v-if="canFile && supported(attachment)">
        <span v-if="alreadyAdded(attachment)" class="saved">Added to client</span>
        <button v-else type="button" :disabled="busy || !ticket.client_id || !!linkingClientId" @click="add(attachment)">{{ busy === attachment.id ? 'Adding…' : 'Add to client' }}</button>
      </template>
    </div>
    <p v-if="canFile" class="hint">PDF, JPG, and PNG files up to 25 MB. The original attachment stays on this ticket.</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ ticket: { type: Object, required: true }, attachments: { type: Array, default: () => [] }, canFile: Boolean, linkingClientId: { type: Number, default: null } });
defineEmits(['open', 'link-client']);
const busy = ref(null), choosing = ref(false), query = ref(''), searching = ref(false), results = ref([]), error = ref(''), message = ref(''), saved = ref({});
const clientLabel = computed(() => props.ticket.client_full_name || props.ticket.client_identifier_code || props.ticket.client_initials || `Client #${props.ticket.client_id}`);
const sizeLabel = bytes => Number(bytes) > 0 ? `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB` : '';
const alreadyAdded = attachment => saved.value[attachment.id] || (attachment.client_document_id && Number(attachment.client_document_client_id) === Number(props.ticket.client_id));
const supported = attachment => ['application/pdf', 'application/x-pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(attachment.mime_type) || (['', 'application/octet-stream'].includes(attachment.mime_type || '') && /\.pdf$/i.test(attachment.file_name || ''));
watch(() => [props.ticket.id, props.ticket.client_id], () => { choosing.value = false; results.value = []; saved.value = {}; error.value = ''; message.value = ''; });
async function search() {
  const ticketId = props.ticket.id;
  if (query.value.trim().length < 2) return;
  searching.value = true; error.value = ''; results.value = [];
  try {
    const { data } = await api.get(`/support-tickets/${ticketId}/client-search`, { params: { q: query.value.trim() }, skipGlobalLoading: true });
    if (props.ticket.id !== ticketId) return;
    results.value = data.clients || [];
    if (!results.value.length) error.value = 'No clients found. Try a different name or initials.';
  } catch (e) { if (props.ticket.id === ticketId) error.value = e.response?.data?.error?.message || 'Could not search clients.'; }
  finally { searching.value = false; }
}
async function add(attachment) {
  if (!props.canFile || busy.value || !props.ticket.client_id) return;
  if (Number(attachment.file_size) > 25 * 1024 * 1024) { error.value = 'Each file must be 25 MB or smaller.'; return; }
  const ticketId = props.ticket.id, clientId = Number(props.ticket.client_id);
  busy.value = attachment.id; error.value = ''; message.value = '';
  try {
    const { data } = await api.post(`/support-tickets/${ticketId}/attachments/${attachment.id}/add-to-client`, { clientId }, { skipGlobalLoading: true });
    if (props.ticket.id !== ticketId || Number(props.ticket.client_id) !== clientId) return;
    saved.value = { ...saved.value, [attachment.id]: data.documentId };
    message.value = data.alreadyAdded ? 'This file is already on the client profile.' : 'File added to the client’s documents.';
  } catch (e) { if (props.ticket.id === ticketId) error.value = e.response?.data?.error?.message || 'The file could not be added. Please try again.'; }
  finally { busy.value = null; }
}
</script>
<style scoped>
.ticket-attachment-filing { padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 12px; }
.attachment-row, li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 10px 0; }
.attachment-name { overflow-wrap: anywhere; text-align: left; }
button, input { font: inherit; padding: 6px 10px; border: 1px solid #94a3b8; border-radius: 6px; color: inherit; background: var(--bg-primary, white); }
button { cursor: pointer; } button:disabled { opacity: .6; cursor: default; }
label { display: grid; gap: 5px; margin: 10px 0; } ul { list-style: none; padding: 0; }
.size, .hint { color: var(--text-secondary, #475569); font-size: .85rem; }
.saved { color: #166534; } [role=alert] { color: #b42318; } [role=status] { color: #166534; }
</style>
