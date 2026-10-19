<template>
  <section id="my-quick-view-access" class="account-quick-view" aria-label="Quick View six-digit code" data-search-private>
    <QuickViewPrivacyPanel />
  </section>
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
import QuickViewPrivacyPanel from '../account/QuickViewPrivacyPanel.vue';
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

<style scoped>
.account-quick-view {
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-card, #fff);
}
</style>
