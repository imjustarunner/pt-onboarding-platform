<script setup>
import { computed, ref } from 'vue';
import api from '../services/api';
const props = defineProps({ ticketId: { type: String, required: true } });
const emit = defineEmits(['reviewed']);
const note = ref(''), confirmed = ref(false), busy = ref(false), error = ref(''), needsVerification = ref(false), code = ref(''), notice = ref('');
const ready = computed(() => note.value.trim().length >= 20 && confirmed.value && !busy.value);
const headers = { 'X-Account-Security': '1' };
async function recover() {
  if (!ready.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.post(`/privacy-review/tickets/${props.ticketId}/review`, { decision: 'reset', note: note.value.trim(), soleReviewerRecovery: true, confirmOwnFileAccess: true }, { headers });
    emit('reviewed'); window.dispatchEvent(new Event('account-security-changed'));
  } catch (e) {
    const problem = e.response?.data?.error;
    error.value = problem?.message || 'File access could not be restored. Your request and audit history are preserved.';
    needsVerification.value = ['MFA_REQUIRED', 'MFA_FRESH_REQUIRED'].includes(problem?.code);
  } finally { busy.value = false; }
}
async function verify() {
  if (busy.value || !/^\d{6}$/.test(code.value)) return;
  busy.value = true; error.value = '';
  try {
    await api.post('/account-security/authenticator/verify', { code: code.value, rememberDevice: false, personalDevice: false }, { headers });
    code.value = ''; needsVerification.value = false; notice.value = 'Sign-in verified. Review your reason and click Restore my file access.';
  } catch (e) { error.value = e.response?.data?.error?.message || 'Sign-in could not be verified.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="owner-file-recovery" aria-label="Sole reviewer file-access recovery">
    <strong>Restore your file access</strong>
    <p>You are the only active designated privacy reviewer. Owner recovery lets you restore your own file access after fresh sign-in verification. The audit history and normal file limits remain in place.</p>
    <form @submit.prevent="recover">
      <label>Work reason (20–1000 characters; leave out client names)<textarea v-model="note" minlength="20" maxlength="1000" rows="3" :disabled="busy" required /></label>
      <label class="recovery-confirm"><input v-model="confirmed" type="checkbox" :disabled="busy" /> I reviewed my activity logs and want to restore my file access.</label>
      <p>Use a Google sign-in from the past five minutes or a fresh authenticator verification. <router-link to="/account-security">Security &amp; sign-in settings</router-link></p>
      <button type="submit" :disabled="!ready">{{ busy ? 'Checking…' : 'Restore my file access' }}</button>
    </form>
    <form v-if="needsVerification" @submit.prevent="verify">
      <label>Fresh authenticator code<input v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" :disabled="busy" required /></label>
      <button type="submit" :disabled="busy || !/^\d{6}$/.test(code)">Verify sign-in</button>
    </form>
    <p v-if="error" role="alert" class="recovery-error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
<style scoped>
.owner-file-recovery{margin-top:12px;padding:12px;border:1px solid #a8c9b8;border-radius:8px;background:var(--bg-primary,#fff);color:var(--text-primary,#213547)}p{font-size:13px;line-height:1.5}label{display:grid;gap:6px;margin:10px 0;font-size:13px}.recovery-confirm{display:flex;align-items:flex-start;gap:8px}textarea,input:not([type=checkbox]){font:inherit;box-sizing:border-box;width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-primary,#fff);color:inherit}button{padding:8px 12px;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-secondary,#f1f5f9);color:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:default}.recovery-error{color:#a12318}
</style>
