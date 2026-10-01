<template>
  <section class="access-setup">
    <h3>Accounts and access</h3>
    <p>Prepare the employee’s account details here. These are also available in Lifecycle. Temporary passwords are shown once in the employee portal.</p>
    <p v-if="loading">Loading account details…</p>
    <form v-else-if="loaded" @submit.prevent="save">
      <label>Work address<input :value="workspaceEmail || 'Employee chooses during onboarding'" disabled /></label>
      <label v-for="field in fields" :key="field.key">{{ field.label }}<input v-model="values[field.key]" :type="field.secret ? 'password' : 'text'" autocomplete="off" /></label>
      <button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save account details' }}</button>
    </form>
    <p v-if="message" role="status">{{ message }}</p><p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';
const props = defineProps({ userId: { type: Number, required: true } });
const fields = [
  { key: 'workspaceTempPassword', label: 'Workspace temporary password', secret: true },
  { key: 'grasshopperLogin', label: 'Grasshopper login' },
  { key: 'grasshopperExtension', label: 'Grasshopper extension' },
  { key: 'grasshopperPin', label: 'Grasshopper PIN', secret: true },
  { key: 'therapynotesLogin', label: 'TherapyNotes username' },
  { key: 'therapynotesTempPassword', label: 'TherapyNotes temporary password', secret: true }
];
const values = ref({}), workspaceEmail = ref(''), loading = ref(true), loaded = ref(false), saving = ref(false), message = ref(''), error = ref('');
onMounted(async () => {
  try { const { data } = await api.get(`/users/${props.userId}/lifecycle`); const credentials = data.onboarding?.credentials || {}; workspaceEmail.value = credentials.workspaceEmail || ''; values.value = Object.fromEntries(fields.map(field => [field.key, credentials[field.key] || ''])); loaded.value = true; }
  catch { error.value = 'Could not load account details. Please reopen onboarding setup.'; }
  finally { loading.value = false; }
});
async function save() {
  if (!loaded.value) return;
  saving.value = true; message.value = ''; error.value = '';
  try { await api.patch(`/users/${props.userId}/lifecycle/credentials`, values.value); message.value = 'Account details saved.'; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Could not save account details.'; }
  finally { saving.value = false; }
}
</script>
<style scoped>.access-setup{padding:16px;border:1px solid #d5e2dd;border-radius:8px;margin-bottom:20px}.access-setup form{display:grid;gap:12px}.access-setup label{display:grid;gap:5px}.access-setup input{padding:10px;border:1px solid #bdccc6;border-radius:5px;font:inherit}.access-setup button{padding:12px;background:#086553;color:white;border:0;border-radius:5px}</style>
