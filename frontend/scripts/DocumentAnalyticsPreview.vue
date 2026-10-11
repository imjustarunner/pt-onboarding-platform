<template>
  <main><p class="notice">LOCAL PREVIEW · Synthetic activity only · No database, payroll or external AI</p><h1>A clearer picture of your Library.</h1><p>See what people open, where they spend time, and what they ask.</p>
    <nav><button @click="company = company === 'itsco' ? 'nlu' : 'itsco'">Switch company · {{ company === 'itsco' ? 'ITSCO' : 'NLU' }}</button><button @click="role = role === 'admin' ? 'provider' : 'admin'; auth.user = { id: 7, role }">Preview {{ role === 'admin' ? 'staff' : 'admin' }} view</button></nav>
    <DocumentAnalyticsControl :agency-id="agencyId" document-key="service-documentation-standards" document-title="Service Documentation Standards" />
    <Book v-if="book" :key="agencyId" :handbook="book" :analytics="{ agencyId, surface: 'library' }" :answer-question="ask" />
  </main>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '../src/store/auth';
import api from '../src/services/api';
import Book from '../src/components/handbook/WorkplaceHandbookBook.vue';
import DocumentAnalyticsControl from '../src/components/library/DocumentAnalyticsControl.vue';
const auth = useAuthStore(), role = ref('admin'), company = ref('itsco'), book = ref(null);
auth.user = { id: 7, role: 'admin' };
const agencyId = computed(() => company.value === 'itsco' ? 2 : 12);
watch(agencyId, async id => { book.value = null; book.value = (await api.get('/preview/book', { params: { agencyId: id } })).data; }, { immediate: true });
async function ask(payload) { return (await api.post('/preview/answer', { ...payload, agencyId: agencyId.value })).data; }
</script>
<style scoped>
:global(body){margin:0;background:#eef3ed;color:#223b34;font-family:var(--font-ptco)}:global(*){box-sizing:border-box}main{max-width:1320px;margin:30px auto;padding:0 24px}h1{font-size:clamp(28px,4vw,44px);max-width:800px;line-height:1.3}.notice{font-size:11px;letter-spacing:.08em;color:#5c7065}nav{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}nav button{padding:10px 15px;border:1px solid #bccdbf;border-radius:8px;background:white;color:inherit;font:inherit;font-size:12px}
</style>
