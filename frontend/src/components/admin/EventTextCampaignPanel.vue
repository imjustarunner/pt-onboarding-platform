<template>
  <section class="event-texts">
    <h4>Event texts and responses</h4>
    <p v-if="recipientScope !== 'attendees'" class="hint">Campaign 2 · Replies express interest for coordinator review. Staff are assigned separately.</p>
    <p v-else class="hint">Event updates go to registered attendees who consented to texts. Service programs use Campaign 1; company events use Campaign 2.</p>
    <p v-if="!event.id">Save the event to prepare a message.</p>
    <template v-else>
      <div class="settings-grid">
        <label>Message type<select v-model="mode" :disabled="recipientScope === 'attendees'"><option value="recruitment">Looking for help</option><option value="message">Event update</option></select></label>
        <label>Recipients<select v-model="recipientScope"><option value="audience">Staff event audience</option><option value="outreach_due">Staff with remaining calendar-year outreach commitments</option><option v-if="event.attendeeSmsEnabled" value="attendees">Consenting registered attendees</option></select></label>
      </div>
      <p v-if="recipientScope === 'outreach_due'" class="hint">Uses signed amendment commitments and recorded outreach time for the calendar year.</p>
      <label>{{ mode === 'recruitment' ? 'Additional details (optional)' : 'Message' }}<textarea v-model.trim="message" rows="3" maxlength="1200" /></label>
      <label v-if="recipientScope !== 'attendees'"><input v-model="sendInApp" type="checkbox" /> Also send an in-app notification</label>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="busy || (mode === 'message' && !message)" @click="prepare">Preview recipients and text</button>
      <div v-if="preview" class="preview">
        <strong>Message preview</strong>
        <pre>{{ preview.body }}</pre>
        <p>{{ preview.eligibleCount }} eligible · {{ preview.skippedCount }} skipped · {{ preview.recipientCount }} considered</p>
        <p v-if="preview.outreachAudit?.unrecognizedTermsCount" role="status">{{ preview.outreachAudit.unrecognizedTermsCount }} signed commitment{{ preview.outreachAudit.unrecognizedTermsCount === 1 ? '' : 's' }} could not be interpreted automatically. Review these amendments before relying on this recipient list.</p>
        <p v-if="preview.outreachAudit?.limitation" class="hint">{{ preview.outreachAudit.limitation }}</p>
        <ul v-if="Object.keys(preview.reasons || {}).length"><li v-for="(count, reason) in preview.reasons" :key="reason">{{ readable(reason) }}: {{ count }}</li></ul>
        <p v-if="!preview.senderReady" role="status">Text sending is unavailable until the campaign number is ready.</p>
        <button type="button" class="btn btn-primary btn-sm" :disabled="busy || !preview.senderReady || !preview.eligibleCount" @click="send">{{ busy ? 'Sending…' : `Send text to ${preview.eligibleCount} recipient${preview.eligibleCount === 1 ? '' : 's'}` }}</button>
      </div>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <div class="results-heading"><h4>Delivery and replies</h4><button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="loadResults">Refresh results</button></div>
      <div v-if="campaign" class="results">
        <p v-if="campaign.eventCode">Reply {{ campaign.eventCode }} to stop texts about this event. STOP stops the texting program named in the message.</p>
        <p>{{ campaign.summary?.queued || 0 }} queued · {{ campaign.summary?.sent || 0 }} sent · {{ campaign.summary?.delivered || 0 }} delivered · {{ campaign.summary?.failed || 0 }} failed · {{ campaign.summary?.interested || 0 }} interested · {{ campaign.summary?.muted || 0 }} muted</p>
        <div v-if="campaign.batches?.length" class="table-scroll">
          <table><caption>Results by text campaign</caption><thead><tr><th>Sent</th><th>Type</th><th>Recipients</th><th>Delivered</th><th>Failed / skipped</th><th>Replies / interested</th></tr></thead><tbody><tr v-for="batch in campaign.batches" :key="batch.id"><td>{{ dateLabel(batch.createdAt) }}</td><td>{{ readable(batch.dispatchType) }}</td><td>{{ batch.recipients }}</td><td>{{ batch.delivered }}</td><td>{{ batch.failed }} / {{ batch.skipped }}</td><td>{{ batch.responses }} / {{ batch.interested }}</td></tr></tbody></table>
        </div>
        <div class="table-scroll"><table v-if="campaign.deliveries?.length"><thead><tr><th>Recipient</th><th>Sent</th><th>Delivery</th><th>Reply</th></tr></thead><tbody><tr v-for="delivery in campaign.deliveries" :key="delivery.id"><td>{{ delivery.name || delivery.phone || 'Recipient' }}</td><td>{{ dateLabel(delivery.createdAt) }}</td><td>{{ readable(delivery.status) }}<span v-if="delivery.statusReason"> · {{ readable(delivery.statusReason) }}</span></td><td>{{ delivery.responseKey || '—' }}</td></tr></tbody></table></div>
        <p v-if="!campaign.deliveries?.length" class="hint">No texts have been recorded for this event.</p>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true }, event: { type: Object, required: true } });
const mode = ref('recruitment');
const recipientScope = ref('audience');
const message = ref('');
const sendInApp = ref(true);
const preview = ref(null);
const campaign = ref(null);
const busy = ref(false);
const error = ref('');
const notice = ref('');
let previewGeneration = 0;
const endpoint = () => `/agencies/${props.agencyId}/company-events/${props.event.id}`;
const payload = () => ({ mode: mode.value, recipientScope: recipientScope.value, message: message.value });
const readable = (value) => String(value || '').replaceAll('_', ' ');
const dateLabel = (value) => value ? new Date(value).toLocaleString() : '—';
async function prepare() {
  const generation = ++previewGeneration;
  busy.value = true; error.value = ''; notice.value = ''; preview.value = null;
  try { const { data } = await api.post(`${endpoint()}/sms-preview`, payload()); if (generation === previewGeneration) preview.value = data; }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not prepare the text preview.'; }
  finally { busy.value = false; }
}
async function send() {
  if (!preview.value?.senderReady || !preview.value?.eligibleCount || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const { data } = await api.post(`${endpoint()}/send-direct-message`, { ...payload(), sendSms: true, sendInApp: recipientScope.value === 'attendees' ? false : sendInApp.value });
    notice.value = `${data.smsCount || 0} texts sent; ${data.smsSkippedCount || 0} skipped; ${data.smsFailedCount || 0} failed.`;
    preview.value = null;
    await loadResults();
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not send event texts.'; }
  finally { busy.value = false; }
}
async function loadResults() {
  if (!props.event.id) return;
  try { const { data } = await api.get(`${endpoint()}/delivery-logs`); campaign.value = data?.smsCampaign || null; }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not load text results.'; }
}
watch(recipientScope, value => { if (value === 'attendees') mode.value = 'message'; });
watch([mode, recipientScope, message, sendInApp], () => { previewGeneration += 1; preview.value = null; });
watch(() => [props.event.id, props.event.staffAudienceScope], () => {
  previewGeneration += 1; preview.value = null; campaign.value = null; error.value = ''; notice.value = '';
  const type = String(props.event.eventType || props.event.category || '').toLowerCase();
  recipientScope.value = props.event.staffAudienceScope || (type.startsWith('school_') || type.includes('outreach') ? 'outreach_due' : 'audience');
  void loadResults();
}, { immediate: true });
</script>

<style scoped>
.event-texts { border: 1px solid #d8dee8; border-radius: 8px; padding: 14px; margin: 14px 0; } h4 { margin: 0 0 10px; }
.hint { color: #64748b; font-size: 12px; line-height: 1.5; } label { display: block; margin: 10px 0; font-size: 14px; }
select, textarea { display: block; box-sizing: border-box; width: 100%; margin-top: 5px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; }
.settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.preview { margin-top: 12px; padding: 12px; background: #f1f5f9; border-radius: 6px; } pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
.results-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; gap: 10px; }
.table-scroll { overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 12px; } th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; }
caption { text-align: left; font-weight: 600; padding: 12px 8px 8px; }
.error { color: #b91c1c; }
</style>
