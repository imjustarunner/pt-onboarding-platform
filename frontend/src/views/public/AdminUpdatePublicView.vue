<template>
  <div class="au-public">
    <div v-if="error" class="au-public-err">{{ error }}</div>
    <div v-else-if="loading" class="au-public-err">Loading Admin Update…</div>
    <iframe
      v-else
      ref="frameEl"
      class="au-frame"
      title="Admin Update"
      :srcdoc="html"
      @load="onFrameLoad"
    />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const frameEl = ref(null);
const loading = ref(true);
const error = ref('');
const html = ref('');
const startedAt = Date.now();
let maxScroll = 0;
let heartbeat = null;
let docRef = null;

const token = () => String(route.params.token || '').trim();

async function postActivity(payload) {
  try {
    await api.post(`/public/admin-updates/${token()}/activity`, payload, {
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
  } catch {
    // tracking is best-effort
  }
}

function measureScroll() {
  const doc = docRef;
  if (!doc) return 0;
  const el = doc.scrollingElement || doc.documentElement;
  const height = (el.scrollHeight || 0) - (el.clientHeight || 0);
  if (height <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((el.scrollTop || 0) / height) * 100)));
}

function onScroll() {
  maxScroll = Math.max(maxScroll, measureScroll());
}

function onDocClick(event) {
  const a = event.target?.closest?.('a');
  if (!a?.href) return;
  postActivity({ eventType: 'click', eventKey: a.href, channel: 'app' });
}

async function flushDwell() {
  await postActivity({
    eventType: 'dwell',
    durationMs: Date.now() - startedAt,
    scrollPct: maxScroll,
    channel: 'app'
  });
  await postActivity({
    eventType: 'scroll',
    scrollPct: maxScroll,
    channel: 'app'
  });
}

function onFrameLoad() {
  docRef = frameEl.value?.contentDocument || null;
  if (!docRef) return;
  docRef.addEventListener('scroll', onScroll, { passive: true });
  docRef.addEventListener('click', onDocClick);
  maxScroll = Math.max(maxScroll, measureScroll());
}

onMounted(async () => {
  try {
    const res = await api.get(`/public/admin-updates/${token()}`, {
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    html.value = res.data?.html || '';
    document.title = res.data?.title || 'Admin Update';
    try {
      await api.post(`/admin-updates/me/splash-by-token/${token()}/open`, {}, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      });
    } catch {
      // splash receipt is best-effort
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'This Admin Update could not be opened.';
  } finally {
    loading.value = false;
  }
  heartbeat = window.setInterval(() => {
    maxScroll = Math.max(maxScroll, measureScroll());
    postActivity({
      eventType: 'dwell',
      durationMs: Date.now() - startedAt,
      scrollPct: maxScroll,
      channel: 'app'
    });
  }, 15000);
  window.addEventListener('pagehide', flushDwell);
});

onBeforeUnmount(() => {
  docRef?.removeEventListener('scroll', onScroll);
  docRef?.removeEventListener('click', onDocClick);
  window.removeEventListener('pagehide', flushDwell);
  if (heartbeat) window.clearInterval(heartbeat);
  flushDwell();
});
</script>

<style scoped>
.au-public {
  min-height: 100vh;
  background: #e2e8f0;
}
.au-public-err {
  max-width: 640px;
  margin: 48px auto;
  padding: 24px;
  background: #fff;
  border-radius: 16px;
  text-align: center;
  color: #334155;
}
.au-frame {
  display: block;
  width: 100%;
  min-height: 100vh;
  border: 0;
  background: #e2e8f0;
}
</style>
