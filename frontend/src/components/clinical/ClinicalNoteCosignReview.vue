<template>
  <div class="cosign-review-launcher">
    <button v-if="!opened" type="button" @click="opened = true">Review &amp; cosign</button>
    <ClinicalNoteSupervisorReview
      v-else
      :note-id="noteId"
      :agency-id="agencyId"
      :provider-id="providerId"
      full-page
      @signed="onSigned"
      @returned="onReturned"
      @close="opened = false"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import ClinicalNoteSupervisorReview from './ClinicalNoteSupervisorReview.vue';

const props = defineProps({ noteId: { type: [Number, String], required: true }, agencyId: { type: [Number, String], required: true }, providerId: { type: [Number, String], default: null } });
const emit = defineEmits(['signed', 'returned']);
const opened = ref(false);
watch(() => [props.noteId, props.agencyId, props.providerId], () => { opened.value = false; });
function onSigned(result) { opened.value = false; emit('signed', result); }
function onReturned(result) {
  if (result.action === 'changes_needed') opened.value = false;
  emit('returned', result);
}
</script>

<style scoped>
.cosign-review-launcher>button{margin:.35rem;padding:.5rem .75rem;border:1px solid var(--border-color,#ccd5df);border-radius:7px;background:white;color:#254e6a;font:inherit;cursor:pointer}
</style>
