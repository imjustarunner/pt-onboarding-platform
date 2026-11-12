<template>
  <div class="smc conversa-surface">
    <div class="pad">
      <ConversaBrand heading="h1" compact />
      <SecureMessageBanner opening />
      <p v-if="loading" role="status">Checking your secure link…</p>
      <p v-else-if="error" class="err" role="alert">{{ error }}</p>
      <template v-else>
        <p>Your message is ready to open securely.</p>
        <a v-if="redirectUrl" class="secure-continue" :href="redirectUrl" aria-label="Read secure message"><img :src="SECURE_MESSAGE_BUTTON_PATH" alt="Read secure message" /></a>
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
import { SECURE_MESSAGE_BUTTON_PATH } from '../navigation/secureMessageBrand';

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
.secure-continue { display: block; margin-top: 24px; text-decoration: none; border-radius: 999px; }
.secure-continue img { display: block; width: 100%; height: auto; border: 0; }
.secure-continue:focus-visible { outline: 3px solid #d4a017; outline-offset: 4px; }
.secure-note { font-size: 12px; line-height: 1.6; color: var(--conversa-muted); }
</style>
