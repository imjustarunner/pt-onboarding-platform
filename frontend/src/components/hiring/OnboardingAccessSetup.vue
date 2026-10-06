<template>
  <section class="access-setup">
    <h3>Accounts and access</h3>
    <p>Prepare the employee’s account details here. These are also available in Lifecycle. Employees can view saved account passwords again in their onboarding portal and, after activation, My Dashboard → My Account → Accounts & access.</p>
    <p v-if="loading">Loading account details…</p>
    <form v-else-if="loaded" @submit.prevent="save" autocomplete="off">
      <label>Platform work address<input :value="workspaceEmail || 'Employee chooses during onboarding'" disabled /></label>
      <p>Employees use their personal portal link and set a platform password during onboarding.</p>
      <label class="access-toggle"><input v-model="values.workspaceEnabled" type="checkbox" />Include a Google Workspace / SSO account for this employee</label>
      <label class="access-toggle"><input v-model="values.therapynotesEnabled" type="checkbox" />Include TherapyNotes access while our agency uses it</label>
      <label v-for="field in visibleFields" :key="field.key">{{ field.label }}<input v-model="values[field.key]" :type="field.secret ? 'password' : 'text'" :name="`employee-${userId}-${field.key}`" :autocomplete="field.secret ? 'new-password' : 'off'" data-1p-ignore data-lpignore="true" /></label>
      <button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save account details' }}</button>
    </form>
    <p v-if="message" role="status">{{ message }}</p><p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';
const props = defineProps({ userId: { type: Number, required: true } });
const fields = [
  { key: 'workspaceTempPassword', label: 'Google Workspace temporary password (if provided)', secret: true, system: 'workspaceEnabled' },
  { key: 'grasshopperLogin', label: 'Grasshopper login' },
  { key: 'grasshopperExtension', label: 'Grasshopper extension' },
  { key: 'grasshopperPin', label: 'Grasshopper PIN', secret: true },
  { key: 'therapynotesLogin', label: 'TherapyNotes username', system: 'therapynotesEnabled' },
  { key: 'therapynotesTempPassword', label: 'TherapyNotes temporary password', secret: true, system: 'therapynotesEnabled' }
];
const values = ref({}), workspaceEmail = ref(''), loading = ref(true), loaded = ref(false), saving = ref(false), message = ref(''), error = ref('');
const visibleFields = computed(() => fields.filter(field => !field.system || values.value[field.system]));
onMounted(async () => {
  try { const { data } = await api.get(`/users/${props.userId}/lifecycle`); const credentials = data.onboarding?.credentials || {}; workspaceEmail.value = credentials.workspaceEmail || ''; values.value = { ...Object.fromEntries(fields.map(field => [field.key, credentials[field.key] || ''])), workspaceEnabled: credentials.workspaceEnabled ?? !!credentials.workspaceTempPassword, therapynotesEnabled: credentials.therapynotesEnabled ?? !!(credentials.therapynotesLogin || credentials.therapynotesTempPassword) }; loaded.value = true; }
  catch { error.value = 'Could not load account details. Please reopen onboarding setup.'; }
  finally { loading.value = false; }
});
async function save() {
  if (!loaded.value) { error.value = 'Load account details before continuing.'; return false; }
  saving.value = true; message.value = ''; error.value = '';
  try { const payload = { workspaceEnabled: values.value.workspaceEnabled, therapynotesEnabled: values.value.therapynotesEnabled, ...Object.fromEntries(visibleFields.value.map(field => [field.key, values.value[field.key]])) }; await api.patch(`/users/${props.userId}/lifecycle/credentials`, payload); message.value = 'Account details saved.'; return true; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Could not save account details.'; return false; }
  finally { saving.value = false; }
}
defineExpose({ save });
</script>
<style scoped>.access-setup{padding:16px;border:1px solid #d5e2dd;border-radius:8px;margin-bottom:20px}.access-setup form{display:grid;gap:12px}.access-setup label{display:grid;gap:5px}.access-setup input{padding:10px;border:1px solid #bdccc6;border-radius:5px;font:inherit}.access-setup button{padding:12px;background:#086553;color:white;border:0;border-radius:5px}.access-setup .access-toggle{display:flex;align-items:center;gap:10px}.access-toggle input{width:auto}</style>
