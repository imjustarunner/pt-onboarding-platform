<template>
  <div class="print-page">
    <header class="no-print">
      <button type="button" class="btn" @click="goBack">← Back to portal</button>
      <button type="button" class="btn primary" @click="printPage">Print</button>
    </header>
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <article v-else class="sheet">
      <h1>{{ agencyName }}</h1>
      <h2>{{ item?.title || 'Print instructions' }}</h2>
      <p class="who">For {{ candidateName }}</p>
      <div class="body" v-html="bodyHtml"></div>
    </article>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import DOMPurify from 'dompurify';

const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.params.token || ''));
const itemKey = computed(() => String(route.params.itemKey || ''));
const loading = ref(true);
const error = ref('');
const portal = ref(null);

const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: false
});

const agencyName = computed(() => portal.value?.agency?.name || '');
const candidateName = computed(() => {
  const c = portal.value?.candidate || {};
  return `${c.firstName || ''} ${c.lastName || ''}`.trim();
});
const item = computed(() => {
  const docs = portal.value?.prehireDocs || [];
  return docs.find((d) => String(d.id) === itemKey.value)
    || (portal.value?.checklistItems || []).find((d) => String(d.itemKey) === itemKey.value)
    || null;
});
const bodyHtml = computed(() => {
  const text = item.value?.printInstructions || item.value?.instructions || '';
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return DOMPurify.sanitize(escaped.replace(/\n/g, '<br />'));
});

const goBack = () => router.push(`/pre-hire/${token.value}`);
const printPage = () => window.print();

onMounted(async () => {
  try {
    const { data } = await portalApi.get(`/prehire-portal/${token.value}`);
    portal.value = data;
    const key = item.value?.id || itemKey.value;
    if (key) {
      await portalApi.post(`/prehire-portal/${token.value}/resources/handbook/open`, { linkKey: `print:${key}` }).catch(() => {});
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not load print instructions.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.print-page { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
header.no-print { display: flex; gap: 8px; margin-bottom: 16px; }
.btn { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
.btn.primary { background: #1a8c54; color: #fff; border-color: #1a8c54; }
.sheet { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; }
.sheet h1 { margin: 0 0 8px; font-size: 1.1rem; color: #1a8c54; }
.sheet h2 { margin: 0 0 8px; }
.who { color: #6b7280; }
.body { margin-top: 18px; line-height: 1.6; }
.error { color: #b91c1c; }
@media print {
  .no-print { display: none !important; }
  .sheet { border: 0; }
}
</style>
