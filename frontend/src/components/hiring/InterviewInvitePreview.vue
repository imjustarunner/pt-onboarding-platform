<template>
  <div class="invite-review">
    <strong>Review the invitation</strong>
    <p>The candidate receives the lobby link. Assigned interviewers sign in on that link to see the candidate brief, guide, and team workspace.</p>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="loading || !candidateUserId" @click="preview">{{ loading ? 'Preparing preview…' : 'Preview branded email & sender' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="email">
      <dl><dt>From</dt><dd>{{ email.fromDisplay }} &lt;{{ email.from }}&gt;</dd><dt>To</dt><dd>{{ email.to }}</dd><dt>Subject</dt><dd>{{ email.subject }}</dd></dl>
      <p v-if="email.attachments?.length">Attachments: {{ email.attachments.join(', ') }}</p>
      <iframe title="Interview invitation email preview" :srcdoc="email.html" sandbox="" />
      <p>The working interview link is added when you create the meeting.</p>
    </template>
  </div>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: [Number, String], candidateUserId: [Number, String], title: String, startsAt: String, timezone: String, interviewerUserIds: Array });
const loading = ref(false);
const error = ref('');
const email = ref(null);
watch(() => [props.agencyId, props.candidateUserId, props.title, props.startsAt, props.timezone, props.interviewerUserIds], () => { email.value = null; error.value = ''; }, { deep: true });
async function preview() {
  loading.value = true; error.value = ''; email.value = null;
  try { const r = await api.post('/hiring/interview-hub/invite-preview', { ...props }); email.value = r.data.data; }
  catch (e) { error.value = e.response?.data?.error?.message || e.response?.data?.message || 'Could not prepare the invitation preview.'; }
  finally { loading.value = false; }
}
</script>
<style scoped>
.invite-review { background: #f2f8f5; border: 1px solid #c8ddd2; border-radius: 12px; padding: 16px; color: #163e30; }
p, dd, dt { font-size: 13px; line-height: 1.5; }
dl { display: grid; grid-template-columns: 65px minmax(0, 1fr); gap: 5px; }
dd { margin: 0; overflow-wrap: anywhere; }
dt { font-weight: 700; }
iframe { width: 100%; height: 460px; border: 1px solid #d5dfda; border-radius: 8px; background: white; }
</style>
