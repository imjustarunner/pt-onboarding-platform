<template>
  <div class="step-review">
    <nav aria-label="Candidate steps to review"><button v-for="(item, i) in steps" :key="item.key" type="button" :aria-current="index === i ? 'step' : undefined" @click="index = i"><span>{{ reviewed[item.key] === fingerprint(item) ? '✓' : i + 1 }}</span>{{ item.title }}</button></nav>
    <article v-if="current" class="review-detail">
      <p class="muted">Candidate step {{ index + 1 }} of {{ steps.length }} · {{ current.source }}</p>
      <h3>{{ current.title }}</h3>
      <p><strong>{{ current.required === false ? 'Optional' : 'Required' }} · {{ current.action }}</strong></p>
      <p>{{ current.instructions }}</p>
      <slot v-if="current.key === 'job-description'" name="job-description" />
      <button v-if="current.key === 'agreement'" type="button" @click="emit('agreement')">Review the employment agreement</button>
      <HireSetupDocumentPreview v-if="current.templateId || current.documentId" :key="current.key" :agency-id="agencyId" :job-id="jobId" :template-id="current.templateId" :document-id="current.documentId" :title="current.title" />
      <a v-if="current.url" :href="current.url" target="_blank" rel="noopener">Open {{ current.title }} ↗</a>
      <p v-if="current.unavailable" role="alert">This item has no saved content. Edit its source before inviting the candidate.</p>
      <div class="review-actions"><button type="button" :disabled="index === 0" @click="index--">Previous candidate step</button><button class="primary" type="button" :disabled="current.unavailable" @click="review">{{ index === steps.length - 1 ? 'Mark final step reviewed' : 'Reviewed · next candidate step →' }}</button></div>
      <p role="status">{{ reviewedCount }} of {{ steps.length }} candidate steps reviewed</p>
    </article>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import HireSetupDocumentPreview from './HireSetupDocumentPreview.vue';
const props = defineProps({ steps: { type: Array, default: () => [] }, agencyId: [Number, String], jobId: [Number, String] });
const emit = defineEmits(['reviewed', 'agreement']);
const index = ref(0), reviewed = ref({});
const fingerprint = item => JSON.stringify(item);
const current = computed(() => props.steps[index.value]);
const reviewedCount = computed(() => props.steps.filter(item => reviewed.value[item.key] === fingerprint(item)).length);
function review() { if (!current.value || current.value.unavailable) return; reviewed.value[current.value.key] = fingerprint(current.value); if (index.value < props.steps.length - 1) index.value++; }
watch(() => [reviewedCount.value, props.steps.length], () => emit('reviewed', props.steps.length > 0 && reviewedCount.value === props.steps.length), { immediate: true });
watch(() => props.steps.length, count => { index.value = Math.min(index.value, Math.max(0, count - 1)); });
</script>
<style scoped>
.step-review{display:grid;grid-template-columns:minmax(210px,1fr) minmax(0,3fr);gap:24px;margin-top:24px}nav{display:grid;align-content:start;gap:8px}button{font:inherit;color:#243b53;background:white;border:1px solid #cbd7e2;border-radius:8px;padding:12px;cursor:pointer}nav button{display:flex;gap:10px;text-align:left;align-items:center;line-height:1.5}nav button[aria-current=step]{background:#eef3f8;border-color:#476886;font-weight:700}nav span{min-width:24px}.review-detail{border:1px solid #dce3eb;border-radius:12px;padding:24px;min-width:0}.review-detail p{line-height:1.7}.review-actions{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:28px}.primary{background:#243b53;color:white}button:disabled{opacity:.5;cursor:default}@media(max-width:800px){.step-review{grid-template-columns:1fr}nav{display:flex;overflow:auto}nav button{min-width:180px}.review-detail{padding:18px}}
</style>
