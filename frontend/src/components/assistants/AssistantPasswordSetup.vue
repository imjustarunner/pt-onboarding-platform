<template>
  <section class="password-panel" aria-labelledby="assistant-password-heading">
    <h2 id="assistant-password-heading">Set {{ account.displayName }} password</h2>
    <p>{{ account.agencyName }} · <strong>{{ account.email }}</strong></p>
    <p>Choose a unique app password of 16–200 characters. Saving it signs this assistant out of existing sessions.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <form @submit.prevent="save">
      <label>New app password
        <input v-model="password" type="password" autocomplete="new-password" minlength="16" maxlength="200" required />
      </label>
      <label>Confirm new password
        <input v-model="confirmation" type="password" autocomplete="new-password" minlength="16" maxlength="200" required />
      </label>
      <button type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Save password' }}</button>
    </form>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ account: { type: Object, required: true } });
const emit = defineEmits(['saved']);
const password = ref(''), confirmation = ref(''), busy = ref(false), error = ref(''), message = ref('');
watch(() => props.account.id, () => { password.value = ''; confirmation.value = ''; error.value = ''; message.value = ''; });

async function save() {
  if (busy.value) return;
  error.value = ''; message.value = '';
  if (password.value.length < 16 || password.value.length > 200) { error.value = 'Use a password of 16–200 characters.'; return; }
  if (password.value !== confirmation.value) { error.value = 'The passwords do not match.'; return; }
  busy.value = true;
  try {
    await api.patch(`/assistant-accounts/${props.account.id}`, {
      newPassword: password.value,
      reason: 'Owner set the assistant account password.'
    });
    password.value = ''; confirmation.value = '';
    message.value = 'Password saved. Use the displayed username and your new password to sign in.';
    emit('saved');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'The password could not be saved. Try again.';
  } finally { busy.value = false; }
}
</script>

<style scoped>
.password-panel{background:var(--card-bg,#fff);padding:24px;border:1px solid #bdd5cb;border-radius:12px;margin-bottom:22px;scroll-margin-top:24px}
h2{font-size:21px;margin:0 0 14px}p{font-size:14px;line-height:1.6;overflow-wrap:anywhere}form{display:grid;gap:16px;max-width:520px}label{display:grid;gap:7px;font-size:14px;font-weight:600}input{font:inherit;padding:10px;border:1px solid #bdced6;border-radius:6px;box-sizing:border-box;width:100%;min-width:0}button{justify-self:start;background:#245f56;border:0;border-radius:6px;color:#fff;padding:10px 13px;cursor:pointer;font-weight:600}button:disabled{opacity:.5}[role=alert]{color:#8b2929}[role=status]{color:#245f56}
</style>
