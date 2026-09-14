<template>
  <fieldset class="intervention-picker">
    <legend>Interventions for this objective</legend>
    <p v-if="modelValue.length" class="selected">Selected: {{ modelValue.join(', ') }}</p>
    <button v-if="goalText.trim() && objectiveText.trim()" type="button" :disabled="recommending" @click="recommend">
      {{ recommending ? 'Recommending…' : 'Recommend interventions (AI)' }}
    </button>
    <div v-if="recommendations.length" class="recommendations">
      <strong>AI suggestions — review for this objective</strong>
      <p>{{ recommendations.join(', ') }}</p>
      <button type="button" @click="acceptRecommendations">Select recommended interventions</button>
    </div>
    <p v-if="recommendationMessage" role="status">{{ recommendationMessage }}</p>
    <details>
      <summary>Select interventions</summary>
      <label class="search">Find an intervention
        <input v-model="search" type="search" placeholder="Search interventions" />
      </label>
      <div class="choices">
        <label v-for="name in choices" :key="name">
          <input type="checkbox" :checked="modelValue.includes(name)" @change="toggle(name, $event.target.checked)" />
          {{ name }}
        </label>
      </div>
      <p v-if="!choices.length">No matching interventions.</p>
      <label class="search">Add an intervention to my list
        <input v-model="newName" maxlength="160" placeholder="Intervention name" />
      </label>
      <button type="button" :disabled="saving || !newName.trim()" @click="add">{{ saving ? 'Adding…' : 'Add and select' }}</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </details>
  </fieldset>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  agencyId: { type: [Number, String], required: true },
  goalText: { type: String, default: '' },
  objectiveText: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue', 'catalog-updated', 'ai-used']);
const search = ref('');
const newName = ref('');
const saving = ref(false);
const error = ref('');
const recommendations = ref([]);
const recommendationMessage = ref('');
const recommending = ref(false);
let recommendationSequence = 0;
watch(() => [props.agencyId, props.goalText, props.objectiveText], () => {
  recommendationSequence += 1;
  recommendations.value = [];
  recommendationMessage.value = '';
  recommending.value = false;
});
async function recommend() {
  if (recommending.value) return;
  const request = ++recommendationSequence;
  recommending.value = true;
  recommendations.value = [];
  recommendationMessage.value = '';
  try {
    const result = await api.post('/medical-billing/treatment-plans/recommend-interventions', {
      agencyId: Number(props.agencyId), goalText: props.goalText, objectiveText: props.objectiveText
    }, { skipGlobalLoading: true, timeout: 90000 });
    if (request !== recommendationSequence) return;
    recommendations.value = Array.isArray(result?.data?.interventions) ? result.data.interventions : [];
    recommendationMessage.value = recommendations.value.length ? '' : (result?.data?.message || 'No recommendations were available. You can select interventions manually.');
  } catch {
    if (request === recommendationSequence) recommendationMessage.value = 'Could not recommend interventions. Please try again or select them manually.';
  } finally { if (request === recommendationSequence) recommending.value = false; }
}
function acceptRecommendations() {
  if (!recommendations.value.length) return;
  emit('update:modelValue', [...new Set([...props.modelValue, ...recommendations.value])]);
  emit('ai-used');
  recommendations.value = [];
}
const choices = computed(() => [...new Set([...props.options, ...props.modelValue])]
  .filter((name) => name.toLowerCase().includes(search.value.trim().toLowerCase()))
  .sort((a, b) => a.localeCompare(b)));
function toggle(name, checked) {
  emit('update:modelValue', checked ? [...new Set([...props.modelValue, name])] : props.modelValue.filter((v) => v !== name));
}
async function add() {
  const name = newName.value.replace(/\s+/g, ' ').trim();
  if (!name || saving.value) return;
  const existing = [...props.options, ...props.modelValue].find((item) => item.toLowerCase() === name.toLowerCase());
  if (existing) { toggle(existing, true); newName.value = ''; return; }
  const agencyId = Number(props.agencyId);
  saving.value = true;
  error.value = '';
  try {
    const result = await api.post('/medical-billing/interventions', { agencyId, scope: 'user', names: [name] }, { skipGlobalLoading: true });
    if (Number(props.agencyId) !== agencyId) return;
    emit('catalog-updated', result?.data?.all || [...props.options, name]);
    toggle(name, true);
    newName.value = '';
  } catch {
    error.value = 'Could not save this intervention to your list. Please try again.';
  } finally { saving.value = false; }
}
</script>

<style scoped>
.intervention-picker { border: 1px solid #dbe4ee; border-radius: 8px; padding: 12px; margin: 12px 0; min-width: 0; }
.intervention-picker legend { padding: 0 4px; }
.selected { margin: 0 0 8px; overflow-wrap: anywhere; }
summary { cursor: pointer; color: #16746e; }
.search { display: grid; gap: 4px; margin: 12px 0 8px; }
.search input { padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; min-width: 0; }
.choices { max-height: 220px; overflow: auto; display: grid; gap: 6px; }
.choices label { display: flex; align-items: baseline; gap: 8px; }
button { padding: 8px 12px; cursor: pointer; }
</style>
