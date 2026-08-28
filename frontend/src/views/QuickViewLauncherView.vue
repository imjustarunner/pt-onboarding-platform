<template>
  <div class="qv-launch">
    <template v-if="boundToken">
      <p class="muted">Opening your Quick View…</p>
    </template>
    <template v-else>
      <h1>Quick View</h1>
      <p>
        This device is not linked yet. Open your private Quick View link once from
        My Dashboard → Settings → Privacy &amp; Quick View, then Add to Home Screen from that page.
      </p>
      <p v-if="loginUrl" class="muted">
        Locked out?
        <a :href="loginUrl">Sign in to reset your passcode</a>
      </p>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { isQuickViewHost } from '../utils/subdomain';

const TOKEN_KEY = 'plottwist.quickViewToken';
const BOOKMARK_KEY = 'plottwist.quickViewBookmark';
const router = useRouter();
const boundToken = ref('');
const loginUrl = ref('');

onMounted(() => {
  let token = '';
  let path = '';
  try {
    token = String(localStorage.getItem(TOKEN_KEY) || '').trim();
    path = String(localStorage.getItem(BOOKMARK_KEY) || '').trim();
  } catch {
    token = '';
    path = '';
  }

  if (!token && path) {
    const m = path.match(/\/(?:quick-view|t)\/(?:d\/)?([^/?#]+)/i);
    if (m?.[1]) token = decodeURIComponent(m[1]);
  }

  if (token) {
    boundToken.value = token;
    const dest = isQuickViewHost()
      ? `/t/${encodeURIComponent(token)}`
      : `/quick-view/${encodeURIComponent(token)}`;
    router.replace(dest);
    return;
  }

  try {
    loginUrl.value = localStorage.getItem('plottwist.quickViewLoginUrl') || '';
  } catch {
    loginUrl.value = '';
  }
});
</script>

<style scoped>
.qv-launch {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  place-content: center;
  gap: 12px;
  padding: 24px;
  background: #0f172a;
  color: #e2e8f0;
  text-align: center;
  font-family: system-ui, -apple-system, sans-serif;
}
.qv-launch h1 { margin: 0; font-size: 1.6rem; }
.qv-launch p { margin: 0; max-width: 28rem; line-height: 1.45; }
.muted { color: #94a3b8; font-size: 0.9rem; }
.qv-launch a { color: #93c5fd; }
</style>
