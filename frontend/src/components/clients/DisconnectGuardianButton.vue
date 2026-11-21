<template>
  <div>
    <button type="button" class="btn btn-danger btn-sm" :disabled="busy" @click="disconnect">
      {{ busy ? 'Disconnecting…' : 'Disconnect from this client' }}
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId: { type: Number, required: true },
  guardianId: { type: Number, required: true }
});
const emit = defineEmits(['disconnected']);
const busy = ref(false);
const error = ref('');

async function disconnect() {
  if (!window.confirm('Disconnect this guardian from this client? Their access to this client will be revoked. The change will be recorded in the audit history.')) return;
  const { clientId, guardianId } = props;
  error.value = '';
  busy.value = true;
  try {
    await api.delete(`/clients/${clientId}/guardians/${guardianId}`, { skipGlobalLoading: true });
    emit('disconnected', { clientId, guardianId });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'This guardian could not be disconnected.';
  } finally {
    busy.value = false;
  }
}
</script>
