<template>
  <span v-if="eligible || claimed" @click.stop>
    <button v-if="!claimed" type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="claim">{{ busy ? 'Claiming…' : 'Claim task' }}</button>
    <span v-else>Assigned to you</span>
    <span v-if="error" role="alert" class="claim-error">{{ error }}</span>
  </span>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ task: { type: Object, required: true } });
const emit = defineEmits(['claimed']);
const busy = ref(false), claimed = ref(false), error = ref('');
const eligible = computed(() => props.task.task_type === 'custom' && props.task.task_list_id && !props.task.assigned_to_user_id && !['completed', 'overridden'].includes(props.task.status));
watch(() => props.task.id, () => { claimed.value = false; error.value = ''; });
async function claim() {
  if (!eligible.value || busy.value || claimed.value) return;
  busy.value = true; error.value = '';
  try { const { data } = await api.post(`/me/tasks/${props.task.id}/claim`); claimed.value = true; emit('claimed', data); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Unable to claim task'; }
  finally { busy.value = false; }
}
</script>
<style scoped>.claim-error { display: block; color: #b91c1c; font-size: 12px; }</style>
