<template>
  <main class="agreements">
    <h1>Your supervision agreements</h1>
    <p>Review and sign your individual supervision agreements here. Your meeting stays open in its original tab.</p>
    <p v-if="loading" role="status">Loading agreements…</p>
    <p v-if="error" role="alert">{{ error }} <button @click="load">Retry</button></p>
    <SupervisionAgreementCard v-for="agreement in agreements" :key="agreement.id" :agreement="agreement" @signed="load" />
    <p v-if="!loading && !error && !agreements.length">No individual supervision agreements are assigned to your account.</p>
  </main>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';
import SupervisionAgreementCard from '../../components/supervision/SupervisionAgreementCard.vue';
const agreements = ref([]), loading = ref(false), error = ref('');
async function load() {
  loading.value = true; error.value = '';
  try { const { data } = await api.get('/supervision/agreements', { params: { userId: 'me' } }); agreements.value = data.agreements || []; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Unable to load your agreements.'; }
  finally { loading.value = false; }
}
onMounted(load);
</script>
<style scoped>.agreements { max-width: 960px; margin: 24px auto; padding: 20px; } h1 { margin-bottom: 16px; }</style>
