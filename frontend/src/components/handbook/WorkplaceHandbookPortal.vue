<template>
  <div class="portal-handbook" :aria-busy="loading">
    <div v-if="loading" class="handbook-status" role="status">
      <span class="status-icon"><Icon name="book" /></span><h3>Opening your workplace handbook</h3><p>Getting the latest available edition ready to read.</p>
      <div class="loading-lines" aria-hidden="true"><span /><span /><span /></div>
    </div>
    <template v-else-if="handbook">
      <p v-if="handbook.beta" class="reference-edition"><strong>Reference edition</strong> Available to read while the published edition is being prepared.</p>
      <p v-if="handbook.beta && !referenceOnly" role="status" class="reference-edition">People Operations must publish this handbook before you can sign your onboarding acknowledgement. <button type="button" @click="emit('help')">Contact People Operations</button></p>
      <WorkplaceHandbookBook :handbook="handbook" neutral :analytics="analytics" :analytics-http="http" :updates="handbook.updates || []" :answer-question="handbook.version?.id ? answerQuestion : null" @reload="load" />
    </template>
    <div v-else class="handbook-status" :role="error ? 'alert' : 'status'">
      <span class="status-icon"><Icon :name="error ? 'help' : 'book'" /></span>
      <h3>{{ error ? 'We couldn’t open the handbook' : 'The handbook isn’t available yet' }}</h3>
      <p v-if="referenceOnly">You can continue your pre-hire steps and return here later. People Operations can help with any policy questions.</p>
      <p v-else>Try again, or contact People Operations for help before acknowledging it.</p>
      <div class="status-actions"><button type="button" @click="load">Try again</button><button type="button" class="contact-action" @click="emit('help')">Contact People Operations <span aria-hidden="true">→</span></button></div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import WorkplaceHandbookBook from './WorkplaceHandbookBook.vue';
import Icon from '../prehire/HirePortalIcon.vue';
const props = defineProps({ http: { type: Object, required: true }, token: { type: String, required: true }, referenceOnly: Boolean });
const emit = defineEmits(['available', 'version', 'help']);
const analytics = ref(null);
const handbook = ref(null), loading = ref(false), error = ref(false);
let request = 0;
async function answerQuestion(payload, options) {
  const { data } = await props.http.post(`/prehire-portal/${encodeURIComponent(props.token)}/resources/handbook/answer`, payload, { ...options, timeout: 240000 });
  return data;
}
async function load() {
  const current = ++request;
  loading.value = true; error.value = false; handbook.value = null; analytics.value = null; emit('available', false); emit('version', null);
  try {
    const url = `/prehire-portal/${encodeURIComponent(props.token)}/resources/handbook`;
    const { data } = await props.http.get(url + '?reference=1');
    if (current !== request) return;
    const readable = data.available && data.handbook?.sections?.length;
    // Reference editions must never enable the onboarding signature controls.
    const published = readable && !data.handbook.beta && data.handbook.version?.id && data.acknowledgeable !== false;
    handbook.value = readable ? data.handbook : null;
    analytics.value = published && data.analytics ? { ...data.analytics, apiBase: `/prehire-portal/${encodeURIComponent(props.token)}/document-analytics` } : null;
    emit('available', !!published && !props.referenceOnly);
    emit('version', published && !props.referenceOnly ? data.handbook.version.id : null);
  } catch { if (current === request) error.value = true; }
  finally { if (current === request) loading.value = false; }
}
watch(() => [props.http, props.token, props.referenceOnly], load, { immediate: true });
onBeforeUnmount(() => { request++; });
</script>

<style scoped>
.portal-handbook{min-width:0;font-family:'Plotline Inter',Inter,system-ui,sans-serif;color:#243b53}
.handbook-status{display:flex;align-items:center;flex-direction:column;text-align:center;gap:14px;padding:48px 24px;background:#fff;border:1px solid #dfe5ed;border-radius:14px;box-shadow:0 2px 6px #15243b05}
.status-icon{display:grid;place-items:center;width:56px;height:56px;background:#eef3f8;border:1px solid #dde5ef;border-radius:16px;color:#45617f}.status-icon svg{width:28px;height:28px}
h3{margin:0;font:650 19px/1.4 'Plotline Inter',Inter,system-ui,sans-serif;letter-spacing:-.3px;color:#243b53}p{margin:0;max-width:540px;font-size:14px;line-height:1.7;color:#5c6d82}
.status-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:8px}button{border:1px solid #ccd6e1;background:#fff;color:#243b53;border-radius:8px;padding:11px 17px;font-family:inherit;font-weight:600;font-size:13px;line-height:1.4;cursor:pointer}button:hover{background:#f1f5f9}.contact-action{background:#243b53;color:#fff;border-color:#243b53}.contact-action:hover{background:#152b42}button:focus-visible{outline:3px solid #88a7c5;outline-offset:3px}
.loading-lines{display:grid;gap:10px;width:min(100%,350px);margin-top:12px}.loading-lines span{display:block;height:9px;background:#edf1f6;border-radius:6px}.loading-lines span:nth-child(2){width:85%}.loading-lines span:last-child{width:65%}
.reference-edition{max-width:none;padding:12px 16px;margin-bottom:14px;background:#fff;border:1px solid #dfe5ed;border-radius:8px;font-size:12px}.reference-edition strong{color:#243b53;margin-right:7px}
@media(max-width:600px){.handbook-status{padding:34px 20px}.status-actions{width:100%;flex-direction:column}.status-actions button{width:100%}}
</style>
