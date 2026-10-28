<template>
  <dialog ref="dialog" class="enrollment-stop-dialog" aria-labelledby="enrollment-stop-title" aria-describedby="enrollment-stop-description" @cancel.prevent="!busy && $emit('cancel')">
    <h2 id="enrollment-stop-title">{{ title }}</h2>
    <p id="enrollment-stop-description">{{ description }}</p>
    <p v-if="error" class="stop-error" role="alert">{{ error }}</p>
    <div class="stop-actions">
      <button type="button" class="btn btn-primary" :disabled="busy" autofocus @click="$emit('cancel')">{{ keepLabel }}</button>
      <button type="button" class="btn stop-confirm" :disabled="busy" @click="$emit('confirm')">{{ busy ? busyLabel : confirmLabel }}</button>
    </div>
  </dialog>
</template>

<script setup>
import { onMounted, ref } from 'vue';
defineProps({ title: String, description: String, keepLabel: String, confirmLabel: String, busyLabel: String, error: String, busy: Boolean });
defineEmits(['cancel', 'confirm']);
const dialog = ref(null);
onMounted(() => dialog.value.showModal());
</script>

<style scoped>
.enrollment-stop-dialog { width: min(520px, calc(100% - 32px)); box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 14px; padding: 24px; color: #203e34; background: #fff; }
.enrollment-stop-dialog::backdrop { background: rgb(15 23 42 / 55%); }
h2 { margin: 0 0 14px; font-size: 1.4rem; }
p { line-height: 1.6; }
.stop-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
.stop-confirm { color: #a12828; border: 1px solid #a12828; background: #fff; }
.stop-error { padding: 12px; background: #fff1f2; color: #9f1239; border-radius: 8px; }
</style>
