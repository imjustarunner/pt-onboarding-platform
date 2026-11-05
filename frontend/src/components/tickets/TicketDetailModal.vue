<template>
  <Teleport to="body">
    <dialog ref="dialog" class="ticket-detail-modal conversa-surface" aria-labelledby="ticket-modal-title" @cancel.prevent="emit('close')" @click="onBackdrop">
      <header class="ticket-modal-header">
        <h2 id="ticket-modal-title">Ticket #{{ ticketId }}</h2>
        <button ref="closeButton" type="button" aria-label="Close ticket" @click="emit('close')">×</button>
      </header>
      <div class="ticket-modal-body">
        <TicketDeskView :key="`${agencyId}:${ticketId}`" embedded :initial-ticket-id="ticketId" :agency-id="agencyId" :sync-route="false" @updated="emit('updated', $event)" />
      </div>
    </dialog>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import TicketDeskView from './TicketDeskView.vue';

defineProps({ ticketId: { type: [Number, String], required: true }, agencyId: { type: [Number, String], default: null } });
const emit = defineEmits(['close', 'updated']);
const dialog = ref(null);
const closeButton = ref(null);
let previousFocus;
let previousOverflow;

function onBackdrop(event) {
  if (event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) emit('close');
}

onMounted(() => {
  previousFocus = document.activeElement;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.value.showModal();
  closeButton.value?.focus();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  document.body.style.overflow = previousOverflow;
  if (previousFocus?.isConnected) previousFocus.focus();
});
</script>

<style scoped>
.ticket-detail-modal { position: fixed; inset: 0; width: min(1240px, calc(100vw - 32px)); height: min(940px, calc(100dvh - 40px)); max-width: none; max-height: none; margin: auto; padding: 0; border: 1px solid var(--border, #cbd5e1); border-radius: 14px; color: var(--text-primary, #1f2937); background: var(--bg-card, #fff); overflow: hidden; }
.ticket-detail-modal[open] { display: flex; flex-direction: column; }
.ticket-detail-modal::backdrop { background: rgb(15 23 42 / 55%); }
.ticket-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border, #cbd5e1); }
.ticket-modal-header h2 { margin: 0; font-size: 1rem; }
.ticket-modal-header button { font-size: 1.6rem; border: 0; border-radius: 6px; color: inherit; background: transparent; padding: 0 8px; cursor: pointer; }
.ticket-modal-header button:focus-visible { outline: 2px solid var(--primary, #2d6a4f); }
.ticket-modal-body { flex: 1; min-height: 0; overflow: auto; }
@media (max-width: 600px) { .ticket-detail-modal { width: calc(100vw - 12px); height: calc(100dvh - 16px); border-radius: 10px; } }
</style>
