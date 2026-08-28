<template>
  <div class="qv-launch">
    <p v-if="message">{{ message }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const BOOKMARK_KEY = 'plottwist.quickViewBookmark';
const router = useRouter();
const message = ref('Opening your Quick View…');

onMounted(() => {
  let path = '';
  try {
    path = String(localStorage.getItem(BOOKMARK_KEY) || '').trim();
  } catch {
    path = '';
  }
  if (path && path.startsWith('/quick-view/')) {
    router.replace(path);
    return;
  }
  message.value =
    'No Quick View bookmark saved on this device yet. Open your private Quick View link first, then use Share → Add to Home Screen from that page.';
});
</script>

<style scoped>
.qv-launch {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #0f172a;
  color: #e2e8f0;
  text-align: center;
  font-family: system-ui, -apple-system, sans-serif;
}
</style>
