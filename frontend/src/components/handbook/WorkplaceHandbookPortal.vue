<template>
  <div class="portal-handbook">
    <p v-if="loading" role="status">Loading the workplace handbook…</p>
    <p v-else-if="error" role="alert">The handbook could not be loaded. <button type="button" @click="load">Try again</button></p>
    <WorkplaceHandbookBook v-else-if="handbook" :handbook="handbook" :analytics="analytics" :analytics-http="http" :updates="handbook.updates || []" :answer-question="answerQuestion" @reload="load" />
    <p v-else>People Operations is preparing the in-app handbook. Contact the team for help before acknowledging it.</p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import WorkplaceHandbookBook from './WorkplaceHandbookBook.vue';
const props = defineProps({ http: { type: Object, required: true }, token: { type: String, required: true } });
const emit = defineEmits(['available', 'version']);
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
    const { data } = await props.http.get(`/prehire-portal/${encodeURIComponent(props.token)}/resources/handbook`);
    if (current !== request) return;
    analytics.value = data.analytics ? { ...data.analytics, apiBase: `/prehire-portal/${encodeURIComponent(props.token)}/document-analytics` } : null;
    handbook.value = data.available && data.handbook?.sections?.length ? data.handbook : null;
    emit('available', !!handbook.value);
    emit('version', handbook.value?.version?.id || null);
  } catch { if (current === request) error.value = true; }
  finally { if (current === request) loading.value = false; }
}
watch(() => [props.http, props.token], load, { immediate: true });
onBeforeUnmount(() => { request++; });
</script>

<style scoped>
.portal-handbook { min-width: 0; }.portal-handbook > p { font-size: 14px; line-height: 1.7; color: #53644d; }
</style>
