<template>
  <div class="exchange-summary">
    <p v-if="listing.demographics?.ageBand || listing.demographics?.gender" class="summary-basics">
      <span v-if="listing.demographics?.ageBand">Age: {{ listing.demographics.ageBand }}</span>
      <span v-if="listing.demographics?.gender">{{ listing.demographics.gender }}</span>
    </p>
    <section>
      <strong>Presenting problems</strong>
      <p v-if="listing.presentingProblemSource" class="muted">{{ listing.presentingProblemSource }}<span v-if="listing.presentingProblemUpdatedAt"> · {{ new Date(listing.presentingProblemUpdatedAt).toLocaleDateString() }}</span></p>
      <ul v-if="problems.length"><li v-for="problem in problems" :key="problem">{{ problem }}</li></ul>
      <p v-else class="muted">Not recorded</p>
    </section>
    <section>
      <strong>Diagnoses</strong>
      <ul v-if="diagnoses.length"><li v-for="diagnosis in diagnoses" :key="diagnosis">{{ diagnosis }}</li></ul>
      <p v-else class="muted">Not recorded</p>
    </section>
    <p v-if="listing.preferences?.modality || listing.preferences?.insurance" class="summary-basics">
      <span v-if="listing.preferences?.modality">{{ modalityLabel }}</span>
      <span v-if="listing.preferences?.insurance">Insurance: {{ listing.preferences.insurance }}</span>
    </p>
  </div>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ listing: { type: Object, required: true } });
function items(value) {
  if (value == null || value === '') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [String(value)] : [];
  if (typeof value === 'string') { try { return items(JSON.parse(value)); } catch { return [value]; } }
  if (Array.isArray(value)) return value.flatMap(items);
  if (typeof value === 'object') {
    const code = value.code || value.icd10_code;
    const label = value.description || value.name || value.label;
    return code || label ? [[code, label].filter(Boolean).join(' — ')] : Object.values(value).flatMap(items);
  }
  return [];
}
const problems = computed(() => items(props.listing.presentingProblems));
const diagnoses = computed(() => items(props.listing.diagnoses));
const modalityLabel = computed(() => ({ in_person: 'In person', virtual: 'Virtual', either: 'In person or virtual' }[props.listing.preferences?.modality] || props.listing.preferences?.modality));
</script>
<style scoped>
.exchange-summary { display: grid; gap: 12px; overflow-wrap: anywhere; }
.exchange-summary strong { font-size: 13px; }
.exchange-summary p, .exchange-summary ul { margin: 4px 0 0; font-size: 14px; white-space: pre-wrap; }
.exchange-summary ul { padding-left: 20px; }
.summary-basics { display: flex; gap: 12px; flex-wrap: wrap; }
.muted { color: var(--text-secondary, #64748b); }
</style>
