<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ clientId: { type: [Number, String], required: true }, guardian: Boolean });
const notifications = ref([]);
const loading = ref(false);
const error = ref('');
const hasMore = ref(false);
let nextOffset = 0;
let request = 0;
async function load(more = false) {
  const current = ++request;
  if (!props.clientId) { notifications.value = []; return; }
  loading.value = true; error.value = '';
  try {
    const base = props.guardian ? '/guardian-portal/clients' : '/clients';
    const { data } = await api.get(`${base}/${props.clientId}/notification-history`, { params: { offset: more ? nextOffset : 0 }, skipGlobalLoading: true });
    if (current === request) { notifications.value = more ? [...notifications.value, ...(data.notifications || [])] : data.notifications || []; hasMore.value = !!data.hasMore; nextOffset = data.nextOffset || 0; }
  } catch { if (current === request) error.value = 'Notification history could not be loaded.'; }
  finally { if (current === request) loading.value = false; }
}
watch(() => props.clientId, () => { notifications.value = []; load(); }, { immediate: true });
</script>
<template>
  <section class="shared-notifications">
    <header><h3>Shared notification history</h3><button type="button" :disabled="loading" @click="load(false)">Refresh</button></header>
    <p>Guardians with account access see the same delivery history, including reminders sent to additional contacts, across every organization.</p>
    <p v-if="loading" role="status">Loading notifications…</p><p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!notifications.length">No notifications have been sent for this client yet.</p>
    <ol v-else><li v-for="item in notifications" :key="item.id"><div><strong>{{ String(item.type || 'Notification').replaceAll('_', ' ') }}</strong><span>{{ item.organization || 'Your organization' }} · {{ item.channel }} · {{ item.status }}</span></div><div><span>To {{ item.recipient || 'Account contact' }}</span><time>{{ new Date(item.occurredAt).toLocaleString() }}</time></div></li></ol>
    <button v-if="hasMore" type="button" :disabled="loading" @click="load(true)">Load older notifications</button>
  </section>
</template>
<style scoped>
.shared-notifications { padding: 20px; margin: 20px 0; border: 1px solid var(--conversa-border, #dce5f0); border-radius: 12px; background: var(--conversa-surface, #fff); color: var(--conversa-ink, #172d50); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; } h3 { margin: 0; font-size: 17px; } p { font-size: 13px; line-height: 1.6; color: var(--conversa-muted, #627087); }
button { padding: 7px 12px; border: 1px solid var(--conversa-border, #dce5f0); border-radius: 7px; background: transparent; color: inherit; cursor: pointer; } ol { list-style: none; padding: 0; max-height: 440px; overflow: auto; } li { display: flex; justify-content: space-between; gap: 20px; padding: 12px 0; border-top: 1px solid var(--conversa-border, #dce5f0); font-size: 12px; overflow-wrap: anywhere; } li strong { text-transform: capitalize; } li span, time { display: block; margin-top: 4px; color: var(--conversa-muted, #627087); }
@media(max-width:600px) { li { flex-direction: column; gap: 4px; } }
</style>
