<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { emailDeliveryLabel } from '../../utils/emailPresentation';
const props = defineProps({ receipt: { type: Object, required: true }, checkStatus: { type: Function, required: true }, busy: Boolean });
const emit = defineEmits(['undo', 'status']);
const message = ref(null), now = ref(Date.now()), refreshError = ref(false), checking = ref(false);
let timer, generation = 0;
const state = computed(() => message.value?.send_status || (props.receipt.cancelled ? 'cancelled' : props.receipt.sent ? 'sent' : props.receipt.scheduled ? 'scheduled' : 'pending'));
const scheduledAt = computed(() => message.value?.scheduled_send_at || props.receipt.scheduledSendAt);
const seconds = computed(() => Math.max(0, Math.ceil((new Date(scheduledAt.value).getTime() - now.value) / 1000)) || 0);
const canUndo = computed(() => state.value === 'scheduled' && !!props.receipt.messageId);
const label = computed(() => state.value === 'scheduled'
  ? (seconds.value > 0 ? `Email scheduled for ${new Date(scheduledAt.value).toLocaleString()}. Not sent yet.` : 'Email queued for delivery. Not sent yet.')
  : emailDeliveryLabel({ ...message.value, direction: 'outbound', send_status: state.value }));
const remaining = computed(() => seconds.value >= 60 ? `${Math.floor(seconds.value / 60)}m ${seconds.value % 60}s` : `${seconds.value}s`);
async function refresh() {
  if (checking.value || !props.receipt.messageId) return;
  const current = generation;
  checking.value = true;
  try {
    const result = await props.checkStatus(props.receipt);
    if (current !== generation) return;
    if (!result) throw new Error('Message status unavailable');
    const previousState = state.value;
    message.value = result; refreshError.value = false;
    if (state.value !== previousState) emit('status', { state: state.value, label: label.value });
    if (['sent', 'failed', 'cancelled'].includes(state.value)) clearInterval(timer);
  } catch { if (current === generation) refreshError.value = true; }
  finally { if (current === generation) checking.value = false; }
}
watch(() => props.receipt, () => {
  generation++; clearInterval(timer); message.value = null; checking.value = false; refreshError.value = false; now.value = Date.now();
  // An expired countdown is never evidence of a successful send.
  let ticks = 0;
  if (!['sent', 'cancelled'].includes(state.value)) timer = setInterval(() => { now.value = Date.now(); if (++ticks % 5 === 0) void refresh(); }, 1000);
}, { immediate: true });
onUnmounted(() => { generation++; clearInterval(timer); });
</script>
<template>
  <section class="send-receipt" aria-label="Email delivery status">
    <p role="status">{{ label }}</p>
    <p v-if="canUndo">{{ seconds > 0 ? `You can undo for ${remaining} before the scheduled send.` : 'You can still cancel until sending begins.' }}</p>
    <button v-if="canUndo" type="button" :disabled="busy" @click="emit('undo')">Undo send — keep editing</button>
    <button v-if="receipt.messageId" type="button" :disabled="checking || busy" @click="refresh">Check delivery status</button>
    <p v-if="refreshError" role="alert">Could not refresh delivery status. The status above is the last confirmed update; please check again.</p>
  </section>
</template>
<style scoped>
.send-receipt{padding:16px;border:1px solid var(--border-color,#a5b9af);border-radius:8px}.send-receipt p{margin:0 0 10px}.send-receipt button{margin:0 10px 6px 0;font:inherit;padding:8px 12px;cursor:pointer}
</style>
