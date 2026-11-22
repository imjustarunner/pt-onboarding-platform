<template>
  <button v-if="!measure" type="button" :disabled="busy" @click="open">
    {{ busy ? 'Opening questionnaire…' : 'Open questionnaire' }}
  </button>
  <form v-else class="assigned-questionnaire" @submit.prevent="submit">
    <OutcomeMeasureForm v-model="answers" :measure="measure" :disabled="busy" />
    <p>{{ answered }} of {{ measure.items.length }} answered</p>
    <button type="submit" :disabled="busy || answered !== measure.items.length">
      {{ busy ? 'Submitting…' : 'Submit to care team' }}
    </button>
  </form>
  <p v-if="error" class="assessment-error" role="alert">{{ error }}</p>
</template>

<script setup>
import { computed, ref } from 'vue';
import api from '../../services/api';
import OutcomeMeasureForm from '../clinical/OutcomeMeasureForm.vue';

const props = defineProps({
  agencyId: [Number, String],
  clientId: [Number, String],
  itemId: { type: [Number, String], required: true }
});
const emit = defineEmits(['saved']);
const measure = ref(null);
const answers = ref({});
const busy = ref(false);
const error = ref('');
const endpoint = computed(() => `/client-updates/clients/${props.clientId}/items/${props.itemId}/assessment`);
const answered = computed(() => Object.keys(answers.value).length);

async function open() {
  busy.value = true;
  error.value = '';
  try {
    const { data } = await api.get(endpoint.value, { params: { agencyId: props.agencyId } });
    if (data.complete) emit('saved');
    else measure.value = data.measure;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'The questionnaire could not be opened.';
  } finally {
    busy.value = false;
  }
}

async function submit() {
  if (busy.value || answered.value !== measure.value?.items.length) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(endpoint.value, { agencyId: props.agencyId, version: measure.value.version, answers: answers.value });
    emit('saved');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'The answers could not be saved. Please try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.assigned-questionnaire { margin-top: 16px; }
button { background: #16457c; color: white; border: 0; border-radius: 8px; padding: 10px 14px; }
button:disabled { opacity: .6; }
.assessment-error { color: #9b2c2c; }
</style>
