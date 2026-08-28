<template>
  <div class="smc">
    <div v-if="loading" class="pad">Opening secure message…</div>
    <div v-else-if="error" class="err">{{ error }}</div>
    <div v-else class="pad">
      <h1>Secure message</h1>
      <p>Redirecting you to your message…</p>
      <p v-if="redirectUrl"><a :href="redirectUrl">Continue</a></p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const loading = ref(true);
const error = ref('');
const redirectUrl = ref('');

onMounted(async () => {
  try {
    const token = String(route.params.token || '');
    const { data } = await axios.get(`/api/public/secure-message/${encodeURIComponent(token)}`);
    redirectUrl.value = data.setupUrl || data.loginUrl || data.targetPath || '/';
    if (redirectUrl.value) {
      window.location.href = redirectUrl.value;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'This secure message link is invalid or expired.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.smc { min-height: 60vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
.pad { padding: 24px; max-width: 420px; text-align: center; }
.err { color: #b91c1c; padding: 24px; }
</style>
