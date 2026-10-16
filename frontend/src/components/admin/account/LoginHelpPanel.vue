<template>
  <section class="login-help" aria-labelledby="login-help-title">
    <h4 id="login-help-title">Login help</h4>
    <p>Check this user’s account and send personalized portal links, their username, and password recovery instructions from their main agency’s Technology team.</p>
    <div class="login-help-actions">
      <button class="btn btn-secondary btn-sm" type="button" :disabled="busy || !userId" @click="run(false)">{{ busy === 'check' ? 'Checking…' : 'Check account' }}</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="busy || !userId || report?.canSend === false" @click="run(true)">{{ busy === 'send' ? 'Checking and sending…' : 'Check and email help' }}</button>
    </div>
    <p v-if="error" class="login-help-error" role="alert">{{ error }}</p>
    <p v-if="message" class="login-help-message" role="status">{{ message }}</p>
    <div v-if="report" class="login-help-report" aria-live="polite">
      <p><strong>{{ report.agency.name }}</strong> · {{ report.user.name }}</p>
      <ul class="login-help-checks">
        <li v-for="check in report.checks" :key="check.code" :class="`check-${check.status}`"><strong>{{ statusLabel(check.status) }}:</strong> {{ check.message }}</li>
      </ul>
      <p v-if="report.lastLoginAt">Last recorded successful login for this agency: {{ new Date(report.lastLoginAt).toLocaleString() }}</p>
      <p v-else>No successful login is recorded for this agency.</p>
      <dl>
        <div><dt>Username</dt><dd>{{ report.user.username || 'Not configured' }}</dd></div>
        <div><dt>Email recipient</dt><dd>{{ report.email.to || 'Not configured' }}</dd></div>
        <div><dt>From / reply to</dt><dd>{{ report.email.from || 'Not configured' }} / {{ report.email.replyTo || 'Not configured' }}</dd></div>
      </dl>
      <ul><li v-for="link in report.loginLinks" :key="link.url"><a :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }}</a></li></ul>
      <p class="login-help-limitations">{{ report.limitations }}</p>
      <p v-if="!report.canSend">Review the blocked or unavailable checks above, then run “Check account” again. No help email has been sent by this check.</p>
      <details v-if="report.email.preview"><summary>Email preview</summary><pre>{{ report.email.preview }}</pre><p>The email includes the agency’s branding and Technology signature. A private reset link is created only when sending to a password account.</p></details>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../../services/api';

const props = defineProps({ userId: { type: [Number, String], required: true }, agencyId: { type: [Number, String], default: null } });
const report = ref(null);
const busy = ref('');
const error = ref('');
const message = ref('');
let generation = 0;
const statusLabel = value => ({ ok: 'Checked', warning: 'Note', blocked: 'Needs review', unknown: 'Unavailable' }[value] || value);
watch(() => [props.userId, props.agencyId], () => { generation++; report.value = null; error.value = ''; message.value = ''; busy.value = ''; });

async function run(send) {
  if (busy.value) return;
  const requestGeneration = ++generation;
  const userId = props.userId;
  const agencyId = props.agencyId || undefined;
  busy.value = send ? 'send' : 'check'; error.value = ''; message.value = '';
  try {
    const { data } = send
      ? await api.post(`/users/${userId}/login-help/send`, { agencyId })
      : await api.get(`/users/${userId}/login-help`, { params: { agencyId } });
    if (requestGeneration !== generation) return;
    report.value = send ? data.report : data;
    if (send) message.value = {
      sent: `Login help was sent to ${data.report.email.to}. Replies go to ${data.report.email.replyTo}.`,
      queued: 'The email is queued for agency approval; it has not been sent yet.',
      already_requested: 'A help email was sent or queued in the last five minutes. No duplicate was sent.',
      needs_review: 'The checks found an issue or could not finish. No email was sent.',
      failed: 'The email was not sent. Check email delivery settings and the Communications tab before retrying.'
    }[data.outcome] || 'The request completed. Check the Communications tab for delivery status.';
  } catch (e) {
    if (requestGeneration === generation) error.value = e.response?.data?.error?.message || 'Login help could not complete. Try again or review the service status.';
  } finally { if (requestGeneration === generation) busy.value = ''; }
}
</script>

<style scoped>
.login-help { padding: 18px; margin-bottom: 18px; border: 1px solid var(--border); border-radius: 10px; }
.login-help h4 { margin: 0 0 10px; }
.login-help p, .login-help li { line-height: 1.55; }
.login-help-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.login-help-checks { padding-left: 20px; }
.login-help-checks li { margin: 7px 0; }
.check-blocked, .check-unknown, .login-help-error { color: #a32626; }
.check-warning { color: #765300; }
.login-help-message { font-weight: 600; }
.login-help-limitations { color: var(--text-secondary, #59616b); font-size: 13px; }
.login-help dl div { display: flex; gap: 12px; flex-wrap: wrap; margin: 8px 0; }
.login-help dt { font-weight: 600; min-width: 125px; }
.login-help dd { margin: 0; overflow-wrap: anywhere; }
.login-help pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.55; }
.login-help summary { cursor: pointer; font-weight: 600; }
</style>
