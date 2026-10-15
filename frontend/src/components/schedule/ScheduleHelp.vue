<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useAskAssistant } from '../../composables/useAskAssistant';
const assistant = useAskAssistant();
const root = ref(null); const open = ref(false);
const topics = [
  ['Schedule an appointment', 'Click an empty hour, choose a quarter-hour from the + control, or drag across a time range. Choose Book Session, select the client, and review before saving.'],
  ['Cancel one appointment', 'Open the appointment and choose Change appointment. Enter the reason to share with the client, review follow-up and the generated note, then confirm.'],
  ['Cancel a provider’s day', 'Use Cancel day for the selected provider and date. Review affected appointments, hosted meetings and openings before confirming. Other recurring dates remain scheduled.'],
  ['Remove an opening', 'Open the published availability and choose Remove availability. Choose this occurrence or this and future occurrences. Existing appointments and room reservations stay booked.'],
  ['Contact a client', 'Open the scheduled appointment. Under Info, choose Text, message or email client · Conversa. Select the client/contact and channel, then review your message before sending.'],
  ['Leave a staff reminder', 'Open the appointment and add an Internal appointment alert. Staff with full schedule access can see the flag; clients cannot.'],
  ['See earlier or later times', 'The schedule includes the earliest and latest timed events. Use the hours control above the time labels to show all 24 hours.']
];
function closeOutside(event) { if (!root.value?.contains(event.target)) open.value = false; }
function ask() { open.value = false; assistant.openAsk('', 'ask'); }
onMounted(() => document.addEventListener('click', closeOutside));
onBeforeUnmount(() => document.removeEventListener('click', closeOutside));
</script>
<template>
  <div ref="root" class="schedule-help" @keydown.esc="open = false">
    <button type="button" class="schedule-help__trigger" :aria-expanded="open" @click="open = !open">? How do I…</button>
    <section v-if="open" class="schedule-help__panel" aria-label="Schedule help">
      <header><strong>Schedule help</strong><button type="button" aria-label="Close schedule help" @click="open = false">×</button></header>
      <details v-for="[title, answer] in topics" :key="title"><summary>{{ title }}</summary><p>{{ answer }}</p></details>
      <button type="button" class="schedule-help__ask" @click="ask">Ask the assistant…</button>
      <p class="schedule-help__hint">Ask for guidance or help finding a time. Review scheduling changes before confirming them.</p>
    </section>
  </div>
</template>
<style scoped>
.schedule-help{position:relative}.schedule-help__trigger{white-space:nowrap}.schedule-help button{font:inherit;cursor:pointer;border:1px solid var(--border,#cbd5e1);border-radius:8px;padding:7px 10px;background:var(--bg-card,#fff);color:inherit}.schedule-help__panel{position:absolute;right:0;top:calc(100% + 6px);width:min(370px,calc(100vw - 40px));max-height:65vh;overflow:auto;z-index:90;border:1px solid var(--border,#cbd5e1);border-radius:12px;padding:14px;background:var(--bg-card,#fff);color:var(--text-primary,#17233a);box-shadow:0 12px 36px #17233a25}.schedule-help header{display:flex;justify-content:space-between;gap:12px;align-items:center}.schedule-help details{border-bottom:1px solid #cbd5e155;padding:10px 0}.schedule-help summary{cursor:pointer;font-size:13px;font-weight:600}.schedule-help p{font-size:13px;line-height:1.5;margin:8px 0}.schedule-help__ask{margin-top:12px}.schedule-help__hint{color:var(--text-secondary,#64748b)}
</style>
