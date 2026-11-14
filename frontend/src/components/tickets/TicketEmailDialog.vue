<template>
  <Teleport to="body">
    <dialog ref="dialog" class="ticket-email-dialog" :aria-label="title" @cancel.prevent="$emit('close')" @click="closeBackdrop">
      <header><strong>{{ title }}</strong><button type="button" @click="$emit('close')">Close {{ title.toLowerCase().includes('preview') ? 'preview' : 'history' }} ×</button></header>
      <div class="email-dialog-content"><slot /></div>
    </dialog>
  </Teleport>
</template>
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
defineProps({ title: { type: String, required: true } });
const emit = defineEmits(['close']);
const dialog = ref(null);
let previousFocus;
function closeBackdrop(event) {
  if (event.target !== dialog.value) return;
  const box = dialog.value.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) emit('close');
}
onMounted(() => { previousFocus = document.activeElement; dialog.value.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); if (previousFocus?.isConnected) previousFocus.focus(); });
</script>
<style scoped>
.ticket-email-dialog{width:min(880px,calc(100vw - 24px));max-height:calc(100dvh - 32px);padding:0;margin:auto;border:1px solid #cbd5e1;border-radius:12px;color:var(--text-primary,#172b3a);background:var(--bg-card,#fff)}
.ticket-email-dialog::backdrop{background:rgb(15 23 42 / 50%)}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;position:sticky;top:0;background:var(--bg-card,#fff);border-bottom:1px solid #dce5f0;z-index:1}
button{font:inherit;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
.email-dialog-content{padding:12px;overflow:auto}.email-dialog-content :deep(.sent-email-preview){max-width:760px;margin:0 auto}.email-dialog-content :deep(img){max-width:100%;height:auto}.email-dialog-content :deep(table){max-width:100%}
</style>
