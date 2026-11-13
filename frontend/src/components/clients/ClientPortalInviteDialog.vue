<template>
  <div class="invite-backdrop">
    <section class="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="portal-invite-title">
      <h2 id="portal-invite-title">Invite clients to their portal</h2>
      <p>{{ clientIds.length }} selected clients. Each authorized account receives one invitation per portal, including accounts shared by siblings.</p>
      <p>Select the specific account(s) you intend to invite. Invitations ask recipients to set up their account and complete notification preferences. Text enrollment remains their choice.</p>
      <p v-if="loading" role="status">Checking recipients…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <ul class="invite-recipients">
        <li v-for="recipient in recipients" :key="recipient.key">
          <label><input v-model="selected" type="checkbox" :value="recipient.key" :disabled="sending || !!results[recipient.key]" />
            <strong>{{ recipient.name || recipient.email }}</strong> — {{ recipient.email }}
          </label>
          <small>{{ recipient.portalName }}</small>
          <small v-if="recipient.kind === 'own_enrollment'">Retry existing own-enrollment invitation {{ recipient.invitationId }} — recorded {{ recipient.deliveryStatus }}. Existing portal restrictions stay in place.</small>
          <small>{{ recipient.clients.map(c => c.label).join(', ') }}</small>
          <span v-if="results[recipient.key]" role="status">{{ results[recipient.key] }}</span>
        </li>
      </ul>
      <p v-if="!loading && !error && !recipients.length">No eligible recipients. Add or update portal contacts in the client profile, then try again.</p>
      <details v-if="skipped.length" open><summary>{{ skipped.length }} clients need attention</summary>
        <ul><li v-for="(client, index) in skipped" :key="`${client.clientId}:${index}`">{{ client.label }}: {{ client.reason }}</li></ul>
      </details>
      <p v-if="sentCount" role="status">{{ sentCount }} invitations sent.</p>
      <p v-if="finished">Delivery results are shown above. For an uncertain delivery, check email history before sending another invitation.</p>
      <footer>
        <button type="button" class="btn btn-secondary" :disabled="sending" @click="$emit('close')">Close</button>
        <button v-if="needsRefresh || error" type="button" class="btn btn-secondary" :disabled="sending || loading" @click="load">Refresh preview</button>
        <button type="button" class="btn btn-primary" :disabled="loading || sending || !pending.length" @click="send">
          {{ sending ? 'Sending invitations…' : `Send ${pending.length} invitations` }}
        </button>
      </footer>
    </section>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
const props = defineProps({ clientIds: { type: Array, required: true } });
defineEmits(['close']);
const loading = ref(false), sending = ref(false), error = ref(''), recipients = ref([]), skipped = ref([]), selected = ref([]), results = ref({}), finished = ref(false), needsRefresh = ref(false);
const staleKeys = new Set();
const pending = computed(() => recipients.value.filter(r => selected.value.includes(r.key) && !results.value[r.key]));
const sentCount = computed(() => Object.values(results.value).filter(status => status === 'Sent' || status.startsWith('Sent Invitation ')).length);
async function load() {
  loading.value = true; error.value = '';
  try {
    const { data } = await api.post('/clients/portal-invites/preview', { clientIds: props.clientIds });
    recipients.value = data.recipients; skipped.value = data.skipped; selected.value = [];
    for (const key of staleKeys) delete results.value[key];
    staleKeys.clear(); needsRefresh.value = false;
  } catch (e) { error.value = e.response?.data?.error?.message || 'Recipients could not be loaded.'; }
  finally { loading.value = false; }
}
async function send() {
  if (sending.value) return;
  const batch = [...pending.value]; sending.value = true;
  for (const recipient of batch) {
    try {
      const { data } = await api.post('/clients/portal-invites/send', { clientIds: recipient.clients.map(c => c.clientId), recipientKey: recipient.key, recipientSnapshot: recipient.snapshot });
      results.value[recipient.key] = ({ sent: 'Sent', queued: 'Queued for email approval',
        failed: 'Not sent — a failed delivery was recorded. Review the invitation history before retrying.',
        skipped: 'Not sent — email delivery was blocked or skipped. Check email history.',
        redirected: 'Redirected to the configured test inbox',
        unconfirmed: 'Delivery could not be confirmed. Check email history before retrying.' })[data.status]
        || 'Delivery could not be confirmed. Check email history before retrying.';
      if (data.invitationId) results.value[recipient.key] += ` Invitation ${data.invitationId}${data.deliveryAttemptId ? `, delivery attempt ${data.deliveryAttemptId}` : ''}.`;
    } catch (e) {
      const changed = e.response?.status === 409 && e.response?.data?.error?.code === 'PORTAL_INVITATION_PREVIEW_CHANGED';
      if (changed) { staleKeys.add(recipient.key); needsRefresh.value = true; }
      results.value[recipient.key] = changed ? 'Not sent — the recipient or invitation changed. Refresh the preview and select the intended recipient again.'
        : e.response?.data?.error?.message || 'Delivery could not be confirmed. Check email history before retrying.';
    }
  }
  sending.value = false; finished.value = true;
}
onMounted(load);
</script>
<style scoped>
.invite-backdrop{position:fixed;inset:0;background:#10213b99;z-index:2000;display:grid;place-items:center;padding:20px}.invite-dialog{background:white;color:#233653;border-radius:14px;padding:24px;width:min(720px,100%);max-height:90vh;overflow:auto}.invite-dialog h2{margin-top:0}.invite-dialog p{line-height:1.6}.invite-recipients{list-style:none;padding:0}.invite-recipients li{padding:12px 0;border-bottom:1px solid #dce4ee}.invite-recipients small,.invite-recipients li>span{display:block;margin:6px 0 0 24px}.invite-dialog footer{display:flex;justify-content:flex-end;gap:12px;margin-top:20px}
</style>
