<template>
  <form class="clinical-profile-form" @submit.prevent="save(true)">
    <p>Choose the areas that reflect your experience and training. You can leave a section empty if it does not apply. These answers become part of your provider profile.</p>
    <ClinicalMultiSelect v-for="field in step.fields" :key="field.key" v-model="values[field.key]" :label="field.label" :description="field.description" :options="field.options" :disabled="busy" :readonly="readonly" />
    <details v-if="step.reviewNeeded?.length" class="previous-answers">
      <summary>Previous profile information to review</summary>
      <p>These earlier answers are retained. Review them as you choose your options above.</p>
      <ul><li v-for="(answer, index) in step.reviewNeeded" :key="index">{{ answer.value }}</li></ul>
    </details>
    <template v-if="!readonly">
      <label class="reviewed"><input v-model="reviewed" type="checkbox" :disabled="busy" />I have reviewed all four sections, including any sections I left empty.</label>
      <div class="form-actions"><button type="button" :disabled="busy" @click="save(false)">Save for later</button><button type="submit" class="primary" :disabled="busy || !reviewed">{{ busy ? 'Saving…' : 'Save clinical profile' }}</button></div>
    </template>
  </form>
</template>
<script setup>
import { ref, watch } from 'vue';
import ClinicalMultiSelect from '../profile/ClinicalMultiSelect.vue';
const props = defineProps({ step: { type:Object, required:true }, busy:Boolean, readonly:Boolean });
const emit = defineEmits(['save']);
const copy = value => Object.fromEntries(Object.entries(value || {}).map(([key, selections]) => [key, [...selections]]));
const values = ref(copy(props.step.values));
const reviewed = ref(false);
watch(() => props.step.values, (value, previous) => {
  if (JSON.stringify(values.value) === JSON.stringify(previous)) values.value = copy(value);
});
function save(complete) { emit('save', { values: copy(values.value), reviewed: reviewed.value, complete }); }
</script>
<style scoped>
.clinical-profile-form { display:grid; gap:24px; }
.clinical-profile-form > p { margin:0; color:#526577; line-height:1.6; }
.previous-answers { overflow-wrap:anywhere; color:#526577; }
.previous-answers summary { cursor:pointer; font-weight:600; }
.reviewed { display:flex; align-items:flex-start; gap:10px; line-height:1.5; }
.reviewed input { width:18px; height:18px; flex-shrink:0; margin-top:3px; }
.form-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:12px; }
button { padding:12px 18px; border:1px solid #afc6be; border-radius:8px; font:inherit; color:#164f40; background:#fff; cursor:pointer; }
button.primary { background:var(--hire-brand,#17624b); color:#fff; }
button:disabled { opacity:.6; cursor:default; }
</style>
