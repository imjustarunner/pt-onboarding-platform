<script setup>
import { downloadAttachment } from '../../utils/communicationAttachments';
import { ref, watch } from 'vue';
import api from '../../services/api';
import SecureMessageBanner from './SecureMessageBanner.vue';
const props = defineProps({ clientId: { type: [Number, String], required: true } });
const records = ref([]); const selected = ref(null); const events = ref([]);
const error = ref(''); const loading = ref(false); const hasMore = ref(false);
let request = 0;
async function load(older = false) {
  const current = ++request; loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/clients/${props.clientId}/secure-messages`, { params: older ? { beforeId: records.value.at(-1)?.id } : {}, skipGlobalLoading: true });
    if (current === request) { records.value = older ? [...records.value, ...data.records] : data.records; hasMore.value = data.hasMore; }
  } catch { if (current === request) error.value = 'Secure message records could not be loaded.'; }
  finally { if (current === request) loading.value = false; }
}
async function open(record) {
  const current = ++request; loading.value = true; error.value = ''; selected.value = null;
  try {
    const { data } = await api.get(`/clients/${props.clientId}/secure-messages/${record.message_id}`, { skipGlobalLoading: true });
    if (current === request) { selected.value = data.message; events.value = data.events; }
  } catch { if (current === request) error.value = 'This secure message could not be opened.'; }
  finally { if (current === request) loading.value = false; }
}
watch(() => props.clientId, () => { selected.value = null; records.value = []; if (props.clientId) load(); }, { immediate: true });
</script>
<template>
  <section class="secure-records">
    <h3>Secure messages · Medical record</h3>
    <p>Shared messages from guardians and the authorized care team are retained here, including messages hidden from a personal inbox.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Loading secure records…</p>
    <div v-if="selected" class="secure-records__message"><button type="button" @click="selected = null">Back to secure records</button><SecureMessageBanner shared /><p><strong>{{ selected.senderName }}</strong> · {{ new Date(selected.createdAt).toLocaleString() }}</p><p>Shared with {{ selected.recipients.map((p) => p.name).join(', ') }}</p><h4 v-if="selected.subject">{{ selected.subject }}</h4><div class="secure-records__body">{{ selected.body }}</div><div v-if="selected.attachments?.length"><button v-for="a in selected.attachments" :key="a.id" type="button" @click="downloadAttachment(a.downloadPath, a.original_filename)">{{ a.original_filename || 'Secure attachment' }}</button></div><details><summary>Message activity</summary><ol><li v-for="event in events" :key="event.id">{{ event.event_type.replaceAll('_', ' ') }} · {{ event.actor_name || 'Notification visitor' }} · {{ new Date(event.created_at).toLocaleString() }}</li></ol></details></div>
    <template v-else><p v-if="!loading && !records.length">No secure messages in this client's record yet.</p><ol><li v-for="record in records" :key="record.id"><button type="button" @click="open(record)"><strong>Secure message</strong> · {{ record.sender_name }} · {{ new Date(record.created_at).toLocaleString() }}<span>Open securely →</span></button></li></ol><button v-if="hasMore" type="button" :disabled="loading" @click="load(true)">Older messages</button></template>
  </section>
</template>
<style scoped>
.secure-records { padding: 20px; margin: 20px 0; border: 1px solid var(--conversa-border, #dce5f0); border-radius: 12px; background: var(--conversa-surface, #fff); } h3 { margin: 0; font-size: 17px; } p { font-size: 13px; line-height: 1.6; color: var(--conversa-muted, #627087); } ol { list-style: none; padding: 0; } li { margin: 8px 0; font-size: 12px; } button { padding: 10px 14px; border: 1px solid var(--conversa-border, #dce5f0); border-radius: 8px; color: var(--conversa-ink, #172d50); background: transparent; cursor: pointer; text-align: left; } li button { width: 100%; } li span { display: block; margin-top: 5px; color: var(--conversa-blue, #0047b3); } .secure-records__body { padding: 20px 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; } details { border-top: 1px solid var(--conversa-border, #dce5f0); padding-top: 14px; }
</style>
