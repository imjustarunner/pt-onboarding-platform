<template>
  <div class="smc conversa-surface">
    <div class="pad">
      <ConversaBrand heading="h1" compact />
      <SecureMessageBanner opening />
      <p v-if="loading" role="status">Checking your secure link…</p>
      <p v-else-if="error" class="err" role="alert">{{ error }}</p>
      <template v-else>
        <p>Your message is ready to open securely.</p>
        <a v-if="redirectUrl" class="secure-continue" :href="redirectUrl">Continue to secure message</a>
        <p class="secure-note">The message itself is only shown after your access is verified.</p>
      </template>
    </div>
  </div>
</template>

<script setup>
import ConversaBrand from '../components/conversa/ConversaBrand.vue';
import SecureMessageBanner from '../components/conversa/SecureMessageBanner.vue';
import { useAuthStore } from '../store/auth';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const authStore = useAuthStore();
const loading = ref(true);
const error = ref('');
const redirectUrl = ref('');

onMounted(async () => {
  try {
    const token = String(route.params.token || '');
    const { data } = await axios.get(`/api/public/secure-message/${encodeURIComponent(token)}`);
    redirectUrl.value = authStore.isAuthenticated && Number(authStore.user?.id) === Number(data.userId)
      ? data.targetPath : data.setupUrl || data.loginUrl || '/';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'This secure message link is invalid or expired.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.smc { min-height: 80vh; display: grid; place-items: center; padding: 24px; background: var(--conversa-wash); }
.pad { padding: 32px; width: 100%; max-width: 520px; box-sizing: border-box; border: 1px solid var(--conversa-border); border-radius: 20px; background: var(--conversa-surface); box-shadow: 0 16px 48px #0f2d6b10; }
.err { color: var(--conversa-rose); }
.secure-continue { display: block; padding: 13px 18px; margin-top: 24px; text-align: center; border-radius: 9px; color: white; background: #0f2d6b; font-weight: 600; text-decoration: none; }
.secure-note { font-size: 12px; line-height: 1.6; color: var(--conversa-muted); }
</style>
