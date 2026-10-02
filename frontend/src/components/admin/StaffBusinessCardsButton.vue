<template>
  <div class="staff-card-launcher">
    <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="open">
      {{ loading ? 'Loading agencies…' : selfOnly ? 'Print my business cards' : 'Print business cards' }}
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
    <BusinessCardsDialog v-if="show" :agencies="agencies" :initial-agency-id="initialAgency"
      :self-only="selfOnly" :target-user-id="selfOnly ? null : userId" @close="show = false" />
  </div>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import BusinessCardsDialog from './BusinessCardsDialog.vue';
const props = defineProps({ userId: { type: [Number, String], required: true }, agencyId: [Number, String], selfOnly: Boolean });
const loading = ref(false), error = ref(''), agencies = ref([]), show = ref(false);
const initialAgency = computed(() => agencies.value.some(a => Number(a.id) === Number(props.agencyId)) ? props.agencyId : agencies.value[0]?.id);
let generation = 0;
watch(() => [props.userId, props.agencyId], () => { generation++; show.value = false; error.value = ''; loading.value = false; });
async function open() {
  const request = ++generation;
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/users/${props.userId}/business-card-agencies`);
    if (request !== generation) return;
    agencies.value = data;
    if (!data.length) { error.value = 'No active staff agency relationships are available for printing.'; return; }
    show.value = true;
  } catch (e) {
    if (request === generation) error.value = e.response?.data?.error?.message || 'Could not load staff agencies. Please try again.';
  } finally { if (request === generation) loading.value = false; }
}
</script>
