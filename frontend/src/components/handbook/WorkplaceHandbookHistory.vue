<template>
  <section class="update-history" aria-labelledby="history-title">
    <header><div><h2 id="history-title">Handbook update tracker</h2><p>Browse monthly changes. Earlier updates remain available in their original edition.</p></div><button type="button" @click="$emit('close')">← Back to handbook</button></header>
    <p v-if="loading" role="status">Loading monthly updates…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
    <p v-else-if="!months.length">No monthly updates have been shared yet.</p>
    <div v-else class="history-layout">
      <aside class="update-sidebar"><nav aria-label="Monthly handbook updates">
        <strong>Other updates</strong>
        <button v-for="month in months" :key="month.id" type="button" :aria-current="selectedId === month.id ? 'true' : undefined" @click="selectMonth(month)">
          <strong>{{ month.period_label || month.title }}</strong><span>{{ month.availability }}</span><small>{{ month.entry_count }} {{ Number(month.entry_count) === 1 ? 'change' : 'changes' }}</small>
        </button>
      </nav>
      <nav v-if="detail?.entries?.length" class="edition-outline" aria-label="Changes in this edition">
        <strong>In this edition</strong>
        <a v-for="entry in detail.entries" :key="entry.id" :href="`#update-${entry.id}`">{{ entry.subject }}</a>
      </nav></aside>
      <div class="history-content" aria-live="polite" :aria-busy="detailLoading">
        <p v-if="detailLoading">Loading this edition…</p>
        <p v-else-if="detailError" role="alert">{{ detailError }} <button type="button" @click="selectMonth(months.find(m => m.id === selectedId))">Try again</button></p>
        <template v-else-if="detail">
          <h3>{{ detail.digest.title }}</h3>
          <p class="edition-status">{{ detail.digest.period_label }} · {{ detail.digest.availability }}</p>
          <p v-if="detail.digest.availability.startsWith('Draft')" class="draft-note">Proposed changes for this edition. These have not replaced the current handbook or earlier provider updates.</p>
          <p v-if="!detail.entries.length">No changes have been added to this edition yet.</p>
          <article v-for="entry in detail.entries" :id="`update-${entry.id}`" :key="entry.id">
            <h4>{{ entry.subject }}</h4><p v-if="entry.rationale" class="rationale">{{ entry.rationale }}</p>
            <div class="update-wording" v-html="safeHtml(entry.changed_content)" />
            <WorkplaceHandbookPolicyLinks :entry="entry" :sections="sections" @open="$emit('open-section', $event)" />
          </article>
        </template>
      </div>
    </div>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import WorkplaceHandbookPolicyLinks from './WorkplaceHandbookPolicyLinks.vue';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, sections: { type: Array, default: () => [] }, initialDigestId: { type: [Number,String], default: null } });
defineEmits(['close', 'open-section']);
const months = ref([]), detail = ref(null), selectedId = ref(null), loading = ref(false), detailLoading = ref(false), error = ref(''), detailError = ref('');
let listRequest = 0, detailRequest = 0;
function safeHtml(value) {
  const text = String(value || '');
  return DOMPurify.sanitize(text.includes('<') ? text : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'));
}
async function selectMonth(month) {
  if (!month) return;
  const request = ++detailRequest;
  selectedId.value = month.id; detail.value = null; detailLoading.value = true; detailError.value = '';
  try {
    const { data } = await api.get(`/provider-update/handbook/history/${month.id}`, { params: { agencyId: props.agencyId } });
    if (request === detailRequest) detail.value = data;
  } catch (e) { if (request === detailRequest) detailError.value = e.response?.data?.error?.message || 'This edition could not be loaded.'; }
  finally { if (request === detailRequest) detailLoading.value = false; }
}
async function load() {
  const request = ++listRequest; ++detailRequest;
  loading.value = true; error.value = ''; months.value = []; detail.value = null; selectedId.value = null;
  try {
    const { data } = await api.get('/provider-update/handbook/history', { params: { agencyId: props.agencyId } });
    if (request !== listRequest) return;
    months.value = data.months || [];
    if (months.value.length) await selectMonth(months.value.find(month => Number(month.id) === Number(props.initialDigestId)) || months.value[0]);
  } catch (e) { if (request === listRequest) error.value = e.response?.data?.error?.message || 'Monthly updates could not be loaded.'; }
  finally { if (request === listRequest) loading.value = false; }
}
watch(() => [props.agencyId, props.initialDigestId], load, { immediate: true });
onBeforeUnmount(() => { ++listRequest; ++detailRequest; });
</script>
<style scoped>
.update-sidebar{position:sticky;top:20px;align-self:start;max-height:85vh;overflow:auto}.update-sidebar nav>strong{font-size:13px;padding:8px}.edition-outline{margin-top:24px}.edition-outline a{padding:8px;font-size:13px;color:#28513f;line-height:1.5;text-underline-offset:3px}.history-content article{scroll-margin-top:24px}@media(max-width:760px){.update-sidebar{position:static;max-height:300px}.update-sidebar .edition-outline{display:grid;grid-template-columns:1fr}}.update-history{color:#263e32;background:#fff;border:1px solid #dfe6df;border-radius:12px;padding:22px}.update-history header{display:flex;align-items:start;justify-content:space-between;gap:20px;margin-bottom:22px}.update-history h2{margin:0;font-size:21px}.update-history header p{font-size:13px;color:#65776c;margin-bottom:0;line-height:1.6}.update-history button{font:inherit;font-size:13px;padding:10px 14px;border:1px solid #d7e2d8;border-radius:7px;background:#fff;color:#28513f;cursor:pointer}.history-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:28px}.history-layout nav{display:flex;flex-direction:column;gap:8px}.history-layout nav button{text-align:left;display:grid;gap:5px;padding:14px}.history-layout nav button[aria-current]{background:#edf4ec;border-color:#6f9479}.history-layout nav span,.history-layout nav small{font-size:11px;color:#64786b}.history-content{min-width:0}.history-content h3{margin:0 0 8px;font-size:19px}.edition-status{font-size:12px;color:#708173}.draft-note{background:#fff4db;padding:12px;border-radius:7px;font-size:13px;line-height:1.6}.history-content article{padding:20px 0;border-top:1px solid #e5eae5}.history-content h4{font-size:17px;margin:0 0 10px}.rationale{font-size:13px;color:#66776c;line-height:1.6}.update-wording{font-size:15px;line-height:1.8;overflow-wrap:anywhere}.update-wording :deep(img){max-width:100%}.update-wording :deep(table){display:block;overflow-x:auto;max-width:100%}.update-history :focus-visible{outline:2px solid #4e7e65;outline-offset:3px}@media(max-width:760px){.update-history{padding:16px}.update-history header{flex-direction:column;gap:12px}.history-layout{grid-template-columns:minmax(0,1fr);gap:20px}.history-layout nav{flex-direction:row;overflow-x:auto;padding:3px}.history-layout nav button{min-width:180px}}
</style>
