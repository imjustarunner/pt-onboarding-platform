<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';
import CanceledSessionDetails from './CanceledSessionDetails.vue';

const props = defineProps({
  providerId: { type: Number, required: true },
  item: { type: Object, required: true }
});
const emit = defineEmits(['close', 'archived', 'details']);
const dialog = ref(null);
const busy = ref(false);
const error = ref('');
onMounted(() => dialog.value?.showModal());

async function archive() {
  busy.value = true;
  error.value = '';
  const { type, id } = props.item;
  try {
    await api.delete(`/availability/providers/${props.providerId}/calendar/canceled/${type}/${id}`);
    emit('archived');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not delete this item. Try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <dialog ref="dialog" class="calendar-cancellation-dialog" aria-labelledby="calendar-cancellation-title" @cancel.prevent="!busy && emit('close')">
    <h2 id="calendar-cancellation-title">{{ item.archived ? 'Deleted calendar item' : 'Canceled calendar item' }}</h2>
    <p>{{ item.label }}</p>
    <CanceledSessionDetails v-if="item.type === 'appointment'" :appointment-id="item.id" />
    <p v-if="item.archived">This item is in the calendar archive.</p>
    <p v-else-if="item.canArchive">Deleting removes this item from the calendar and keeps its history in the archive.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <footer>
      <button class="btn btn-secondary" type="button" :disabled="busy" @click="emit('close')">Close</button>
      <button v-if="item.openDetails" class="btn btn-secondary" type="button" :disabled="busy" @click="emit('details')">Open details</button>
      <button v-if="item.canArchive" class="btn btn-danger" type="button" :disabled="busy" @click="archive">{{ busy ? 'Deleting…' : 'Delete from calendar' }}</button>
    </footer>
  </dialog>
</template>

<style scoped>
.calendar-cancellation-dialog { width: min(520px, calc(100vw - 2rem)); max-height: 85vh; border: 1px solid #d8e1ec; border-radius: 14px; padding: 1.25rem; }
.calendar-cancellation-dialog::backdrop { background: #17233d88; }
.calendar-cancellation-dialog h2 { margin-top: 0; }
.calendar-cancellation-dialog footer { display: flex; justify-content: end; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
</style>
