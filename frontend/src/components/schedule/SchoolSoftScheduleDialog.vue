<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import SchoolAbsenceRecords from './SchoolAbsenceRecords.vue';
const props = defineProps({ block: { type: Object, required: true }, canCancelDay: Boolean });
const emit = defineEmits(['close', 'cancel-day']);
const dialog = ref(null);
let returnFocus;
onMounted(() => { returnFocus = document.activeElement; dialog.value?.showModal?.(); });
onBeforeUnmount(() => { dialog.value?.close?.(); returnFocus?.focus?.(); });
</script>

<template>
  <dialog ref="dialog" class="school-soft-dialog" aria-labelledby="school-soft-title" @cancel.prevent="emit('close')">
    <header>
      <div><p class="eyebrow">SCHOOL soft schedule</p><h2 id="school-soft-title">{{ block.clientName }}</h2></div>
      <button type="button" aria-label="Close school schedule details" autofocus @click="emit('close')">×</button>
    </header>
    <div class="content">
      <p><strong>{{ block.schoolName }}</strong> · {{ block.displayDate }} · {{ block.timeLabel }}{{ block.untimed ? '' : ` (${block.displayTimeZone})` }}</p>
      <p v-if="!block.record.explanation">This entry comes from the SCHOOL soft schedule. It does not represent a booked EHR session. Until the EHR transition, Cancel day can notify the client or guardian about your absence.</p>
      <SchoolAbsenceRecords :records="[block.record]" schedule expanded :show-heading="false" />
    </div>
    <footer>
      <button v-if="canCancelDay && !block.isCancelled" type="button" @click="emit('cancel-day', block.record.date)">Cancel day…</button>
      <button type="button" @click="emit('close')">Close</button>
    </footer>
  </dialog>
</template>

<style scoped>
.school-soft-dialog{width:min(680px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid #cbd5e1;border-radius:14px;color:#17283c;background:#fff;box-sizing:border-box;overflow:auto}
.school-soft-dialog::backdrop{background:#0f172a80}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;background:#f8fafc}
header{border-bottom:1px solid #d9e2ec}footer{border-top:1px solid #d9e2ec;justify-content:flex-end;flex-wrap:wrap}
h2{margin:0;font-size:1.25rem;overflow-wrap:anywhere}.eyebrow{margin:0 0 5px;font-size:.8rem;color:#456780;font-weight:700}.content{padding:4px 20px 16px;overflow-wrap:anywhere;line-height:1.5}
button{cursor:pointer;border:1px solid #b9c9d8;border-radius:8px;padding:9px 14px;background:white;color:inherit;font:inherit}button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
</style>
