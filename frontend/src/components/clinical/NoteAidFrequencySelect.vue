<template>
  <div class="frequency-select">
    <label>Prescribed frequency
      <select :value="customMode ? '__custom__' : modelValue" @change="select($event.target.value)">
        <option value="">Select frequency</option>
        <option v-for="name in choices" :key="name" :value="name">{{ name }}</option>
        <option value="__custom__">Other / enter a frequency</option>
      </select>
    </label>
    <div v-if="customMode">
      <label>Custom frequency
        <input :value="modelValue" maxlength="160" placeholder="Enter treatment frequency" @input="emit('update:modelValue', $event.target.value)" />
      </label>
      <button type="button" :disabled="saving || !modelValue.trim()" @click="save">{{ saving ? 'Saving…' : 'Add to my frequency list' }}</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const DEFAULTS = ['Twice per week', 'Weekly', 'Biweekly (every two weeks)', 'Monthly'];
const props = defineProps({ modelValue: { type: String, default: '' }, agencyId: { type: [Number, String], required: true } });
const emit = defineEmits(['update:modelValue']);
const names = ref([]);
const customMode = ref(false);
const saving = ref(false);
const error = ref('');
let sequence = 0;
const choices = computed(() => [...new Set([...DEFAULTS, ...names.value, ...(props.modelValue ? [props.modelValue] : [])])]);
watch(() => props.agencyId, async (agencyId) => {
  const request = ++sequence;
  names.value = [];
  customMode.value = false;
  error.value = '';
  try {
    const result = await api.get('/medical-billing/treatment-frequencies', { params: { agencyId: Number(agencyId) }, skipGlobalLoading: true });
    if (request === sequence) names.value = Array.isArray(result?.data?.all) ? result.data.all : [];
  } catch {
    if (request === sequence) error.value = 'Saved frequencies could not be loaded. You can still select a default or enter a frequency.';
  }
}, { immediate: true });
function select(value) {
  customMode.value = value === '__custom__';
  if (!customMode.value) emit('update:modelValue', value);
}
async function save() {
  const name = props.modelValue.replace(/\s+/g, ' ').trim();
  if (!name || saving.value) return;
  const request = sequence;
  saving.value = true;
  error.value = '';
  try {
    const result = await api.post('/medical-billing/treatment-frequencies', { agencyId: Number(props.agencyId), name }, { skipGlobalLoading: true });
    if (request !== sequence) return;
    names.value = Array.isArray(result?.data?.all) ? result.data.all : [...names.value, name];
    // Preserve anything typed while the save was in progress.
    if (props.modelValue.replace(/\s+/g, ' ').trim() === name) {
      emit('update:modelValue', name);
      customMode.value = false;
    }
  } catch {
    if (request === sequence) error.value = 'Could not add this frequency to your list. Your entered frequency remains in the plan.';
  } finally { saving.value = false; }
}
</script>
<style scoped>
.frequency-select { margin: 12px 0; }
label { display: grid; gap: 6px; margin-bottom: 8px; }
select, input { padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; width: 100%; box-sizing: border-box; font: inherit; }
button { padding: 8px 12px; cursor: pointer; }
</style>
