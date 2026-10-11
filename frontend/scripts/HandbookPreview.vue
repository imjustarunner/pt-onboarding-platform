<template>
  <nav class="preview-navigation" aria-label="Preview views">
    <button type="button" :aria-pressed="view === 'book'" @click="view = 'book'">Read {{ handbook.metadata.documentKey === 'school-practice-guide' ? 'school practice guide' : handbook.metadata.documentKey === 'provider-guide' ? 'provider guide' : 'handbook' }}</button>
    <button v-if="!['provider-guide', 'school-practice-guide'].includes(handbook.metadata.documentKey)" type="button" :aria-pressed="view === 'updates'" @click="view = 'updates'">Review handbook updates</button>
  </nav>
  <section v-if="view === 'updates'" class="preview-updates">
    <h1>Handbook updates</h1>
    <p>Draft review · Each policy link opens its current location in the reconciled handbook.</p>
    <article v-for="entry in updates" :id="`preview-update-${entry.id}`" :key="entry.id">
      <h2>{{ entry.subject }}</h2>
      <PolicyLinks :entry="entry" :sections="handbook.sections" @open="openPolicy" />
      <details><summary>Review update wording</summary><div v-html="safeHtml(entry.changed_content)" /></details>
    </article>
  </section>
  <p v-if="assistantEnabled && !assistantLive" class="preview-assistant-notice">Q&amp;A interface preview · Live AI verification is not enabled.</p>
  <Book ref="book" v-show="view === 'book'" :handbook="handbook" :updates="updates" :answer-question="assistantEnabled ? answerQuestion : null" assistant-preview @handbook-link="openHandbook" />
</template>
<script setup>
import { nextTick, ref } from 'vue';
import DOMPurify from 'dompurify';
import Book from '../src/components/handbook/WorkplaceHandbookBook.vue';
import PolicyLinks from '../src/components/handbook/WorkplaceHandbookPolicyLinks.vue';
const props = defineProps({ handbook: Object, updates: Array, assistantEnabled: Boolean, assistantLive: Boolean, answerEndpoint: { type: String, default: '/handbook-preview-answer' } });
const view = ref('book');
const book = ref(null);
const safeHtml = value => DOMPurify.sanitize(String(value || ''));
function openHandbook(hash) { const theme = props.handbook.metadata.presentation?.theme; window.location.href = `${theme === 'nlu-foundations' ? '/nlu-handbook-preview' : theme === 'isi-foundations' ? '/isi-handbook-preview' : '/handbook-preview'}${hash ? `#${hash}` : ''}`; }
async function openPolicy(slug) { view.value = 'book'; await nextTick(); await book.value?.selectSection(slug, true); }
async function answerQuestion(payload, options) {
  const response = await fetch(props.answerEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: options.signal });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error('Preview answer unavailable'), { response: { status: response.status, data } });
  return data;
}
</script>
<style scoped>
.preview-assistant-notice { padding: 12px 16px; color: #5a674a; background: #f4f2d8; font-size: 12px; border-radius: 6px; }
.preview-navigation { display:flex; gap:8px; margin:0 0 18px; flex-wrap:wrap; }.preview-navigation button { padding:12px 16px; border:1px solid #bfcfb9; border-radius:7px; background:white; color:#12583f; cursor:pointer; }.preview-navigation button[aria-pressed=true] { background:#12583f; color:white; }
.preview-updates { padding:clamp(18px,4vw,40px); border-radius:16px; background:#fffef8; color:#233c2c; }.preview-updates h1 { color:#12583f; font-size:32px; }.preview-updates>p { font-size:14px; line-height:1.7; }.preview-updates article { margin:24px 0; padding:20px; border:1px solid #dce3d6; border-radius:10px; }.preview-updates h2 { font-size:19px; line-height:1.5; }.preview-updates details { font-size:13px; line-height:1.7; }.preview-updates :deep(table) { display:block; max-width:100%; overflow:auto; }.preview-updates :deep(th),.preview-updates :deep(td) { padding:8px; border:1px solid #dce3d6; }
</style>
