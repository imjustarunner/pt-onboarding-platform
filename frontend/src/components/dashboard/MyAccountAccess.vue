<template>
  <p v-if="loading" role="status">Loading your account details…</p>
  <div v-else>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
    <HireAccountAccess v-if="packet" :packet="packet" :revealed-passwords="revealedPasswords" :show-acknowledgement="false" employee @reveal="reveal" />
  </div>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';
import HireAccountAccess from '../prehire/HireAccountAccess.vue';
const packet = ref(null), loading = ref(true), error = ref(''), revealedPasswords = ref({});
async function load() {
  error.value = '';
  try { packet.value = (await api.get('/users/me/account-access')).data.credentialPacket; }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not load your account details.'; }
  finally { loading.value = false; }
}
async function reveal(systemKey) {
  error.value = '';
  try {
    const { data } = await api.post(`/users/me/account-access/systems/${systemKey}/reveal-temp-password`);
    if (data.revealed) revealedPasswords.value[systemKey] = data.password;
    await load();
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not reveal the temporary password.'; }
}
onMounted(load);
</script>
